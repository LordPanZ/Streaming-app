/**
 * Filtrado, búsqueda y ordenación del catálogo (FR-029, FR-030, FR-031).
 *
 * Funciones puras sobre vistas ya construidas. El estrechamiento inicial por
 * índices lo hace `store/catalog.ts`; aquí se aplica lo que no es indexable
 * (texto, nota mínima, estado) y se ordena.
 */

import type {
  CatalogFacets,
  CatalogQuery,
  SortField,
  SortOrder,
  TitleView,
  WatchStatusFilter,
} from '../../shared/types';
import { platformName } from './platforms';
import { normalizeText } from './text';

export const MAX_PAGE_SIZE = 200;
export const DEFAULT_PAGE_SIZE = 60;

/** Coincidencia de texto sobre el título en castellano y el original (FR-031). */
export function matchesText(view: TitleView, needle: string): boolean {
  if (!needle) return true;
  const query = normalizeText(needle).trim();
  if (!query) return true;
  const haystack = `${normalizeText(view.title.title)} ${normalizeText(
    view.title.originalTitle,
  )}`;
  // Todas las palabras deben aparecer: "el juego calamar" encuentra
  // "El juego del calamar" sin exigir la frase literal.
  return query.split(/\s+/).every((word) => haystack.includes(word));
}

export function matchesStatus(view: TitleView, status: WatchStatusFilter): boolean {
  switch (status) {
    case 'watched':
      return view.rating?.watched === true;
    case 'pending':
      return view.rating?.watched !== true;
    case 'rated':
      return view.personal?.score !== null && view.personal?.score !== undefined;
    case 'all':
    default:
      return true;
  }
}

/**
 * Nota mínima de crítica (FR-029). Un título sin índice **no** pasa el filtro
 * cuando se pide un mínimo: no podemos afirmar que lo cumpla (FR-014).
 */
export function matchesMinCritic(view: TitleView, minCritic: number | undefined): boolean {
  if (minCritic === undefined || minCritic <= 0) return true;
  if (view.critic.score === null) return false;
  return view.critic.score >= minCritic;
}

export function filterViews(
  views: readonly TitleView[],
  query: CatalogQuery,
): TitleView[] {
  const mediaType = query.mediaType ?? 'all';
  const genres = query.genres?.length ? new Set(query.genres) : null;
  const platforms = query.platforms?.length ? new Set(query.platforms) : null;
  const status = query.status ?? 'all';
  const text = query.text ?? '';

  return views.filter((view) => {
    if (mediaType !== 'all' && view.title.mediaType !== mediaType) return false;
    if (genres && !view.title.genres.some((g) => genres.has(g))) return false;
    if (platforms && !view.title.platforms.some((p) => platforms.has(p.id))) return false;
    if (!matchesMinCritic(view, query.minCritic)) return false;
    if (!matchesStatus(view, status)) return false;
    if (!matchesText(view, text)) return false;
    return true;
  });
}

/**
 * Comparador de ordenación (FR-030).
 *
 * Los ausentes van siempre al final, sea cual sea la dirección: un título sin
 * nota no es "el peor", es que no lo sabemos, y no debe encabezar la lista
 * ascendente.
 */
export function compareViews(
  a: TitleView,
  b: TitleView,
  field: SortField,
  order: SortOrder,
): number {
  const direction = order === 'asc' ? 1 : -1;

  switch (field) {
    case 'title':
      return a.title.title.localeCompare(b.title.title, 'es') * direction;
    case 'date': {
      const delta = a.title.availableFrom.localeCompare(b.title.availableFrom);
      return delta !== 0 ? delta * direction : a.title.title.localeCompare(b.title.title, 'es');
    }
    case 'critic':
      return compareNullable(a.critic.score, b.critic.score, direction, a, b);
    case 'personal':
      return compareNullable(
        a.personal?.score ?? null,
        b.personal?.score ?? null,
        direction,
        a,
        b,
      );
  }
}

function compareNullable(
  left: number | null,
  right: number | null,
  direction: number,
  a: TitleView,
  b: TitleView,
): number {
  if (left === null && right === null) {
    return a.title.title.localeCompare(b.title.title, 'es');
  }
  if (left === null) return 1;
  if (right === null) return -1;
  if (left === right) return a.title.title.localeCompare(b.title.title, 'es');
  return (left - right) * direction;
}

export function sortViews(
  views: readonly TitleView[],
  field: SortField = 'date',
  order: SortOrder = 'desc',
): TitleView[] {
  return [...views].sort((a, b) => compareViews(a, b, field, order));
}

export function paginate<T>(
  items: readonly T[],
  offset = 0,
  limit = DEFAULT_PAGE_SIZE,
): T[] {
  const safeOffset = Math.max(0, Math.floor(offset));
  const safeLimit = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(limit)));
  return items.slice(safeOffset, safeOffset + safeLimit);
}

/** Valores disponibles para poblar los desplegables de filtro (FR-029). */
export function buildFacets(
  views: readonly TitleView[],
  currentWeekValue: string,
): CatalogFacets {
  const genres = new Map<string, number>();
  const platforms = new Map<string, number>();
  const weeks = new Map<string, number>();

  for (const view of views) {
    for (const genre of view.title.genres) {
      genres.set(genre, (genres.get(genre) ?? 0) + 1);
    }
    for (const platform of view.title.platforms) {
      platforms.set(platform.id, (platforms.get(platform.id) ?? 0) + 1);
    }
    weeks.set(view.title.releaseWeek, (weeks.get(view.title.releaseWeek) ?? 0) + 1);
  }

  return {
    genres: [...genres.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'es')),
    platforms: [...platforms.entries()]
      .map(([value, count]) => ({ value, name: platformName(value), count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es')),
    weeks: [...weeks.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.value.localeCompare(a.value)),
    currentWeek: currentWeekValue,
    totalTitles: views.length,
  };
}
