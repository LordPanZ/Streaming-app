/**
 * Tipos de datos compartidos por las tres capas (núcleo, proceso principal e
 * interfaz). Reflejan literalmente `specs/001-estrenos-streaming-es/data-model.md`.
 * Este archivo no importa nada: es la frontera común.
 */

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

export type MediaType = 'movie' | 'series';

/** Referencia a una plataforma de streaming disponible en España. */
export interface PlatformRef {
  id: string;
  name: string;
  providerId: number;
  logoUrl: string | null;
  link: string | null;
}

/**
 * Notas de crítica por fuente. `null` significa "sin datos" y nunca debe
 * sustituirse por cero (FR-014).
 */
export interface CriticRatings {
  /** 0–10 */
  imdb: number | null;
  /** 0–100, Tomatometer de crítica */
  rottenTomatoes: number | null;
  /** 0–100 */
  metacritic: number | null;
  /** 0–10 */
  tmdb: number | null;
  imdbVotes: number | null;
  fetchedAt: string | null;
}

export type TrailerLanguage = 'es' | 'original' | 'unknown';
export type TrailerKind = 'trailer' | 'teaser' | 'clip';
/** `live` exige verificación efectiva contra YouTube (FR-017). */
export type TrailerLiveness = 'live' | 'dead' | 'unverified';

export interface Trailer {
  youtubeId: string;
  url: string;
  title: string;
  language: TrailerLanguage;
  kind: TrailerKind;
  liveness: TrailerLiveness;
  checkedAt: string | null;
  /** Búsqueda de respaldo en YouTube (FR-018). */
  searchFallbackUrl: string;
}

export interface Title {
  id: string;
  mediaType: MediaType;
  title: string;
  originalTitle: string;
  year: number | null;
  overview: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  runtimeMinutes: number | null;
  seasons: number | null;
  /** Nunca vacío: `['Sin clasificar']` si la fuente no declara ninguno (FR-012). */
  genres: string[];
  /** Nunca vacío: un título sin plataforma no se persiste. */
  platforms: PlatformRef[];
  /** Fecha ISO (YYYY-MM-DD) de disponibilidad en España. */
  availableFrom: string;
  /** Semana ISO de estreno, `YYYY-Www`. */
  releaseWeek: string;
  imdbId: string | null;
  ratings: CriticRatings;
  trailer: Trailer | null;
  firstSeenAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Valoración del usuario
// ---------------------------------------------------------------------------

export interface UserRating {
  titleId: string;
  watched: boolean;
  watchedAt: string | null;
  watchedOnPlatform: string | null;
  /** Disperso: solo los criterios efectivamente puntuados (FR-024, FR-025). */
  scores: Record<string, number>;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface RatingCriterion {
  id: string;
  label: string;
  description: string;
  /** Peso relativo > 0. Se normaliza al calcular (FR-023). */
  weight: number;
  enabled: boolean;
  order: number;
}

// ---------------------------------------------------------------------------
// Notas derivadas (nunca se persisten: se calculan en cada lectura)
// ---------------------------------------------------------------------------

export type Confidence = 'none' | 'low' | 'medium' | 'high';

export interface AggregateCritic {
  /** 0–10, o `null` si no hay ninguna fuente (FR-015). */
  score: number | null;
  confidence: Confidence;
  /** Fuentes que han contribuido, para poder explicarlo en la interfaz. */
  sources: Array<{ source: CriticSource; normalized: number; weight: number }>;
}

export type CriticSource = 'imdb' | 'rottenTomatoes' | 'metacritic' | 'tmdb';

export interface PersonalScore {
  /** 0–10 con un decimal, o `null` si no hay criterios puntuados (FR-024). */
  score: number | null;
  /** Cuántos criterios activos se han puntuado. */
  scoredCriteria: number;
  totalCriteria: number;
  breakdown: Array<{ criterionId: string; label: string; value: number; normalizedWeight: number }>;
}

// ---------------------------------------------------------------------------
// Agente
// ---------------------------------------------------------------------------

export type RunTrigger = 'scheduled' | 'manual' | 'catchup' | 'cli';
export type RunStatus = 'success' | 'partial' | 'failed';
export type StageName = 'discover' | 'enrich' | 'rate' | 'trailer' | 'persist';

export interface RunIssue {
  stage: StageName;
  source: string;
  titleId?: string;
  titleName?: string;
  message: string;
  severity: 'warn' | 'error';
}

export interface StageReport {
  stage: StageName;
  startedAt: string;
  durationMs: number;
  processed: number;
  failed: number;
}

export interface HttpMetrics {
  requests: number;
  cacheHits: number;
  retries: number;
  rateLimited: number;
}

export interface AgentRun {
  id: string;
  trigger: RunTrigger;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  status: RunStatus;
  window: { from: string; to: string };
  platformsQueried: string[];
  counts: { discovered: number; created: number; updated: number; skipped: number };
  perPlatform: Record<string, number>;
  http: HttpMetrics;
  stages: StageReport[];
  issues: RunIssue[];
}

export type AgentRunSummary = Pick<
  AgentRun,
  'id' | 'trigger' | 'startedAt' | 'finishedAt' | 'durationMs' | 'status' | 'counts'
> & { issueCount: number };

export interface AgentStatus {
  running: boolean;
  currentStage: StageName | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastStatus: RunStatus | null;
  hasKeys: boolean;
}

export interface AgentProgress {
  runId: string;
  stage: StageName;
  done: number;
  total: number;
  message: string;
}

// ---------------------------------------------------------------------------
// Ajustes
// ---------------------------------------------------------------------------

export interface ScheduleSettings {
  enabled: boolean;
  /** 0 = domingo … 6 = sábado */
  weekday: number;
  /** 0–23, hora local */
  hour: number;
  nextRunAt: string | null;
  lastRunAt: string | null;
}

export interface WindowSettings {
  lookbackDays: number;
  graceDays: number;
}

export interface Settings {
  schemaVersion: number;
  schedule: ScheduleSettings;
  window: WindowSettings;
  /** Identificador de plataforma → activa. */
  platforms: Record<string, boolean>;
  criteria: RatingCriterion[];
  revalidateTrailerWeeks: number;
  cacheTtlHours: number;
}

// ---------------------------------------------------------------------------
// Consultas de catálogo
// ---------------------------------------------------------------------------

export type SortField = 'date' | 'critic' | 'personal' | 'title';
export type SortOrder = 'asc' | 'desc';
export type WatchStatusFilter = 'all' | 'watched' | 'pending' | 'rated';

export interface CatalogQuery {
  text?: string;
  mediaType?: MediaType | 'all';
  platforms?: string[];
  genres?: string[];
  /** `YYYY-Www`, `current` o `all`. */
  week?: string;
  minCritic?: number;
  status?: WatchStatusFilter;
  sort?: SortField;
  order?: SortOrder;
  offset?: number;
  limit?: number;
}

/** Un título con todo lo derivado ya calculado, listo para pintar. */
export interface TitleView {
  title: Title;
  critic: AggregateCritic;
  rating: UserRating | null;
  personal: PersonalScore | null;
  /** Nota personal menos índice de crítica (FR-027). */
  delta: number | null;
}

export interface CatalogPage {
  items: TitleView[];
  total: number;
  offset: number;
  limit: number;
}

export interface CatalogFacets {
  genres: Array<{ value: string; count: number }>;
  platforms: Array<{ value: string; name: string; count: number }>;
  weeks: Array<{ value: string; count: number }>;
  currentWeek: string;
  totalTitles: number;
}

export interface WatchedStats {
  totalWatched: number;
  totalRated: number;
  averagePersonal: number | null;
  averageCritic: number | null;
  byGenre: Array<{ genre: string; watched: number; averagePersonal: number | null }>;
  byPlatform: Array<{ platform: string; name: string; watched: number }>;
  topRated: Array<{ titleId: string; title: string; score: number }>;
}

export interface SecretsStatus {
  tmdb: { present: boolean; hint: string | null };
  omdb: { present: boolean; hint: string | null };
  /** `false` si el sistema operativo no ofrece cifrado; se avisa al usuario. */
  encryptionAvailable: boolean;
}

export interface ImportResult {
  titlesImported: number;
  ratingsImported: number;
  ratingsSkipped: number;
  settingsImported: boolean;
}
