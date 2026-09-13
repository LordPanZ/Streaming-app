/**
 * Consultas con las que arranca cada sección de la interfaz (FR-028, FR-057).
 *
 * Viven aquí, y no dentro de `App.tsx`, porque son el punto exacto donde se
 * juntan tres piezas que antes se probaban por separado: lo que la interfaz
 * pide, lo que el validador admite y lo que el filtro entiende.
 *
 * Ese hueco costó un fallo real. `status: 'interested'` existía en el tipo, la
 * interfaz lo enviaba y el filtro sabía tratarlo, pero el validador de la
 * frontera no lo tenía en su lista de valores permitidos y rechazaba la
 * consulta entera. Cada mitad estaba probada; la costura, no.
 *
 * Con las consultas en un módulo compartido, las pruebas pueden pasar por la
 * costura completa: consulta de la sección → validación → filtrado.
 */

import type { CatalogQuery } from './types';

export const WEEK_QUERY: CatalogQuery = {
  week: 'current',
  sort: 'date',
  order: 'desc',
  limit: 60,
};

export const CATALOG_QUERY: CatalogQuery = {
  week: 'all',
  sort: 'date',
  order: 'desc',
  limit: 60,
};

/**
 * Sección «Me interesa» (FR-057).
 *
 * `minCritic: 0` y `excludeAnimation: false` no son descuidos: ningún ajuste
 * puede esconder algo que el usuario ha apuntado a mano. Si lo marcó, lo quiere
 * ver, tenga la nota que tenga y sea animación o no.
 */
export const INTERESTED_QUERY: CatalogQuery = {
  week: 'all',
  status: 'interested',
  minCritic: 0,
  excludeAnimation: false,
  sort: 'date',
  order: 'desc',
  limit: 60,
};

/** Todas las consultas de arranque, para poder recorrerlas en las pruebas. */
export const VIEW_QUERIES = {
  week: WEEK_QUERY,
  catalog: CATALOG_QUERY,
  interested: INTERESTED_QUERY,
} as const;
