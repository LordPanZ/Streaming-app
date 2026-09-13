/**
 * FR-028, FR-057 · la costura entre la interfaz, el validador y el filtro.
 *
 * Esta prueba existe por un fallo concreto: la sección «Me interesa» enviaba
 * `status: 'interested'`, el filtro sabía tratarlo y el tipo lo declaraba, pero
 * el validador de la frontera no lo tenía entre sus valores permitidos y
 * rechazaba la consulta entera. Las tres piezas estaban probadas por separado;
 * lo que nadie recorría era el camino completo.
 *
 * Aquí se recorre: consulta de la sección → validación → filtrado.
 */

import { describe, expect, it } from 'vitest';
import { INTERESTED_QUERY, VIEW_QUERIES } from '../../src/shared/view-queries';
import { parseCatalogQuery } from '../../src/shared/validate';
import { applyQualityFloor, filterViews } from '../../src/core/domain/filters';
import { aggregateCritic, personalScore } from '../../src/core/domain/scoring';
import { defaultCriteria } from '../../src/core/domain/criteria';
import type { TitleView, UserRating } from '../../src/shared/types';
import { makeRatings, makeTitle, makeUserRating } from '../helpers/factories';

const criteria = defaultCriteria();

function view(
  titleOverrides: Parameters<typeof makeTitle>[0] = {},
  rating: UserRating | null = null,
): TitleView {
  const title = makeTitle(titleOverrides);
  const critic = aggregateCritic(title.ratings);
  const personal = rating ? personalScore(rating, criteria) : null;
  return {
    title,
    critic,
    rating,
    personal,
    delta: personal?.score != null && critic.score != null ? personal.score - critic.score : null,
  };
}

describe('las consultas de cada sección pasan la frontera (FR-028)', () => {
  for (const [name, query] of Object.entries(VIEW_QUERIES)) {
    it(`«${name}» no la rechaza el validador`, () => {
      expect(() => parseCatalogQuery(query)).not.toThrow();
    });

    it(`«${name}» conserva lo que la interfaz pidió`, () => {
      const parsed = parseCatalogQuery(query);
      expect(parsed.week).toBe(query.week);
      expect(parsed.status).toBe(query.status);
      expect(parsed.sort).toBe(query.sort);
      expect(parsed.order).toBe(query.order);
      expect(parsed.minCritic).toBe(query.minCritic);
    });
  }
});

describe('la sección «Me interesa» de punta a punta (FR-057)', () => {
  const marcada = view(
    { id: 'marcada', ratings: makeRatings({ imdb: 6 }) },
    makeUserRating({ titleId: 'marcada', watched: false, interested: true }),
  );
  const marcadaYVista = view(
    { id: 'vista', ratings: makeRatings({ imdb: 9 }) },
    makeUserRating({ titleId: 'vista', watched: true, interested: true }),
  );
  const sinMarcar = view({ id: 'sin-marcar', ratings: makeRatings({ imdb: 9 }) });
  const todos = [marcada, marcadaYVista, sinMarcar];

  it('deja pasar solo lo marcado y todavía sin ver', () => {
    const parsed = parseCatalogQuery(INTERESTED_QUERY);
    expect(filterViews(todos, parsed).map((v) => v.title.id)).toEqual(['marcada']);
  });

  it('el listón de calidad no la toca, ni siquiera uno muy alto', () => {
    // `minCritic: 0` viaja en la consulta justo para esto: lo que el usuario
    // apuntó a mano no lo puede esconder un ajuste.
    const parsed = applyQualityFloor(parseCatalogQuery(INTERESTED_QUERY), {
      minCritic: 9,
      includeUnrated: false,
    });
    expect(filterViews(todos, parsed).map((v) => v.title.id)).toEqual(['marcada']);
  });

  it('sin la consulta de la sección se verían todos: la prueba mide algo', () => {
    // Testigo: si el filtro se cayera, este caso y el primero darían lo mismo.
    expect(filterViews(todos, parseCatalogQuery({ week: 'all' })).length).toBe(3);
  });
});
