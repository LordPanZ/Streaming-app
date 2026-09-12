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

/**
 * Todo lo que el buscador mira de un título (FR-031, FR-055).
 *
 * Se busca sobre lo que el usuario recuerda de una película: cómo se llama,
 * de qué género es, dónde está, quién sale y de qué año es. La sinopsis queda
 * fuera a propósito: con ella dentro, buscar «amor» devolvería medio catálogo
 * y el buscador dejaría de servir para encontrar algo concreto.
 */
function searchHaystack(view: TitleView): string {
  const { title } = view;
  const parts = [
    title.title,
    title.originalTitle,
    title.mediaType === 'movie' ? 'película pelicula' : 'serie',
    String(title.year ?? ''),
    ...title.genres,
    ...title.platforms.map((platform) => platform.name),
    ...title.cast,
    ...title.directors,
  ];
  return parts.map((part) => normalizeText(part)).join(' ');
}

/**
 * Coincidencia de texto (FR-031, FR-055).
 *
 * Todas las palabras deben aparecer, aunque sea en campos distintos: «netflix
 * terror» encuentra el terror que está en Netflix, y «juego calamar» encuentra
 * «El juego del calamar» sin exigir la frase literal.
 */
export function matchesText(view: TitleView, needle: string): boolean {
  if (!needle) return true;
  const query = normalizeText(needle).trim();
  if (!query) return true;
  const haystack = searchHaystack(view);
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
    case 'interested':
      // Lo marcado y todavía sin ver: la lista es de pendientes (FR-054).
      return view.rating?.interested === true && view.rating?.watched !== true;
    case 'all':
    default:
      return true;
  }
}

/**
 * Nota mínima de crítica (FR-029, FR-053).
 *
 * Un título sin índice no puede afirmar que cumpla el mínimo (FR-014), así que
 * por defecto no pasa. Pero «todavía no lo ha puntuado nadie» no es lo mismo
 * que «es malo», y en los estrenos de la semana es el caso habitual: con
 * `includeUnrated` el título se deja pasar marcado como tal, y la recopilación
 * de la semana siguiente ya decidirá con la nota delante.
 */
export function matchesMinCritic(
  view: TitleView,
  minCritic: number | undefined,
  includeUnrated = false,
): boolean {
  if (minCritic === undefined || minCritic <= 0) return true;
  if (view.critic.score === null) return includeUnrated;
  return view.critic.score >= minCritic;
}

/**
 * Aplica el listón de calidad guardado a una consulta que no trae uno propio
 * (FR-053).
 *
 * El criterio es la **ausencia**, no el valor: si el usuario elige «cualquier
 * nota» en la barra de filtros, eso llega como `0` y manda sobre los ajustes.
 * Solo cuando no ha elegido nada se hereda el listón guardado.
 */
export function applyQualityFloor(
  query: CatalogQuery,
  quality: { minCritic: number; includeUnrated: boolean },
): CatalogQuery {
  if (query.minCritic !== undefined) return query;
  if (quality.minCritic <= 0) return query;
  return { ...query, minCritic: quality.minCritic, includeUnrated: quality.includeUnrated };
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
    if (!matchesMinCritic(view, query.minCritic, query.includeUnrated ?? false)) return false;
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
/**
 * Recuentos para la barra de filtros (FR-029, FR-053).
 *
 * Cuando hay listón de calidad, los recuentos cuentan lo que se va a ver, no lo
 * que hay guardado: un «(12)» junto a una semana donde solo se pintan tres es
 * un dato que miente. `totalTitles` sí sigue siendo el catálogo entero, y
 * `belowFloor` dice cuántos quedan fuera, para poder decirlo en pantalla en
 * lugar de que desaparezcan sin explicación.
 */
export function buildFacets(
  views: readonly TitleView[],
  currentWeekValue: string,
  floor?: { minCritic: number; includeUnrated: boolean },
): CatalogFacets {
  const genres = new Map<string, number>();
  const platforms = new Map<string, number>();
  const weeks = new Map<string, number>();

  const all = views;
  const visible = floor
    ? views.filter((view) => matchesMinCritic(view, floor.minCritic, floor.includeUnrated))
    : views;

  for (const view of visible) {
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
    totalTitles: all.length,
    visibleTitles: visible.length,
    belowFloor: all.length - visible.length,
  };
}
