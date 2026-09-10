/** FR-029, FR-030, FR-031 · filtrado, búsqueda y ordenación */

import { describe, expect, it } from 'vitest';
import {
  buildFacets,
  compareViews,
  filterViews,
  matchesMinCritic,
  matchesText,
  paginate,
  sortViews,
  MAX_PAGE_SIZE,
} from '../../src/core/domain/filters';
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
  return { title, critic, rating, personal, delta: null };
}

describe('matchesText (FR-031)', () => {
  const target = view({ title: 'El juego del calamar', originalTitle: 'Squid Game' });

  it('busca en el título en castellano', () => {
    expect(matchesText(target, 'calamar')).toBe(true);
  });

  it('busca también en el título original', () => {
    expect(matchesText(target, 'squid')).toBe(true);
  });

  it('ignora tildes y mayúsculas', () => {
    expect(matchesText(view({ title: 'Peñíscola' }), 'PENISCOLA')).toBe(true);
  });

  it('exige todas las palabras pero no la frase literal', () => {
    expect(matchesText(target, 'juego calamar')).toBe(true);
    expect(matchesText(target, 'juego pulpo')).toBe(false);
  });

  it('una búsqueda vacía no filtra', () => {
    expect(matchesText(target, '')).toBe(true);
    expect(matchesText(target, '   ')).toBe(true);
  });
});

describe('matchesMinCritic (FR-029, FR-014)', () => {
  it('un título sin índice no pasa un mínimo: no podemos afirmar que lo cumpla', () => {
    expect(matchesMinCritic(view(), 7)).toBe(false);
  });

  it('sin mínimo pedido, todo pasa', () => {
    expect(matchesMinCritic(view(), undefined)).toBe(true);
    expect(matchesMinCritic(view(), 0)).toBe(true);
  });

  it('compara contra el índice agregado', () => {
    const good = view({ ratings: makeRatings({ imdb: 8 }) });
    expect(matchesMinCritic(good, 7)).toBe(true);
    expect(matchesMinCritic(good, 9)).toBe(false);
  });
});

describe('filterViews (FR-029)', () => {
  const views = [
    view({ id: 'a', mediaType: 'movie', genres: ['Drama'], ratings: makeRatings({ imdb: 8 }) }),
    view(
      { id: 'b', mediaType: 'series', genres: ['Comedia'],
        platforms: [{ id: 'filmin', name: 'Filmin', providerId: 63, logoUrl: null, link: null }] },
      makeUserRating({ titleId: 'b', watched: true, scores: { story: 9 } }),
    ),
    view({ id: 'c', mediaType: 'movie', genres: ['Drama', 'Terror'] }),
  ];

  it('filtra por tipo', () => {
    expect(filterViews(views, { mediaType: 'series' }).map((v) => v.title.id)).toEqual(['b']);
  });

  it('filtra por género con lógica «alguno de»', () => {
    expect(filterViews(views, { genres: ['Terror'] }).map((v) => v.title.id)).toEqual(['c']);
    expect(filterViews(views, { genres: ['Drama', 'Comedia'] })).toHaveLength(3);
  });

  it('filtra por plataforma', () => {
    expect(filterViews(views, { platforms: ['filmin'] }).map((v) => v.title.id)).toEqual(['b']);
  });

  it('filtra por estado visto, pendiente y valorado', () => {
    expect(filterViews(views, { status: 'watched' }).map((v) => v.title.id)).toEqual(['b']);
    expect(filterViews(views, { status: 'pending' }).map((v) => v.title.id)).toEqual(['a', 'c']);
    expect(filterViews(views, { status: 'rated' }).map((v) => v.title.id)).toEqual(['b']);
  });

  it('combina varios filtros a la vez', () => {
    const result = filterViews(views, { mediaType: 'movie', minCritic: 7 });
    expect(result.map((v) => v.title.id)).toEqual(['a']);
  });

  it('sin filtros devuelve todo', () => {
    expect(filterViews(views, {})).toHaveLength(3);
  });
});

describe('sortViews (FR-030)', () => {
  it('ordena por fecha descendente por defecto', () => {
    const views = [
      view({ id: 'viejo', availableFrom: '2026-09-01' }),
      view({ id: 'nuevo', availableFrom: '2026-09-09' }),
    ];
    expect(sortViews(views, 'date', 'desc').map((v) => v.title.id)).toEqual(['nuevo', 'viejo']);
    expect(sortViews(views, 'date', 'asc').map((v) => v.title.id)).toEqual(['viejo', 'nuevo']);
  });

  it('ordena alfabéticamente respetando el castellano', () => {
    const views = [view({ id: 'z', title: 'Ñandú' }), view({ id: 'a', title: 'Naranja' })];
    expect(sortViews(views, 'title', 'asc').map((v) => v.title.title)).toEqual(['Naranja', 'Ñandú']);
  });

  it('manda los títulos sin nota al final en ambos sentidos', () => {
    const views = [
      view({ id: 'sin' }),
      view({ id: 'con', ratings: makeRatings({ imdb: 5 }) }),
    ];
    expect(sortViews(views, 'critic', 'desc')[1]?.title.id).toBe('sin');
    expect(sortViews(views, 'critic', 'asc')[1]?.title.id).toBe('sin');
  });

  it('desempata por título para que el orden sea estable', () => {
    const a = view({ id: 'a', title: 'Alfa', ratings: makeRatings({ imdb: 7 }) });
    const b = view({ id: 'b', title: 'Beta', ratings: makeRatings({ imdb: 7 }) });
    expect(compareViews(a, b, 'critic', 'desc')).toBeLessThan(0);
  });

  it('no muta la lista original', () => {
    const views = [view({ id: 'a' }), view({ id: 'b' })];
    const copy = [...views];
    sortViews(views, 'title', 'desc');
    expect(views).toEqual(copy);
  });
});

describe('paginate', () => {
  const items = Array.from({ length: 10 }, (_, index) => index);

  it('corta por desplazamiento y tamaño', () => {
    expect(paginate(items, 2, 3)).toEqual([2, 3, 4]);
  });

  it('protege contra valores absurdos', () => {
    expect(paginate(items, -5, 0)).toEqual([0]);
    expect(paginate(items, 0, 9999)).toHaveLength(10);
    expect(paginate(Array.from({ length: 500 }, (_, i) => i), 0, 9999)).toHaveLength(MAX_PAGE_SIZE);
  });
});

describe('buildFacets (FR-029)', () => {
  it('cuenta géneros, plataformas y semanas', () => {
    const facets = buildFacets(
      [
        view({ genres: ['Drama'], releaseWeek: '2026-W37' }),
        view({ genres: ['Drama', 'Terror'], releaseWeek: '2026-W36' }),
      ],
      '2026-W37',
    );
    expect(facets.genres.find((g) => g.value === 'Drama')?.count).toBe(2);
    expect(facets.genres.find((g) => g.value === 'Terror')?.count).toBe(1);
    expect(facets.platforms[0]?.name).toBe('Netflix');
    expect(facets.weeks.map((w) => w.value)).toEqual(['2026-W37', '2026-W36']);
    expect(facets.currentWeek).toBe('2026-W37');
    expect(facets.totalTitles).toBe(2);
  });
});
