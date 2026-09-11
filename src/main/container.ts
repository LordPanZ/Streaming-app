/**
 * Composición de dependencias (ADR-011).
 *
 * Es el único sitio donde se ensamblan almacenes, cliente HTTP, proveedores,
 * servicio y agente. El proceso principal de Electron y el ejecutor de consola
 * usan exactamente este contenedor, así que no pueden divergir de comportamiento.
 */

import type {
  AgentProgress,
  AgentRun,
  RunTrigger,
  Settings,
} from '../shared/types';
import { ResponseCache } from '../core/providers/cache';
import { HttpClient } from '../core/providers/http';
import { OmdbClient } from '../core/providers/omdb';
import { TmdbClient } from '../core/providers/tmdb';
import { YoutubeVerifier } from '../core/providers/youtube';
import { CatalogStore } from '../core/store/catalog';
import { RatingsStore } from '../core/store/ratings';
import { RunsStore } from '../core/store/runs';
import { SettingsStore } from '../core/store/settings';
import { CatalogService } from '../core/service/catalog-service';
import { runWeeklyAgent, type RunOptions } from '../core/agent/pipeline';
import { advanceSchedule, dueReason, ensureScheduled } from '../core/agent/scheduler';
import type { AgentDeps } from '../core/agent/context';
import { STORAGE_KEYS, type KeyValueStorage } from '../core/store/storage';

export interface KeyProvider {
  get(name: 'tmdb' | 'omdb'): string | null;
}

export interface ContainerOptions {
  /** Almacenamiento de la plataforma (ADR-013). */
  storage: KeyValueStorage;
  keys: KeyProvider;
  now?: () => Date;
  /** `fetch` de la plataforma: el de Node en el PC, el nativo en Android. */
  fetchImpl?: typeof globalThis.fetch;
  /** Se avisa cuando un documento corrupto se aparta, para poder registrarlo. */
  onRecover?: (message: string) => void;
}

export class AppContainer {
  readonly storage: KeyValueStorage;
  readonly catalog: CatalogStore;
  readonly ratings: RatingsStore;
  readonly settings: SettingsStore;
  readonly runs: RunsStore;
  readonly service: CatalogService;
  readonly http: HttpClient;
  readonly cache: ResponseCache;

  private readonly keys: KeyProvider;
  private readonly now: () => Date;
  private running = false;

  constructor(options: ContainerOptions) {
    this.storage = options.storage;
    this.keys = options.keys;
    this.now = options.now ?? (() => new Date());

    const onRecover = options.onRecover
      ? (info: { key: string; reason: string }) =>
          options.onRecover?.(`Documento dañado apartado: ${info.key} (${info.reason})`)
      : undefined;

    this.catalog = new CatalogStore(this.storage, onRecover);
    this.ratings = new RatingsStore(this.storage, onRecover);
    this.settings = new SettingsStore(this.storage, onRecover);
    this.runs = new RunsStore(this.storage, onRecover);

    this.cache = new ResponseCache(() => this.now().getTime());
    this.http = new HttpClient({
      cache: this.cache,
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    });

    this.service = new CatalogService(this.catalog, this.ratings, () => this.settings.get());
  }

  async load(): Promise<void> {
    await Promise.all([
      this.catalog.load(),
      this.ratings.load(),
      this.settings.load(),
      this.runs.load(),
    ]);
    await this.loadCache();

    // Programa la primera ejecución si aún no hay ninguna (FR-001).
    const settings = this.settings.get();
    const scheduled = ensureScheduled(settings.schedule, this.now());
    if (scheduled.nextRunAt !== settings.schedule.nextRunAt) {
      await this.settings.update({ schedule: scheduled });
    }
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** ¿Toca ejecutar el agente ahora? (FR-001, FR-002) */
  pendingTrigger(): RunTrigger | null {
    const reason = dueReason(this.settings.get().schedule, this.now());
    if (reason === null) return null;
    return reason === 'catchup' ? 'catchup' : 'scheduled';
  }

  tmdb(settings: Settings): TmdbClient | null {
    const key = this.keys.get('tmdb');
    if (!key) return null;
    return new TmdbClient({
      apiKey: key,
      http: this.http,
      cacheTtlMs: settings.cacheTtlHours * 3_600_000,
    });
  }

  omdb(settings: Settings): OmdbClient | null {
    const key = this.keys.get('omdb');
    if (!key) return null;
    return new OmdbClient({
      apiKey: key,
      http: this.http,
      cacheTtlMs: settings.cacheTtlHours * 3_600_000,
    });
  }

  hasKeys(): boolean {
    return this.keys.get('tmdb') !== null;
  }

  /**
   * Ejecuta el agente. Rechaza si ya hay una ejecución en curso (FR-003): dos
   * tuberías escribiendo el mismo catálogo a la vez es exactamente lo que la
   * escritura atómica no puede arreglar.
   */
  async runAgent(
    options: RunOptions,
    onProgress?: (progress: AgentProgress) => void,
  ): Promise<AgentRun> {
    if (this.running) {
      throw new AgentBusyError();
    }
    this.running = true;

    try {
      const settings = this.settings.get();
      const deps: AgentDeps = {
        tmdb: this.tmdb(settings),
        omdb: this.omdb(settings),
        youtube: new YoutubeVerifier(this.http),
        http: this.http,
        catalog: this.catalog,
        settings,
        now: this.now,
        ...(onProgress ? { onProgress } : {}),
      };

      const run = await runWeeklyAgent(deps, options);
      await this.runs.append(run);
      await this.settings.update({
        schedule: advanceSchedule(settings.schedule, this.now(), true),
      });
      await this.saveCache();
      return run;
    } finally {
      this.running = false;
    }
  }

  private async loadCache(): Promise<void> {
    try {
      const raw = await this.storage.read(STORAGE_KEYS.cache);
      if (raw === null) return;
      const restored = ResponseCache.fromSnapshot(JSON.parse(raw), () => this.now().getTime());
      for (const [url, value] of Object.entries(restored.toSnapshot().entries)) {
        this.cache.set(url, value.value, value.expiresAt - this.now().getTime());
      }
    } catch {
      // Sin caché previa o ilegible: se empieza en frío, que solo cuesta tiempo.
    }
  }

  async saveCache(): Promise<void> {
    try {
      await this.storage.write(
        STORAGE_KEYS.cache,
        JSON.stringify(this.cache.toSnapshot()),
      );
    } catch {
      // La caché es prescindible por definición: si no se puede guardar, no
      // vale la pena molestar al usuario.
    }
  }
}

export class AgentBusyError extends Error {
  constructor() {
    super('Ya hay una recopilación en curso.');
    this.name = 'AgentBusyError';
  }
}
