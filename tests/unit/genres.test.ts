/**
 * FR-059 · reconocimiento del género de animación.
 *
 * Los géneros llegan traducidos de TMDB, así que el reconocimiento por nombre
 * es frágil por construcción. Estas pruebas fijan hasta dónde llega, y el
 * identificador numérico —que no depende del idioma— es lo que se usa al
 * consultar.
 */

import { describe, expect, it } from 'vitest';
import { isAnimation, TMDB_ANIMATION_GENRE_ID } from '../../src/core/domain/genres';

describe('isAnimation (FR-059)', () => {
  it('reconoce el nombre en castellano, que es como llega', () => {
    expect(isAnimation(['Animación'])).toBe(true);
  });

  it('lo reconoce sin tilde y en cualquier caja', () => {
    expect(isAnimation(['animacion'])).toBe(true);
    expect(isAnimation(['ANIMACIÓN'])).toBe(true);
  });

  it('reconoce también la forma inglesa, por si cambia el idioma', () => {
    expect(isAnimation(['Animation'])).toBe(true);
  });

  it('basta con que uno de los géneros lo sea', () => {
    expect(isAnimation(['Aventura', 'Animación', 'Familia'])).toBe(true);
  });

  it('no confunde otros géneros', () => {
    expect(isAnimation(['Drama', 'Suspense'])).toBe(false);
    expect(isAnimation([])).toBe(false);
  });

  it('no se deja engañar por un nombre que lo contenga', () => {
    // «Reanimación» contiene «animación» como subcadena: comparar por inclusión
    // en vez de por igualdad daría un falso positivo.
    expect(isAnimation(['Reanimación'])).toBe(false);
  });

  it('el identificador de TMDB es el mismo en películas y series', () => {
    expect(TMDB_ANIMATION_GENRE_ID).toBe(16);
  });
});
