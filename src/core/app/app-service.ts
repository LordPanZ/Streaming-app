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
  RankingEntry,
  RankingResult,
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
  parseRankingInput,
  parseRunsLimit,
  parseSecrets,
  parseSetInterested,
  parseSetScores,
  parseSetWatched,
  parseSettingsPatch,
  parseTitleId,
  parseVerifySecret,
  ValidationError,
} from '../../shared/validate';
import { applyCatalogDefaults } from '../domain/filters';
import { collectTopOfYear } from '../agent/top-year';
import type { RankedTitle } from '../domain/ranking';
import { resolvePlatforms, PLATFORMS } from '../domain/platforms';
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
    const query = applyCatalogDefaults(
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
    const { minCritic, includeUnrated, excludeAnimation } = this.container.settings.get().quality;
    const filters = minCritic > 0 || excludeAnimation;
    return this.container.service.facets(
      undefined,
      filters ? { minCritic, includeUnrated, excludeAnimation } : undefined,
    );
  }

  // --- Clasificación por año (FR-058) --------------------------------------

  /**
   * Las diez mejores películas y series de un año, por la media simple de
   * IMDb, Rotten Tomatoes y TMDB.
   *
   * No toca el catálogo: consulta, responde y se va. La clasificación de un año
   * cerrado no es «lo que hay esta semana» y mezclarlas dejaría el catálogo
   * lleno de títulos viejos que el usuario no pidió recopilar.
   */
  async rankingTopOfYear(input: unknown): Promise<RankingResult> {
    const parsed = parseRankingInput(input);
    const settings = this.container.settings.get();
    const tmdb = this.container.tmdb(settings);
    if (!tmdb) throw new MissingApiKeyError('tmdb');

    // Los identificadores de proveedor se resuelven contra el catálogo de la
    // región, igual que en la recopilación semanal (FR-006).
    const catalog = [
      ...(await tmdb.providerCatalog('movie').catch(() => [])),
      ...(await tmdb.providerCatalog('series').catch(() => [])),
    ];
    const enabled = PLATFORMS.filter(
      (platform) => settings.platforms[platform.id] !== false,
    ).map((platform) => platform.id);
    const resolved = resolvePlatforms(enabled, catalog);

    if (resolved.resolved.length === 0) {
      throw new Error('No hay ninguna plataforma activa que consultar.');
    }

    const providerIds = resolved.resolved.map((platform) => platform.providerId);
    const omdb = this.container.omdb(settings);
    const before = this.container.http.metrics.requests;

    const deps = { tmdb, omdb, now: () => new Date() };
    const options = {
      year: parsed.year,
      providerIds,
      limit: parsed.limit ?? 10,
      excludeAnimation: settings.quality.excludeAnimation,
      // Dos páginas son 40 candidatos por lista. Subirlo mejora poco la cabeza
      // de la lista y multiplica el gasto de cuota de OMDb, que es diaria.
      candidatePages: 2,
    };

    const movies = await collectTopOfYear(deps, { ...options, mediaType: 'movie' });
    const series = await collectTopOfYear(deps, { ...options, mediaType: 'series' });

    return {
      year: parsed.year,
      movies: movies.ranked.map(toEntry),
      series: series.ranked.map(toEntry),
      considered: movies.considered + series.considered,
      requests: this.container.http.metrics.requests - before,
      issues: [...movies.issues, ...series.issues],
    };
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

  async ratingsSetInterested(input: unknown): Promise<UserRating> {
    const parsed = parseSetInterested(input);
    const rating = await this.container.ratings.setInterested(parsed.titleId, parsed.interested);
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

/** Pasa una entrada clasificada a lo que cruza la frontera (FR-058). */
function toEntry(ranked: RankedTitle): RankingEntry {
  return {
    titleId: ranked.title.id,
    title: ranked.title.title,
    year: ranked.title.year,
    mediaType: ranked.title.mediaType,
    score: ranked.score.score ?? 0,
    sources: ranked.score.sources,
    platforms: ranked.title.platforms.map((platform) => platform.name),
  };
}
