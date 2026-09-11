/**
 * Adaptador de TMDB (ADR-002, contrato §1).
 *
 * Dos responsabilidades separadas a propósito:
 *  - `TmdbClient`, que habla con la API;
 *  - las funciones de mapeo, puras, que traducen su respuesta a nuestro dominio
 *    y que son las que llevan la carga de las pruebas.
 */

import type { CriticRatings, MediaType, PlatformRef, Title } from '../../shared/types';
import { platformIdForProviderName, platformName } from '../domain/platforms';
import { emptyCriticRatings } from '../domain/scoring';
import { selectTrailer, type VideoCandidate } from '../domain/trailer';
import { isoWeekOfDate } from '../domain/weeks';
import { HttpError, type HttpClient } from './http';
import { tmdbKeyWarning } from '../domain/api-keys';

const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE = 'https://image.tmdb.org/t/p';
export const POSTER_SIZE = 'w500';
export const BACKDROP_SIZE = 'w1280';

/** Tope de seguridad por plataforma y tipo (contrato §1.2). */
export const MAX_DISCOVER_PAGES = 5;

export const GENRE_UNCLASSIFIED = 'Sin clasificar';

// ---------------------------------------------------------------------------
// Formas de la respuesta (contrato §1)
// ---------------------------------------------------------------------------

export interface TmdbProviderEntry {
  provider_id: number;
  provider_name: string;
  logo_path?: string | null;
  display_priority?: number;
}

export interface TmdbDiscoverResult {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  genre_ids?: number[];
  vote_average?: number;
  vote_count?: number;
}

export interface TmdbDiscoverPage {
  page: number;
  total_pages: number;
  total_results: number;
  results: TmdbDiscoverResult[];
}

export interface TmdbCredits {
  cast?: Array<{ name?: string; order?: number }>;
  crew?: Array<{ name?: string; job?: string; department?: string }>;
}

export interface TmdbDetails extends TmdbDiscoverResult {
  genres?: Array<{ id: number; name: string }>;
  runtime?: number | null;
  number_of_seasons?: number | null;
  external_ids?: { imdb_id?: string | null };
  videos?: { results?: VideoCandidate[] };
  credits?: TmdbCredits;
  /** Solo en series: quien la crea. */
  created_by?: Array<{ name?: string }>;
  'watch/providers'?: {
    results?: Record<
      string,
      { link?: string; flatrate?: TmdbProviderEntry[]; free?: TmdbProviderEntry[] }
    >;
  };
}

export interface DiscoverParams {
  mediaType: MediaType;
  providerId: number;
  from: string;
  to: string;
  page?: number;
}

export interface TmdbClientOptions {
  apiKey: string;
  http: HttpClient;
  cacheTtlMs?: number;
  language?: string;
  region?: string;
}

// ---------------------------------------------------------------------------
// Cliente
// ---------------------------------------------------------------------------

export class TmdbClient {
  private readonly apiKey: string;
  private readonly http: HttpClient;
  private readonly cacheTtlMs: number;
  private readonly language: string;
  private readonly region: string;

  constructor(options: TmdbClientOptions) {
    this.apiKey = options.apiKey;
    this.http = options.http;
    this.cacheTtlMs = options.cacheTtlMs ?? 0;
    this.language = options.language ?? 'es-ES';
    this.region = options.region ?? 'ES';
  }

  /** Catálogo de proveedores de la región, para resolver identificadores (FR-006). */
  async providerCatalog(mediaType: MediaType): Promise<TmdbProviderEntry[]> {
    const path = mediaType === 'movie' ? 'movie' : 'tv';
    const url = this.url(`/watch/providers/${path}`, { watch_region: this.region });
    const response = await this.http.getJson<{ results?: TmdbProviderEntry[] }>(url, {
      cacheTtlMs: this.cacheTtlMs,
      label: `catálogo de proveedores (${mediaType})`,
    });
    return response.results ?? [];
  }

  /** Una página de estrenos de una plataforma (contrato §1.2). */
  async discover(params: DiscoverParams): Promise<TmdbDiscoverPage> {
    const isMovie = params.mediaType === 'movie';
    const dateField = isMovie ? 'primary_release_date' : 'first_air_date';
    const url = this.url(`/discover/${isMovie ? 'movie' : 'tv'}`, {
      language: this.language,
      watch_region: this.region,
      with_watch_providers: String(params.providerId),
      with_watch_monetization_types: 'flatrate',
      [`${dateField}.gte`]: params.from,
      [`${dateField}.lte`]: params.to,
      sort_by: `${dateField}.desc`,
      include_adult: 'false',
      page: String(params.page ?? 1),
    });

    return this.http.getJson<TmdbDiscoverPage>(url, {
      cacheTtlMs: this.cacheTtlMs,
      label: `estrenos ${params.mediaType} del proveedor ${params.providerId}`,
    });
  }

  /** Recorre las páginas de descubrimiento hasta el tope de seguridad. */
  async discoverAll(params: Omit<DiscoverParams, 'page'>): Promise<TmdbDiscoverResult[]> {
    const first = await this.discover({ ...params, page: 1 });
    const results = [...first.results];
    const lastPage = Math.min(first.total_pages ?? 1, MAX_DISCOVER_PAGES);

    for (let page = 2; page <= lastPage; page += 1) {
      const next = await this.discover({ ...params, page });
      results.push(...next.results);
    }
    return results;
  }

  /**
   * Ficha completa en una sola petición (contrato §1.3). `append_to_response`
   * evita cinco viajes por título, que con 300 títulos son 1 500 peticiones de
   * menos por ejecución (Art. V.1). Por eso el reparto y la dirección (FR-048)
   * no cuestan ni una consulta adicional: vienen en la misma respuesta.
   */
  async details(mediaType: MediaType, tmdbId: number): Promise<TmdbDetails> {
    const path = mediaType === 'movie' ? 'movie' : 'tv';
    const url = this.url(`/${path}/${tmdbId}`, {
      language: this.language,
      append_to_response: 'external_ids,videos,watch/providers,credits',
    });
    return this.http.getJson<TmdbDetails>(url, {
      cacheTtlMs: this.cacheTtlMs,
      label: `ficha ${mediaType} ${tmdbId}`,
    });
  }

  /** Vídeos sin filtrar por idioma, para poder caer al tráiler original (FR-016). */
  async videos(mediaType: MediaType, tmdbId: number): Promise<VideoCandidate[]> {
    const path = mediaType === 'movie' ? 'movie' : 'tv';
    const url = this.url(`/${path}/${tmdbId}/videos`, {});
    const response = await this.http.getJson<{ results?: VideoCandidate[] }>(url, {
      cacheTtlMs: this.cacheTtlMs,
      label: `vídeos ${mediaType} ${tmdbId}`,
    });
    return response.results ?? [];
  }

  /** Comprobación de clave para los ajustes (FR-036). */
  async verifyKey(): Promise<{ ok: boolean; message: string }> {
    try {
      const catalog = await this.providerCatalog('movie');
      return catalog.length > 0
        ? { ok: true, message: `Clave de TMDB válida. ${catalog.length} proveedores en España.` }
        : { ok: false, message: 'TMDB responde pero no devuelve proveedores para España.' };
    } catch (error) {
      // Un 401 aquí casi siempre es haber pegado el testigo v4 en lugar de la
      // clave v3. Decirlo ahorra buscar un fallo que no existe.
      if (error instanceof HttpError && error.status === 401) {
        const hint = tmdbKeyWarning(this.apiKey);
        return {
          ok: false,
          message: hint
            ? `TMDB ha rechazado la clave. ${hint}`
            : 'TMDB ha rechazado la clave. Comprueba que es la «API Key (v3 auth)», de 32 caracteres.',
        };
      }
      return { ok: false, message: error instanceof Error ? error.message : 'Error desconocido.' };
    }
  }

  private url(path: string, params: Record<string, string>): string {
    const url = new URL(`${BASE_URL}${path}`);
    url.searchParams.set('api_key', this.apiKey);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }
}

// ---------------------------------------------------------------------------
// Mapeo puro
// ---------------------------------------------------------------------------

export function imageUrl(path: string | null | undefined, size: string): string | null {
  if (!path) return null;
  return `${IMAGE_BASE}/${size}${path}`;
}

export function titleIdFor(mediaType: MediaType, tmdbId: number): string {
  return `tmdb:${mediaType === 'movie' ? 'movie' : 'tv'}:${tmdbId}`;
}

export function displayTitle(entry: TmdbDiscoverResult): string {
  return entry.title ?? entry.name ?? '(sin título)';
}

export function originalTitle(entry: TmdbDiscoverResult): string {
  return entry.original_title ?? entry.original_name ?? displayTitle(entry);
}

export function releaseDate(entry: TmdbDiscoverResult): string | null {
  const raw = entry.release_date ?? entry.first_air_date ?? null;
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
}

/** Géneros en castellano. Nunca vacío (FR-012, invariante 1). */
export function extractGenres(details: TmdbDetails): string[] {
  const names = (details.genres ?? [])
    .map((genre) => genre.name?.trim())
    .filter((name): name is string => Boolean(name));
  return names.length > 0 ? names : [GENRE_UNCLASSIFIED];
}

/**
 * Plataformas españolas del título. Solo `flatrate` y `free`: alquilar o
 * comprar no es "estar en una plataforma de suscripción" (contrato §1.5).
 */
export function extractPlatforms(details: TmdbDetails, region = 'ES'): PlatformRef[] {
  const regionData = details['watch/providers']?.results?.[region];
  if (!regionData) return [];

  const entries = [...(regionData.flatrate ?? []), ...(regionData.free ?? [])];
  const seen = new Map<string, PlatformRef>();

  for (const entry of entries) {
    const id = platformIdForProviderName(entry.provider_name);
    if (!id || seen.has(id)) continue;
    seen.set(id, {
      id,
      name: platformName(id),
      providerId: entry.provider_id,
      logoUrl: imageUrl(entry.logo_path, 'w92'),
      link: regionData.link ?? null,
    });
  }
  return [...seen.values()];
}

/** Cuántos nombres del reparto se guardan (FR-048). */
export const MAX_CAST = 6;

/** Reparto principal, en el orden de importancia que declara la fuente. */
export function extractCast(details: TmdbDetails): string[] {
  return [...(details.credits?.cast ?? [])]
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .map((person) => person.name?.trim())
    .filter((name): name is string => Boolean(name))
    .slice(0, MAX_CAST);
}

/**
 * Dirección. En las series la fuente no usa el puesto «Director» sino el campo
 * de creación, así que se mira primero ahí; si no, se recurre al equipo.
 */
export function extractDirectors(details: TmdbDetails): string[] {
  const creators = (details.created_by ?? [])
    .map((person) => person.name?.trim())
    .filter((name): name is string => Boolean(name));
  if (creators.length > 0) return dedupe(creators);

  const directors = (details.credits?.crew ?? [])
    .filter((person) => person.job === 'Director' || person.job === 'Series Director')
    .map((person) => person.name?.trim())
    .filter((name): name is string => Boolean(name));

  return dedupe(directors).slice(0, 3);
}

function dedupe(names: readonly string[]): string[] {
  return [...new Set(names)];
}

export function tmdbRating(entry: TmdbDiscoverResult): CriticRatings {
  const ratings = emptyCriticRatings();
  // `vote_average` llega a 0 tanto cuando la nota es 0 como cuando no hay votos.
  // Sin votos no hay dato, así que se queda ausente (FR-014).
  if (typeof entry.vote_average === 'number' && (entry.vote_count ?? 0) > 0) {
    ratings.tmdb = entry.vote_average;
  }
  return ratings;
}

export interface MapTitleInput {
  mediaType: MediaType;
  details: TmdbDetails;
  /** Plataformas del descubrimiento, por si la ficha no las declara. */
  fallbackPlatforms?: PlatformRef[];
  /** Vídeos adicionales sin filtro de idioma (FR-016). */
  extraVideos?: VideoCandidate[];
  now: Date;
}

/**
 * Traduce una ficha de TMDB a un `Title` del dominio.
 *
 * Devuelve `null` cuando falta lo imprescindible —fecha de disponibilidad o
 * plataforma—, porque persistirlo rompería los invariantes del modelo de datos.
 */
export function mapTitle(input: MapTitleInput): Title | null {
  const { details, mediaType, now } = input;

  const available = releaseDate(details);
  if (!available) return null;

  const fromDetails = extractPlatforms(details);
  const platforms = fromDetails.length > 0 ? fromDetails : (input.fallbackPlatforms ?? []);
  if (platforms.length === 0) return null;

  const name = displayTitle(details);
  const year = Number(available.slice(0, 4)) || null;

  const videos = dedupeVideos([...(details.videos?.results ?? []), ...(input.extraVideos ?? [])]);
  const stamp = now.toISOString();

  return {
    id: titleIdFor(mediaType, details.id),
    mediaType,
    title: name,
    originalTitle: originalTitle(details),
    year,
    overview: details.overview?.trim() ?? '',
    posterUrl: imageUrl(details.poster_path, POSTER_SIZE),
    backdropUrl: imageUrl(details.backdrop_path, BACKDROP_SIZE),
    runtimeMinutes: mediaType === 'movie' ? (details.runtime ?? null) : null,
    seasons: mediaType === 'series' ? (details.number_of_seasons ?? null) : null,
    genres: extractGenres(details),
    platforms,
    availableFrom: available,
    releaseWeek: isoWeekOfDate(available),
    imdbId: normalizeImdbId(details.external_ids?.imdb_id),
    ratings: tmdbRating(details),
    trailer: selectTrailer(videos, name, year),
    cast: extractCast(details),
    directors: extractDirectors(details),
    firstSeenAt: stamp,
    updatedAt: stamp,
  };
}

function dedupeVideos(videos: readonly VideoCandidate[]): VideoCandidate[] {
  const seen = new Map<string, VideoCandidate>();
  for (const video of videos) {
    if (!video?.key || seen.has(video.key)) continue;
    seen.set(video.key, video);
  }
  return [...seen.values()];
}

export function normalizeImdbId(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^tt\d{5,}$/.test(trimmed) ? trimmed : null;
}
