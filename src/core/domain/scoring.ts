/**
 * Cálculo de notas. Nada de esto se persiste: se deriva en cada lectura, para
 * que cambiar un peso recalcule todo al vuelo (ADR-008) y no queden notas
 * rancias incoherentes con la configuración vigente.
 *
 * Cubre FR-014, FR-015, FR-023, FR-024 y FR-027.
 */

import type {
  AggregateCritic,
  Confidence,
  CriticRatings,
  CriticSource,
  PersonalScore,
  RatingCriterion,
  UserRating,
} from '../../shared/types';
import { activeCriteria } from './criteria';

/** Pesos por fiabilidad percibida de cada fuente (ADR-009). */
export const CRITIC_WEIGHTS: Readonly<Record<CriticSource, number>> = {
  imdb: 0.35,
  rottenTomatoes: 0.3,
  metacritic: 0.2,
  tmdb: 0.15,
};

/** Notas vacías: todas ausentes. Nunca ceros (FR-014). */
export function emptyCriticRatings(): CriticRatings {
  return {
    imdb: null,
    rottenTomatoes: null,
    metacritic: null,
    tmdb: null,
    imdbVotes: null,
    fetchedAt: null,
  };
}

/** Lleva cada fuente a la escala común 0–10. */
export function normalizeCriticValue(source: CriticSource, value: number): number {
  switch (source) {
    case 'imdb':
    case 'tmdb':
      return clamp01to10(value);
    case 'rottenTomatoes':
    case 'metacritic':
      return clamp01to10(value / 10);
  }
}

function clamp01to10(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(10, Math.max(0, value));
}

function confidenceFor(sourceCount: number): Confidence {
  if (sourceCount === 0) return 'none';
  if (sourceCount === 1) return 'low';
  if (sourceCount === 2) return 'medium';
  return 'high';
}

/**
 * Índice agregado de crítica 0–10 (FR-015).
 *
 * Media ponderada de las fuentes **presentes**, renormalizando sus pesos. Sin
 * ninguna fuente el resultado es `null` con confianza `none`: la interfaz
 * mostrará "sin datos", nunca un cero (FR-014).
 */
export function aggregateCritic(ratings: CriticRatings): AggregateCritic {
  const present: Array<{ source: CriticSource; normalized: number; weight: number }> = [];

  const raw: Array<[CriticSource, number | null]> = [
    ['imdb', ratings.imdb],
    ['rottenTomatoes', ratings.rottenTomatoes],
    ['metacritic', ratings.metacritic],
    ['tmdb', ratings.tmdb],
  ];

  for (const [source, value] of raw) {
    if (value === null || value === undefined || !Number.isFinite(value)) continue;
    present.push({
      source,
      normalized: normalizeCriticValue(source, value),
      weight: CRITIC_WEIGHTS[source],
    });
  }

  if (present.length === 0) {
    return { score: null, confidence: 'none', sources: [] };
  }

  const totalWeight = present.reduce((sum, s) => sum + s.weight, 0);
  const weighted = present.reduce((sum, s) => sum + s.normalized * s.weight, 0);

  return {
    score: round1(weighted / totalWeight),
    confidence: confidenceFor(present.length),
    sources: present.map((s) => ({ ...s, weight: round3(s.weight / totalWeight) })),
  };
}

/**
 * Nota personal ponderada (FR-024).
 *
 * Pondera **solo** los criterios activos que el usuario haya puntuado; los
 * pesos se renormalizan sobre ese subconjunto (FR-023). Sin ningún criterio
 * puntuado devuelve `null`, no 0.
 */
export function personalScore(
  rating: UserRating | null | undefined,
  criteria: readonly RatingCriterion[],
): PersonalScore {
  const active = activeCriteria(criteria);
  const empty: PersonalScore = {
    score: null,
    scoredCriteria: 0,
    totalCriteria: active.length,
    breakdown: [],
  };

  if (!rating) return empty;

  const scored = active
    .filter((criterion) => {
      const value = rating.scores[criterion.id];
      return typeof value === 'number' && Number.isFinite(value);
    })
    .map((criterion) => ({ criterion, value: rating.scores[criterion.id] as number }));

  if (scored.length === 0) return empty;

  const totalWeight = scored.reduce((sum, s) => sum + Math.max(0, s.criterion.weight), 0);
  if (totalWeight <= 0) {
    // Todos los pesos a cero: se reparte por igual antes que devolver NaN.
    const average = scored.reduce((sum, s) => sum + s.value, 0) / scored.length;
    return {
      score: round1(average),
      scoredCriteria: scored.length,
      totalCriteria: active.length,
      breakdown: scored.map((s) => ({
        criterionId: s.criterion.id,
        label: s.criterion.label,
        value: s.value,
        normalizedWeight: round3(1 / scored.length),
      })),
    };
  }

  const weighted = scored.reduce(
    (sum, s) => sum + s.value * Math.max(0, s.criterion.weight),
    0,
  );

  return {
    score: round1(weighted / totalWeight),
    scoredCriteria: scored.length,
    totalCriteria: active.length,
    breakdown: scored.map((s) => ({
      criterionId: s.criterion.id,
      label: s.criterion.label,
      value: s.value,
      normalizedWeight: round3(Math.max(0, s.criterion.weight) / totalWeight),
    })),
  };
}

/**
 * Diferencia entre la nota personal y el índice de crítica (FR-027).
 * `null` si falta cualquiera de las dos: no se compara contra un dato inventado.
 */
export function personalVsCritic(
  personal: PersonalScore,
  critic: AggregateCritic,
): number | null {
  if (personal.score === null || critic.score === null) return null;
  return round1(personal.score - critic.score);
}

/** Pesos normalizados a porcentaje, para mostrarlos en los ajustes (FR-023). */
export function normalizedWeights(
  criteria: readonly RatingCriterion[],
): Array<{ id: string; label: string; percent: number }> {
  const active = activeCriteria(criteria);
  const total = active.reduce((sum, c) => sum + Math.max(0, c.weight), 0);
  if (total <= 0) {
    const even = active.length > 0 ? 100 / active.length : 0;
    return active.map((c) => ({ id: c.id, label: c.label, percent: round1(even) }));
  }
  return active.map((c) => ({
    id: c.id,
    label: c.label,
    percent: round1((Math.max(0, c.weight) / total) * 100),
  }));
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
