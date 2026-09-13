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
  /** Reparto principal, hasta seis nombres. Vacío si la fuente no lo declara. */
  cast: string[];
  /** Dirección; en las series, quien la crea. */
  directors: string[];
  /**
   * Marca de título de ejemplo (FR-051). Ausente en todo lo que venga de una
   * recopilación real: así la interfaz nunca puede confundir uno con otro.
   */
  sample?: boolean;
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
  /**
   * «Me interesa verla» (FR-054). Es una intención, no un juicio: marca lo que
   * el usuario quiere ver, y se apaga sola al marcarlo como visto.
   */
  interested: boolean;
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

/**
 * Listón de calidad del catálogo (FR-053).
 *
 * Se guarda en los ajustes en vez de vivir solo en la barra de filtros porque
 * el usuario lo pone una vez y espera que mande siempre, también al abrir la
 * aplicación al día siguiente.
 */
export interface QualitySettings {
  /** Índice de crítica mínimo, 0–10. `0` desactiva el listón. */
  minCritic: number;
  /**
   * Qué hacer con lo que todavía nadie ha puntuado.
   *
   * Un estreno de esta semana suele no tener ficha en IMDb ni nota de la
   * crítica: descartarlo por «no llega al mínimo» sería afirmar algo que no
   * sabemos (Art. IV.2). Con `true` se muestra marcado como «sin nota todavía»
   * y la recopilación de la semana siguiente ya decide con la nota en la mano.
   */
  includeUnrated: boolean;
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
  quality: QualitySettings;
}

// ---------------------------------------------------------------------------
// Consultas de catálogo
// ---------------------------------------------------------------------------

export type SortField = 'date' | 'critic' | 'personal' | 'title';
export type SortOrder = 'asc' | 'desc';
export type WatchStatusFilter = 'all' | 'watched' | 'pending' | 'rated' | 'interested';

export interface CatalogQuery {
  text?: string;
  mediaType?: MediaType | 'all';
  platforms?: string[];
  genres?: string[];
  /** `YYYY-Www`, `current` o `all`. */
  week?: string;
  minCritic?: number;
  /**
   * Si los títulos sin índice de crítica pasan el mínimo (FR-053). Solo tiene
   * efecto junto a `minCritic`. Ausente = lo que digan los ajustes.
   */
  includeUnrated?: boolean;
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
  /** Títulos guardados en el catálogo, sin aplicar el listón de calidad. */
  totalTitles: number;
  /** Los que pasan el listón: los que se van a ver (FR-053). */
  visibleTitles: number;
  /** Los que quedan fuera por no llegar al mínimo (FR-053). */
  belowFloor: number;
}

export interface WatchedStats {
  totalWatched: number;
  totalRated: number;
  /** Títulos marcados como «me interesa» y todavía sin ver (FR-054). */
  totalInterested: number;
  averagePersonal: number | null;
  averageCritic: number | null;
  byGenre: Array<{ genre: string; watched: number; averagePersonal: number | null }>;
  byPlatform: Array<{ platform: string; name: string; watched: number }>;
  topRated: Array<{ titleId: string; title: string; score: number }>;
}

/** Una entrada de la clasificación por año (FR-058). */
export interface RankingEntry {
  titleId: string;
  title: string;
  year: number | null;
  mediaType: MediaType;
  /** Media 0–10 de IMDb, Rotten Tomatoes y TMDB. */
  score: number;
  /** Cuántas de las tres aportaron nota: con menos de tres se dice. */
  sources: number;
  /** Nombres de plataforma, que es lo único que va entre paréntesis. */
  platforms: string[];
}

export interface RankingResult {
  year: number;
  movies: RankingEntry[];
  series: RankingEntry[];
  /** Títulos examinados antes de exigir notas. */
  considered: number;
  /** Peticiones de red gastadas: importa, porque la cuota de OMDb es diaria. */
  requests: number;
  issues: string[];
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
