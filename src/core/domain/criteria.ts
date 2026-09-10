/**
 * Criterios de valoración cuantificables (FR-022) y su gestión (FR-026).
 */

import type { RatingCriterion } from '../../shared/types';

/** Escala 0–10 en pasos de 0,5 (FR-022). */
export const SCORE_MIN = 0;
export const SCORE_MAX = 10;
export const SCORE_STEP = 0.5;

/** Los siete criterios por defecto, con sus pesos iniciales. */
export const DEFAULT_CRITERIA: readonly RatingCriterion[] = [
  {
    id: 'story',
    label: 'Guion e historia',
    description: 'Solidez del argumento, diálogos, estructura y coherencia.',
    weight: 25,
    enabled: true,
    order: 0,
  },
  {
    id: 'acting',
    label: 'Interpretaciones',
    description: 'Trabajo del reparto y credibilidad de los personajes.',
    weight: 20,
    enabled: true,
    order: 1,
  },
  {
    id: 'direction',
    label: 'Dirección',
    description: 'Puesta en escena, planificación y control del tono.',
    weight: 15,
    enabled: true,
    order: 2,
  },
  {
    id: 'visuals',
    label: 'Fotografía y dirección artística',
    description: 'Imagen, luz, montaje, vestuario, efectos y ambientación.',
    weight: 12,
    enabled: true,
    order: 3,
  },
  {
    id: 'sound',
    label: 'Banda sonora y sonido',
    description: 'Música, diseño sonoro y mezcla.',
    weight: 10,
    enabled: true,
    order: 4,
  },
  {
    id: 'pacing',
    label: 'Ritmo',
    description: '¿Se hace largo? ¿Sobran o faltan minutos?',
    weight: 10,
    enabled: true,
    order: 5,
  },
  {
    id: 'impact',
    label: 'Impacto y ganas de revisionado',
    description: 'Qué te ha dejado y si la volverías a ver o la recomendarías.',
    weight: 8,
    enabled: true,
    order: 6,
  },
] as const;

export function defaultCriteria(): RatingCriterion[] {
  return DEFAULT_CRITERIA.map((c) => ({ ...c }));
}

/** ¿Es una puntuación válida? 0–10 en pasos de 0,5 (invariante 4 del modelo). */
export function isValidScore(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= SCORE_MIN &&
    value <= SCORE_MAX &&
    Math.abs(value / SCORE_STEP - Math.round(value / SCORE_STEP)) < 1e-9
  );
}

/** Ajusta una puntuación libre al paso más cercano dentro del rango. */
export function clampScore(value: number): number {
  const clamped = Math.min(SCORE_MAX, Math.max(SCORE_MIN, value));
  return Math.round(clamped / SCORE_STEP) * SCORE_STEP;
}

/**
 * Descarta del mapa de puntuaciones lo que no corresponda a un criterio
 * conocido o no sea una puntuación válida. Se aplica en el límite IPC para que
 * al almacén no llegue nunca basura (NFR-008).
 */
export function sanitizeScores(
  scores: Record<string, unknown>,
  criteria: readonly RatingCriterion[],
): Record<string, number> {
  const known = new Set(criteria.map((c) => c.id));
  const clean: Record<string, number> = {};
  for (const [id, value] of Object.entries(scores)) {
    if (!known.has(id)) continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    clean[id] = clampScore(value);
  }
  return clean;
}

/** Criterios activos, en el orden en que se muestran. */
export function activeCriteria(criteria: readonly RatingCriterion[]): RatingCriterion[] {
  return criteria.filter((c) => c.enabled).sort((a, b) => a.order - b.order);
}

/**
 * Fusiona los criterios guardados con los de fábrica: conserva las
 * personalizaciones del usuario y añade los criterios nuevos que introduzca una
 * versión posterior de la aplicación, sin resucitar los que el usuario haya
 * desactivado (FR-026).
 */
export function mergeCriteria(stored: readonly RatingCriterion[] | undefined): RatingCriterion[] {
  if (!stored || stored.length === 0) return defaultCriteria();
  const byId = new Map(stored.map((c) => [c.id, c]));
  const merged: RatingCriterion[] = stored.map((c) => ({ ...c }));
  for (const fallback of DEFAULT_CRITERIA) {
    if (!byId.has(fallback.id)) {
      merged.push({ ...fallback, order: merged.length });
    }
  }
  return merged.sort((a, b) => a.order - b.order);
}
