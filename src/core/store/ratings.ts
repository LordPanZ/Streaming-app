/**
 * Valoraciones personales y estadísticas (FR-021, FR-025, FR-033).
 *
 * La nota personal **no** se guarda: se deriva de `scores` y de los pesos
 * vigentes en cada lectura (ADR-008). Aquí solo vive lo que el usuario ha
 * introducido de verdad.
 */

import type {
  RatingCriterion,
  Title,
  UserRating,
  WatchedStats,
} from '../../shared/types';
import { personalScore, aggregateCritic, round1 } from '../domain/scoring';
import { platformName } from '../domain/platforms';
import { JsonStore, type RecoverHandler } from './json-store';
import { STORAGE_KEYS, type KeyValueStorage } from './storage';

export interface RatingsData {
  schemaVersion: number;
  ratings: UserRating[];
}

export const RATINGS_SCHEMA_VERSION = 1;

function emptyRatings(): RatingsData {
  return { schemaVersion: RATINGS_SCHEMA_VERSION, ratings: [] };
}

export interface SetWatchedOptions {
  watchedAt?: string | null;
  platform?: string | null;
}

export class RatingsStore {
  private readonly store: JsonStore<RatingsData>;
  private byTitle = new Map<string, UserRating>();

  constructor(storage: KeyValueStorage, onRecover?: RecoverHandler) {
    this.store = new JsonStore<RatingsData>({
      storage,
      key: STORAGE_KEYS.ratings,
      defaults: emptyRatings,
      revive: (raw, defaults) => reviveRatings(raw, defaults),
      ...(onRecover ? { onRecover } : {}),
    });
  }

  async load(): Promise<void> {
    const data = await this.store.load();
    this.byTitle = new Map(data.ratings.map((rating) => [rating.titleId, rating]));
  }

  get(titleId: string): UserRating | null {
    return this.byTitle.get(titleId) ?? null;
  }

  all(): UserRating[] {
    return [...this.byTitle.values()];
  }

  get size(): number {
    return this.byTitle.size;
  }

  /** Marca o desmarca como visto (FR-021). */
  async setWatched(
    titleId: string,
    watched: boolean,
    options: SetWatchedOptions = {},
    now: Date = new Date(),
  ): Promise<UserRating> {
    const current = this.byTitle.get(titleId) ?? blankRating(titleId, now);
    const next: UserRating = {
      ...current,
      watched,
      // Invariante 6: no visto implica sin fecha de visionado.
      watchedAt: watched ? (options.watchedAt ?? current.watchedAt ?? now.toISOString()) : null,
      watchedOnPlatform: watched ? (options.platform ?? current.watchedOnPlatform ?? null) : null,
      updatedAt: now.toISOString(),
    };
    return this.persist(next);
  }

  /**
   * Guarda las puntuaciones por criterio (FR-022, FR-025).
   *
   * Puntuar algo implica haberlo visto: si el usuario valora un título que no
   * había marcado, se marca solo. Es lo que espera cualquiera al usarlo.
   */
  async setScores(
    titleId: string,
    scores: Record<string, number>,
    notes?: string,
    now: Date = new Date(),
  ): Promise<UserRating> {
    const current = this.byTitle.get(titleId) ?? blankRating(titleId, now);
    const hasAnyScore = Object.keys(scores).length > 0;
    const next: UserRating = {
      ...current,
      scores,
      notes: notes ?? current.notes,
      watched: current.watched || hasAnyScore,
      watchedAt:
        current.watchedAt ?? (hasAnyScore && !current.watched ? now.toISOString() : current.watchedAt),
      updatedAt: now.toISOString(),
    };
    return this.persist(next);
  }

  /** Borra la valoración de un título (FR-025). */
  async clear(titleId: string): Promise<void> {
    if (!this.byTitle.delete(titleId)) return;
    await this.flush();
  }

  async replaceAll(ratings: readonly UserRating[]): Promise<void> {
    this.byTitle = new Map(ratings.map((rating) => [rating.titleId, rating]));
    await this.flush();
  }

  /**
   * Fusiona valoraciones importadas (FR-038). Sin `overwrite`, lo que ya existe
   * en el equipo gana: una importación nunca debe pisar en silencio el trabajo
   * del usuario.
   */
  async merge(
    incoming: readonly UserRating[],
    overwrite: boolean,
  ): Promise<{ imported: number; skipped: number }> {
    let imported = 0;
    let skipped = 0;
    for (const rating of incoming) {
      if (this.byTitle.has(rating.titleId) && !overwrite) {
        skipped += 1;
        continue;
      }
      this.byTitle.set(rating.titleId, rating);
      imported += 1;
    }
    if (imported > 0) await this.flush();
    return { imported, skipped };
  }

  async wipe(): Promise<void> {
    this.byTitle = new Map();
    await this.store.reset();
  }

  private async persist(rating: UserRating): Promise<UserRating> {
    this.byTitle.set(rating.titleId, rating);
    await this.flush();
    return rating;
  }

  private async flush(): Promise<void> {
    await this.store.save({ schemaVersion: RATINGS_SCHEMA_VERSION, ratings: this.all() });
  }
}

export function blankRating(titleId: string, now: Date = new Date()): UserRating {
  const stamp = now.toISOString();
  return {
    titleId,
    watched: false,
    watchedAt: null,
    watchedOnPlatform: null,
    scores: {},
    notes: '',
    createdAt: stamp,
    updatedAt: stamp,
  };
}

// ---------------------------------------------------------------------------
// Estadísticas (FR-033)
// ---------------------------------------------------------------------------

export function buildWatchedStats(
  titles: readonly Title[],
  ratings: readonly UserRating[],
  criteria: readonly RatingCriterion[],
): WatchedStats {
  const titleById = new Map(titles.map((title) => [title.id, title]));
  const watched = ratings.filter((rating) => rating.watched);

  const personalScores: number[] = [];
  const criticScores: number[] = [];
  const byGenre = new Map<string, { watched: number; scores: number[] }>();
  const byPlatform = new Map<string, number>();
  const topRated: Array<{ titleId: string; title: string; score: number }> = [];

  for (const rating of watched) {
    const title = titleById.get(rating.titleId);
    const personal = personalScore(rating, criteria).score;

    if (personal !== null) {
      personalScores.push(personal);
      if (title) topRated.push({ titleId: title.id, title: title.title, score: personal });
    }
    if (!title) continue;

    const critic = aggregateCritic(title.ratings).score;
    if (critic !== null) criticScores.push(critic);

    for (const genre of title.genres) {
      const bucket = byGenre.get(genre) ?? { watched: 0, scores: [] };
      bucket.watched += 1;
      if (personal !== null) bucket.scores.push(personal);
      byGenre.set(genre, bucket);
    }

    // Si el usuario no dijo dónde lo vio, cuenta en todas las plataformas donde
    // estaba disponible: la estadística es de cobertura, no de facturación.
    const platformIds = rating.watchedOnPlatform
      ? [rating.watchedOnPlatform]
      : title.platforms.map((platform) => platform.id);
    for (const id of platformIds) {
      byPlatform.set(id, (byPlatform.get(id) ?? 0) + 1);
    }
  }

  return {
    totalWatched: watched.length,
    totalRated: personalScores.length,
    averagePersonal: mean(personalScores),
    averageCritic: mean(criticScores),
    byGenre: [...byGenre.entries()]
      .map(([genre, bucket]) => ({
        genre,
        watched: bucket.watched,
        averagePersonal: mean(bucket.scores),
      }))
      .sort((a, b) => b.watched - a.watched || a.genre.localeCompare(b.genre, 'es')),
    byPlatform: [...byPlatform.entries()]
      .map(([platform, count]) => ({ platform, name: platformName(platform), watched: count }))
      .sort((a, b) => b.watched - a.watched || a.name.localeCompare(b.name, 'es')),
    topRated: topRated.sort((a, b) => b.score - a.score).slice(0, 10),
  };
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return round1(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function reviveRatings(raw: unknown, defaults: RatingsData): RatingsData {
  if (typeof raw !== 'object' || raw === null) return defaults;
  const candidate = raw as Partial<RatingsData>;
  if (!Array.isArray(candidate.ratings)) return defaults;
  return {
    schemaVersion: RATINGS_SCHEMA_VERSION,
    ratings: candidate.ratings.filter(isPlausibleRating),
  };
}

export function isPlausibleRating(value: unknown): value is UserRating {
  if (typeof value !== 'object' || value === null) return false;
  const rating = value as Partial<UserRating>;
  return (
    typeof rating.titleId === 'string' &&
    typeof rating.watched === 'boolean' &&
    typeof rating.scores === 'object' &&
    rating.scores !== null
  );
}
