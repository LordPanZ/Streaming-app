/**
 * Adaptador de OMDb (ADR-003, contrato §2): notas de IMDb, Rotten Tomatoes y
 * Metacritic en una sola petición por título.
 *
 * La regla que gobierna todo este archivo: una nota que no está se queda
 * ausente. Nunca se convierte en cero (FR-014, Art. IV.2).
 */

import type { CriticRatings } from '../../shared/types';
import { emptyCriticRatings } from '../domain/scoring';
import type { HttpClient } from './http';

const BASE_URL = 'https://www.omdbapi.com/';

export interface OmdbRatingEntry {
  Source: string;
  Value: string;
}

export interface OmdbResponse {
  Response: string;
  Error?: string;
  Title?: string;
  Year?: string;
  imdbRating?: string;
  imdbVotes?: string;
  Metascore?: string;
  Ratings?: OmdbRatingEntry[];
}

export interface OmdbClientOptions {
  apiKey: string;
  http: HttpClient;
  cacheTtlMs?: number;
}

export class OmdbNotFoundError extends Error {
  constructor(readonly imdbId: string, message: string) {
    super(message);
    this.name = 'OmdbNotFoundError';
  }
}

export class OmdbClient {
  private readonly apiKey: string;
  private readonly http: HttpClient;
  private readonly cacheTtlMs: number;

  constructor(options: OmdbClientOptions) {
    this.apiKey = options.apiKey;
    this.http = options.http;
    this.cacheTtlMs = options.cacheTtlMs ?? 0;
  }

  /**
   * Notas de un título por su identificador de IMDb.
   *
   * Un título que OMDb no conoce **no** es un error de red: se devuelven notas
   * vacías y quien llama decide si merece una incidencia de aviso.
   */
  async ratingsFor(imdbId: string, fetchedAt: Date = new Date()): Promise<CriticRatings> {
    const url = new URL(BASE_URL);
    url.searchParams.set('apikey', this.apiKey);
    url.searchParams.set('i', imdbId);
    url.searchParams.set('tomatoes', 'true');

    const response = await this.http.getJson<OmdbResponse>(url.toString(), {
      cacheTtlMs: this.cacheTtlMs,
      label: `notas de ${imdbId}`,
    });

    return parseOmdbRatings(response, fetchedAt);
  }

  /** Comprobación de clave para los ajustes (FR-036). */
  async verifyKey(): Promise<{ ok: boolean; message: string }> {
    const url = new URL(BASE_URL);
    url.searchParams.set('apikey', this.apiKey);
    url.searchParams.set('i', 'tt0111161'); // Cadena perpetua: existe desde siempre.

    try {
      const response = await this.http.getJson<OmdbResponse>(url.toString(), {
        label: 'verificación de la clave de OMDb',
      });
      if (response.Response === 'True') {
        return { ok: true, message: 'Clave de OMDb válida.' };
      }
      return { ok: false, message: response.Error ?? 'OMDb ha rechazado la clave.' };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Error desconocido.' };
    }
  }
}

// ---------------------------------------------------------------------------
// Análisis puro (contrato §2)
// ---------------------------------------------------------------------------

/** `"7.8"` → `7.8`; `"N/A"`, `""` y lo no numérico → `null`. */
export function parseNumeric(value: string | undefined | null): number | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toUpperCase() === 'N/A') return null;
  const parsed = Number(trimmed.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

/** `"88%"` → `88`; `"7.8/10"` → `7.8`; `"68/100"` → `68`. */
export function parseRatingValue(value: string): number | null {
  const trimmed = value.trim();

  const percent = /^(\d+(?:\.\d+)?)\s*%$/.exec(trimmed);
  if (percent) return Number(percent[1]);

  const fraction = /^(\d+(?:\.\d+)?)\s*\/\s*\d+$/.exec(trimmed);
  if (fraction) return Number(fraction[1]);

  return parseNumeric(trimmed);
}

/**
 * Traduce una respuesta de OMDb a nuestras notas.
 *
 * `Ratings` tiene prioridad sobre los campos sueltos porque es lo que la propia
 * API considera canónico; los campos sueltos actúan de respaldo.
 */
export function parseOmdbRatings(response: OmdbResponse, fetchedAt: Date): CriticRatings {
  const ratings = emptyCriticRatings();

  if (response.Response !== 'True') {
    return ratings;
  }

  for (const entry of response.Ratings ?? []) {
    if (!entry || typeof entry.Source !== 'string' || typeof entry.Value !== 'string') continue;
    const value = parseRatingValue(entry.Value);
    if (value === null) continue;

    switch (entry.Source.trim().toLowerCase()) {
      case 'internet movie database':
        ratings.imdb = value;
        break;
      case 'rotten tomatoes':
        ratings.rottenTomatoes = value;
        break;
      case 'metacritic':
        ratings.metacritic = value;
        break;
      default:
        // Fuente que no conocemos: se ignora sin romper (contrato §2).
        break;
    }
  }

  ratings.imdb ??= parseNumeric(response.imdbRating);
  ratings.metacritic ??= parseNumeric(response.Metascore);
  ratings.imdbVotes = parseNumeric(response.imdbVotes);

  const hasAny =
    ratings.imdb !== null || ratings.rottenTomatoes !== null || ratings.metacritic !== null;
  ratings.fetchedAt = hasAny ? fetchedAt.toISOString() : null;

  return ratings;
}

/** ¿La respuesta trae algún dato aprovechable? */
export function hasRatings(ratings: CriticRatings): boolean {
  return (
    ratings.imdb !== null || ratings.rottenTomatoes !== null || ratings.metacritic !== null
  );
}
