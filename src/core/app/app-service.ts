/**
 * Servicio de aplicación: toda la lógica que antes vivía en los manejadores IPC
 * de Electron (FR-044, ADR-012).
 *
 * En el PC lo invoca el proceso principal a través del canal IPC; en Android lo
 * invoca la propia interfaz, en el mismo proceso y sin canal. Es el punto que
 * garantiza que las dos plataformas hacen exactamente lo mismo: si aquí se
 * arregla un caso, se arregla en las dos.
 *
 * Valida su entrada aunque en Android la llamada venga de nuestro propio
 * código: un solo camino, un solo comportamiento (NFR-008).
 */

import type {
  AgentRun,
  AgentRunSummary,
  AgentStatus,
  CatalogFacets,
  CatalogPage,
  SecretsStatus,
  Settings,
  TitleView,
  UserRating,
  WatchedStats,
} from '../../shared/types';
import type { AgentProgress } from '../../shared/types';
import {
  parseCatalogQuery,
  parseExternalUrl,
  parseImportInput,
  parseRunsLimit,
  parseSecrets,
  parseSetScores,
  parseSetWatched,
  parseSettingsPatch,
  parseTitleId,
  parseVerifySecret,
  ValidationError,
} from '../../shared/validate';
import { applyQualityFloor } from '../domain/filters';
import { sanitizeScores } from '../domain/criteria';
import { buildSampleCatalog } from '../domain/sample-catalog';
import { sanitizeMessage } from '../providers/http';
import { ensureScheduled } from '../agent/scheduler';
import { summarize } from '../store/runs';
import {
  applyBundle,
  buildExportBundle,
  parseBundle,
  wipeAll,
  type ExportBundle,
  type ImportOutcome,
} from '../store/transfer';
import { AppContainer } from './container';

/** Falta una clave de API sin la que la operación no tiene sentido (FR-042). */
export class MissingApiKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissingApiKeyError';
  }
}

/** Guardado de claves. Cada plataforma lo resuelve a su manera (FR-035, FR-047). */
export interface SecretsVault {
  get(name: 'tmdb' | 'omdb'): string | null;
  set(values: Partial<Record<'tmdb' | 'omdb', string>>): Promise<void>;
  status(): SecretsStatus;
  wipe(): Promise<void>;
}

export type AppEvent =
  | { type: 'agent:progress'; payload: AgentProgress }
  | { type: 'agent:done'; payload: AgentRunSummary }
  | { type: 'catalog:changed'; payload: { reason: 'agent' | 'import' | 'wipe' | 'rating' } };

export interface AppServiceOptions {
  container: AppContainer;
  secrets: SecretsVault;
  appVersion: string;
  /** Notificación de cambios. En el PC viaja por IPC; en Android es una llamada. */
  emit?: (event: AppEvent) => void;
}

export class AppService {
  private readonly container: AppContainer;
  private readonly secrets: SecretsVault;
  private readonly appVersion: string;
  private readonly emit: (event: AppEvent) => void;

  constructor(options: AppServiceOptions) {
    this.container = options.container;
    this.secrets = options.secrets;
    this.appVersion = options.appVersion;
    this.emit = options.emit ?? (() => undefined);
  }

  // --- Catálogo ------------------------------------------------------------

  catalogQuery(input: unknown): CatalogPage {
    const query = applyQualityFloor(
      parseCatalogQuery(input),
      this.container.settings.get().quality,
    );
    return this.container.service.query(query);
  }

  catalogGet(input: unknown): TitleView | null {
    const id = parseTitleId(typeof input === 'string' ? input : (input as { id?: unknown })?.id);
    return this.container.service.get(id);
  }

  catalogFacets(): CatalogFacets {
    const { minCritic, includeUnrated } = this.container.settings.get().quality;
    return this.container.service.facets(
      undefined,
      minCritic > 0 ? { minCritic, includeUnrated } : undefined,
    );
  }

  // --- Valoraciones --------------------------------------------------------

  async ratingsSetWatched(input: unknown): Promise<UserRating> {
    const parsed = parseSetWatched(input);
    const rating = await this.container.ratings.setWatched(parsed.titleId, parsed.watched, {
      watchedAt: parsed.watchedAt ?? null,
      platform: parsed.platform ?? null,
    });
    this.emit({ type: 'catalog:changed', payload: { reason: 'rating' } });
    return rating;
  }

  async ratingsSetScores(input: unknown): Promise<UserRating> {
    const parsed = parseSetScores(input, this.container.settings.get().criteria, sanitizeScores);
    const rating = await this.container.ratings.setScores(
      parsed.titleId,
      parsed.scores,
      parsed.notes,
    );
    this.emit({ type: 'catalog:changed', payload: { reason: 'rating' } });
    return rating;
  }

  async ratingsClear(input: unknown): Promise<{ ok: true }> {
    const id = parseTitleId(
      typeof input === 'string' ? input : (input as { titleId?: unknown })?.titleId,
    );
    await this.container.ratings.clear(id);
    this.emit({ type: 'catalog:changed', payload: { reason: 'rating' } });
    return { ok: true };
  }

  ratingsStats(): WatchedStats {
    return this.container.service.stats();
  }

  // --- Agente --------------------------------------------------------------

  async agentRun(): Promise<AgentRunSummary> {
    if (!this.container.hasKeys()) {
      throw new MissingApiKeyError(
        'Falta la clave de API de TMDB. Configúrala en Ajustes para poder recopilar.',
      );
    }

    const run = await this.container.runAgent({ trigger: 'manual' }, (progress) =>
      this.emit({ type: 'agent:progress', payload: progress }),
    );
    const summary = summarize(run);

    this.emit({ type: 'agent:done', payload: summary });
    this.emit({ type: 'catalog:changed', payload: { reason: 'agent' } });
    return summary;
  }

  agentStatus(): AgentStatus {
    const schedule = this.container.settings.get().schedule;
    const last = this.container.runs.last();
    return {
      running: this.container.isRunning,
      currentStage: null,
      lastRunAt: schedule.lastRunAt,
      nextRunAt: schedule.nextRunAt,
      lastStatus: last?.status ?? null,
      hasKeys: this.container.hasKeys(),
    };
  }

  agentRuns(input: unknown): AgentRun[] {
    return this.container.runs.list(parseRunsLimit(input));
  }

  /**
   * Ejecución vencida, si la hay (FR-001, FR-002, FR-046).
   *
   * En el PC lo llama un temporizador; en Android, el arranque y la vuelta a
   * primer plano. Devuelve `null` si no tocaba, para que quien llama no tenga
   * que interpretar nada.
   */
  async runIfDue(): Promise<AgentRunSummary | null> {
    const trigger = this.container.pendingTrigger();
    if (!trigger || !this.container.hasKeys() || this.container.isRunning) return null;

    const run = await this.container.runAgent({ trigger }, (progress) =>
      this.emit({ type: 'agent:progress', payload: progress }),
    );
    const summary = summarize(run);

    this.emit({ type: 'agent:done', payload: summary });
    this.emit({ type: 'catalog:changed', payload: { reason: 'agent' } });
    return summary;
  }

  // --- Ajustes -------------------------------------------------------------

  settingsGet(): Settings {
    return this.container.settings.get();
  }

  async settingsUpdate(input: unknown): Promise<Settings> {
    const patch = parseSettingsPatch(input);
    const updated = await this.container.settings.update(patch);

    // Cambiar día u hora reprograma el próximo vencimiento (FR-001).
    if (patch.schedule) {
      return this.container.settings.update({
        schedule: ensureScheduled({ ...updated.schedule, nextRunAt: null }, new Date()),
      });
    }
    return updated;
  }

  // --- Claves --------------------------------------------------------------

  async secretsSet(input: unknown): Promise<SecretsStatus> {
    await this.secrets.set(parseSecrets(input));
    return this.secrets.status();
  }

  secretsStatus(): SecretsStatus {
    return this.secrets.status();
  }

  async secretsVerify(input: unknown): Promise<{ ok: boolean; message: string }> {
    const { which } = parseVerifySecret(input);
    const settings = this.container.settings.get();
    const client = which === 'tmdb' ? this.container.tmdb(settings) : this.container.omdb(settings);

    if (!client) {
      return { ok: false, message: `No hay ninguna clave de ${which.toUpperCase()} guardada.` };
    }
    const result = await client.verifyKey();
    return { ok: result.ok, message: sanitizeMessage(result.message) };
  }

  // --- Datos ---------------------------------------------------------------

  /**
   * Paquete de exportación (FR-037). Dónde se guarda es cosa de la plataforma:
   * un diálogo de archivo en el PC, la carpeta de descargas en Android.
   */
  buildExport(): ExportBundle {
    return buildExportBundle(this.stores(), this.appVersion);
  }

  /** Aplica un paquete ya leído por la plataforma (FR-038). */
  async applyImport(raw: unknown, options: unknown): Promise<ImportOutcome> {
    const { overwriteRatings } = parseImportInput(options);
    const outcome = await applyBundle(this.stores(), parseBundle(raw), overwriteRatings);
    this.emit({ type: 'catalog:changed', payload: { reason: 'import' } });
    return outcome;
  }

  /**
   * Carga el catálogo de ejemplo (FR-051), para poder probar filtros y
   * valoración sin configurar ninguna clave.
   */
  async loadSamples(): Promise<{ loaded: number }> {
    const titles = buildSampleCatalog(new Date());
    const outcome = await this.container.catalog.upsertMany(titles);
    this.emit({ type: 'catalog:changed', payload: { reason: 'import' } });
    return { loaded: outcome.created + outcome.updated };
  }

  /** Retira los títulos de ejemplo sin tocar nada más (FR-051). */
  async clearSamples(): Promise<{ removed: number }> {
    const removed = await this.container.catalog.removeSamples();
    this.emit({ type: 'catalog:changed', payload: { reason: 'import' } });
    return { removed };
  }

  hasSamples(): boolean {
    return this.container.catalog.hasSamples();
  }

  async dataWipe(): Promise<{ ok: true }> {
    await wipeAll(this.stores());
    await this.secrets.wipe();
    this.container.cache.clear();
    await this.container.saveCache();
    this.emit({ type: 'catalog:changed', payload: { reason: 'wipe' } });
    return { ok: true };
  }

  /** Solo `http:` y `https:` (Art. VI.3). Quien abra el enlace es la plataforma. */
  resolveExternalUrl(input: unknown): string {
    return parseExternalUrl(input);
  }

  private stores() {
    return {
      catalog: this.container.catalog,
      ratings: this.container.ratings,
      settings: this.container.settings,
      runs: this.container.runs,
    };
  }
}

export { ValidationError };
