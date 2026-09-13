/**
 * Reconocimiento de géneros por los que se puede excluir contenido (FR-059).
 *
 * Los géneros llegan de TMDB **traducidos** («Animación», no «Animation»),
 * porque el catálogo se pide en castellano. Comparar por nombre es por tanto lo
 * único que se puede hacer con lo ya guardado, pero es frágil: basta un cambio
 * de idioma o de traducción para que deje de acertar.
 *
 * Por eso hay dos caminos y se usan los dos:
 *  - Al **consultar** TMDB se excluye por identificador numérico, que no depende
 *    del idioma (`TMDB_ANIMATION_GENRE_ID`).
 *  - Al **filtrar** lo ya guardado se compara por nombre normalizado, aceptando
 *    tanto la forma castellana como la inglesa.
 */

import { normalizeText } from './text';

/**
 * Identificador del género «Animación» en TMDB. Es el mismo en películas y en
 * series, lo cual no es obvio: la mayoría de los identificadores difieren entre
 * los dos catálogos.
 */
export const TMDB_ANIMATION_GENRE_ID = 16;

/** Formas con las que puede llegar el nombre del género. */
const ANIMATION_NAMES = ['animacion', 'animation'];

/** ¿Alguno de estos géneros es animación? */
export function isAnimation(genres: readonly string[]): boolean {
  return genres.some((genre) => ANIMATION_NAMES.includes(normalizeText(genre).trim()));
}
