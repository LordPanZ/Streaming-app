/** FR-029, FR-030, FR-031 · filtrado, búsqueda y ordenación */

import { describe, expect, it } from 'vitest';
import {
  applyCatalogDefaults,
  buildFacets,
  compareViews,
  filterViews,
  matchesMinCritic,
  matchesStatus,
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

describe('matchesText sobre todos los campos (FR-055)', () => {
  const target = view({
    title: 'La casa vacía',
    originalTitle: 'The Empty House',
    year: 2026,
    genres: ['Terror', 'Suspense'],
    platforms: [{ id: 'netflix', name: 'Netflix', providerId: 8, logoUrl: null, link: null }],
    cast: ['Penélope Cruz', 'Javier Bardem'],
    directors: ['Alejandro Amenábar'],
    overview: 'Una historia de fantasmas contada en un caserón abandonado.',
  });

  it('encuentra por género', () => {
    expect(matchesText(target, 'terror')).toBe(true);
  });

  it('encuentra por plataforma', () => {
    expect(matchesText(target, 'netflix')).toBe(true);
  });

  it('encuentra por reparto y por dirección, con tildes o sin ellas', () => {
    expect(matchesText(target, 'bardem')).toBe(true);
    expect(matchesText(target, 'penelope')).toBe(true);
    expect(matchesText(target, 'amenabar')).toBe(true);
  });

  it('encuentra por año', () => {
    expect(matchesText(target, '2026')).toBe(true);
  });

  it('encuentra por tipo', () => {
    expect(matchesText(target, 'pelicula')).toBe(true);
    expect(matchesText(view({ mediaType: 'series' }), 'serie')).toBe(true);
  });

  it('cruza campos distintos: «netflix terror» exige las dos cosas', () => {
    // Es lo que hace útil buscar por varios términos: cada palabra puede
    // cumplirse en un campo diferente.
    expect(matchesText(target, 'netflix terror')).toBe(true);
    expect(matchesText(target, 'netflix comedia')).toBe(false);
    expect(matchesText(target, 'filmin terror')).toBe(false);
  });

  it('no busca en la sinopsis, y es deliberado', () => {
    // Con la sinopsis dentro, «historia» o «una» devolverían medio catálogo y
    // el buscador dejaría de servir para encontrar algo concreto.
    expect(matchesText(target, 'fantasmas')).toBe(false);
    expect(matchesText(target, 'caseron')).toBe(false);
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

  it('con includeUnrated, lo que nadie ha puntuado pasa (FR-053)', () => {
    // «Todavía no lo ha visto nadie» no es «es malo»: en los estrenos de la
    // semana es el caso habitual.
    expect(matchesMinCritic(view(), 7, true)).toBe(true);
  });

  it('includeUnrated no indulta a lo que sí tiene nota y no llega', () => {
    const weak = view({ ratings: makeRatings({ imdb: 4 }) });
    expect(matchesMinCritic(weak, 7, true)).toBe(false);
  });

  it('filterViews respeta includeUnrated', () => {
    const views = [
      view({ id: 'buena', ratings: makeRatings({ imdb: 8 }) }),
      view({ id: 'floja', ratings: makeRatings({ imdb: 4 }) }),
      view({ id: 'sin-nota' }),
    ];

    expect(filterViews(views, { minCritic: 7 }).map((v) => v.title.id)).toEqual(['buena']);
    const relaxed = filterViews(views, { minCritic: 7, includeUnrated: true });
    expect(relaxed.map((v) => v.title.id)).toEqual(['buena', 'sin-nota']);
  });
});

describe('applyCatalogDefaults (FR-053, FR-059)', () => {
  const quality = { minCritic: 7, includeUnrated: true, excludeAnimation: false };

  it('aplica el listón guardado cuando la consulta no pide nota mínima', () => {
    expect(applyCatalogDefaults({ week: 'current' }, quality)).toEqual({
      week: 'current',
      minCritic: 7,
      includeUnrated: true,
    });
  });

  it('un cero explícito del usuario manda sobre los ajustes', () => {
    // «Cualquier nota» en la barra de filtros no puede acabar reaplicando el
    // listón: sería ignorar lo que acaba de pedir.
    expect(applyCatalogDefaults({ minCritic: 0 }, quality)).toEqual({ minCritic: 0 });
  });

  it('una nota mínima explícita tampoco se pisa', () => {
    expect(applyCatalogDefaults({ minCritic: 9 }, quality)).toEqual({ minCritic: 9 });
  });

  it('sin listón guardado, la consulta sale intacta', () => {
    const query = { week: 'all' };
    const sinPreferencias = { minCritic: 0, includeUnrated: true, excludeAnimation: false };
    expect(applyCatalogDefaults(query, sinPreferencias)).toEqual(query);
  });

  it('no muta la consulta recibida', () => {
    const query = { week: 'current' };
    applyCatalogDefaults(query, quality);
    expect(query).toEqual({ week: 'current' });
  });
});

describe('exclusión de la animación (FR-059)', () => {
  const dibujos = view({ id: 'dibujos', genres: ['Animación', 'Familia'] });
  const imagenReal = view({ id: 'real', genres: ['Drama'] });
  const anime = view({ id: 'anime', genres: ['Animation', 'Acción'] });
  const todos = [dibujos, imagenReal, anime];

  it('deja fuera la animación cuando se pide', () => {
    const visibles = filterViews(todos, { excludeAnimation: true });
    expect(visibles.map((v) => v.title.id)).toEqual(['real']);
  });

  it('sin pedirlo no filtra nada', () => {
    expect(filterViews(todos, {}).map((v) => v.title.id)).toEqual(['dibujos', 'real', 'anime']);
    expect(filterViews(todos, { excludeAnimation: false })).toHaveLength(3);
  });

  it('el ajuste guardado se hereda, pero un «false» explícito manda', () => {
    // Es el caso de la sección «Me interesa»: lo apuntado a mano se ve aunque
    // sea animación.
    const ajustes = { minCritic: 0, includeUnrated: true, excludeAnimation: true };
    expect(applyCatalogDefaults({}, ajustes).excludeAnimation).toBe(true);
    expect(applyCatalogDefaults({ excludeAnimation: false }, ajustes).excludeAnimation).toBe(false);
  });

  it('los recuentos de la barra también la descuentan', () => {
    const facets = buildFacets(todos, '2026-W37', {
      minCritic: 0,
      includeUnrated: true,
      excludeAnimation: true,
    });
    expect(facets.totalTitles).toBe(3);
    expect(facets.visibleTitles).toBe(1);
    expect(facets.belowFloor).toBe(2);
  });
});

describe('buildFacets con listón de calidad (FR-053)', () => {
  const views = [
    view({ id: 'buena', genres: ['Drama'], ratings: makeRatings({ imdb: 8 }) }),
    view({ id: 'floja', genres: ['Terror'], ratings: makeRatings({ imdb: 4 }) }),
    view({ id: 'sin-nota', genres: ['Terror'] }),
  ];

  it('sin listón cuenta el catálogo entero y no esconde nada', () => {
    const facets = buildFacets(views, '2026-W37');
    expect(facets.totalTitles).toBe(3);
    expect(facets.visibleTitles).toBe(3);
    expect(facets.belowFloor).toBe(0);
  });

  it('los recuentos cuentan lo que se va a ver, no lo guardado', () => {
    // Un «(3)» junto a un género donde solo se pinta uno es un dato que miente.
    const facets = buildFacets(views, '2026-W37', { minCritic: 7, includeUnrated: false });
    expect(facets.totalTitles).toBe(3);
    expect(facets.visibleTitles).toBe(1);
    expect(facets.belowFloor).toBe(2);
    expect(facets.genres).toEqual([{ value: 'Drama', count: 1 }]);
  });

  it('con includeUnrated, los que no tienen nota cuentan', () => {
    const facets = buildFacets(views, '2026-W37', { minCritic: 7, includeUnrated: true });
    expect(facets.visibleTitles).toBe(2);
    expect(facets.belowFloor).toBe(1);
    expect(facets.genres.map((g) => g.value).sort()).toEqual(['Drama', 'Terror']);
  });
});

describe('matchesStatus con «me interesa» (FR-054)', () => {
  const marked = view(
    { id: 'marcada' },
    makeUserRating({ titleId: 'marcada', watched: false, interested: true }),
  );
  const markedAndSeen = view(
    { id: 'vista' },
    makeUserRating({ titleId: 'vista', watched: true, interested: true }),
  );
  const untouched = view({ id: 'nada' });

  it('lista lo marcado y todavía sin ver', () => {
    expect(matchesStatus(marked, 'interested')).toBe(true);
  });

  it('lo ya visto no está en la lista de pendientes, aunque quedara la marca', () => {
    expect(matchesStatus(markedAndSeen, 'interested')).toBe(false);
  });

  it('lo que no se ha marcado no aparece', () => {
    expect(matchesStatus(untouched, 'interested')).toBe(false);
  });

  it('no altera los demás estados', () => {
    expect(matchesStatus(marked, 'pending')).toBe(true);
    expect(matchesStatus(marked, 'watched')).toBe(false);
    expect(matchesStatus(marked, 'all')).toBe(true);
  });

  it('el listón de calidad no puede esconder lo que se apuntó a mano (FR-057)', () => {
    // La sección «Me interesa» consulta con `minCritic: 0` justo por esto: si
    // el usuario marcó una película floja, la marcó a sabiendas y la quiere
    // ver en su lista.
    const floja = view(
      { id: 'floja', ratings: makeRatings({ imdb: 3 }) },
      makeUserRating({ titleId: 'floja', watched: false, interested: true }),
    );

    const conListón = applyCatalogDefaults(
      { status: 'interested', minCritic: 0 },
      { minCritic: 8, includeUnrated: false, excludeAnimation: false },
    );
    expect(filterViews([floja], conListón).map((v) => v.title.id)).toEqual(['floja']);
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
