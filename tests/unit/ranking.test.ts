/**
 * FR-058 · clasificación por la media de IMDb, Rotten Tomatoes y TMDB.
 *
 * El punto delicado es que esta media **no** es el índice de crítica del
 * catálogo: aquel pondera cuatro fuentes, esta promedia tres por igual. Varias
 * de estas pruebas existen solo para que los dos números no se confundan.
 */

import { describe, expect, it } from 'vitest';
import { rankingScore, rankTitles, RANKING_SOURCES } from '../../src/core/domain/ranking';
import {
  formatRankingLine,
  formatRankingList,
  formatRankingScore,
} from '../../src/core/domain/ranking-format';
import { aggregateCritic } from '../../src/core/domain/scoring';
import { makeRatings, makeTitle } from '../helpers/factories';

describe('rankingScore (FR-058)', () => {
  it('promedia las tres por igual, normalizando Rotten Tomatoes', () => {
    // IMDb 8, RT 90 → 9, TMDB 7  ⇒  (8 + 9 + 7) / 3 = 8
    const title = makeTitle({ ratings: makeRatings({ imdb: 8, rottenTomatoes: 90, tmdb: 7 }) });
    const result = rankingScore(title);
    expect(result.score).toBe(8);
    expect(result.sources).toBe(3);
  });

  it('no es el índice ponderado del catálogo', () => {
    // Con estas notas los dos números difieren: si alguien las unificara sin
    // querer, esta prueba lo diría.
    const ratings = makeRatings({ imdb: 6, rottenTomatoes: 100, tmdb: 6, metacritic: 20 });
    const title = makeTitle({ ratings });
    expect(rankingScore(title).score).not.toBe(aggregateCritic(ratings).score);
  });

  it('ignora Metacritic, que no está entre las tres', () => {
    const conMeta = makeTitle({ ratings: makeRatings({ imdb: 8, tmdb: 8, metacritic: 10 }) });
    const sinMeta = makeTitle({ ratings: makeRatings({ imdb: 8, tmdb: 8 }) });
    expect(rankingScore(conMeta).score).toBe(rankingScore(sinMeta).score);
    expect(RANKING_SOURCES).not.toContain('metacritic');
  });

  it('lo ausente no cuenta como cero: promedia sobre las que hay', () => {
    // Con el cero, (8 + 0) / 2 = 4. Sin él, 8. La diferencia es la honradez.
    const title = makeTitle({ ratings: makeRatings({ imdb: 8 }) });
    expect(rankingScore(title).score).toBe(8);
    expect(rankingScore(title).sources).toBe(1);
  });

  it('sin ninguna nota devuelve nulo, no un cero', () => {
    expect(rankingScore(makeTitle()).score).toBeNull();
    expect(rankingScore(makeTitle()).sources).toBe(0);
  });

  it('dice qué fuentes aportaron', () => {
    const title = makeTitle({ ratings: makeRatings({ imdb: 7, tmdb: 9 }) });
    expect(rankingScore(title).present).toEqual(['imdb', 'tmdb']);
  });
});

describe('rankTitles (FR-058)', () => {
  const excelente = makeTitle({
    title: 'Excelente',
    ratings: makeRatings({ imdb: 9, rottenTomatoes: 95, tmdb: 9 }),
  });
  const buena = makeTitle({
    title: 'Buena',
    ratings: makeRatings({ imdb: 8, rottenTomatoes: 80, tmdb: 8 }),
  });
  const floja = makeTitle({
    title: 'Floja',
    ratings: makeRatings({ imdb: 4, rottenTomatoes: 40, tmdb: 4 }),
  });
  const soloTmdb = makeTitle({ title: 'Solo TMDB', ratings: makeRatings({ tmdb: 10 }) });

  it('ordena de mejor a peor', () => {
    const ranked = rankTitles([floja, excelente, buena]);
    expect(ranked.map((entry) => entry.title.title)).toEqual(['Excelente', 'Buena', 'Floja']);
  });

  it('deja fuera lo que tiene una sola fuente', () => {
    // Un 10 de TMDB y nada más no es una media, y en la práctica es lo que
    // llenaría la lista de títulos que nadie más ha puntuado.
    const ranked = rankTitles([buena, soloTmdb]);
    expect(ranked.map((entry) => entry.title.title)).toEqual(['Buena']);
  });

  it('el mínimo de fuentes se puede relajar a propósito', () => {
    const ranked = rankTitles([buena, soloTmdb], { minSources: 1 });
    expect(ranked.map((entry) => entry.title.title)).toEqual(['Solo TMDB', 'Buena']);
  });

  it('a igual media, manda la que tiene más fuentes', () => {
    const tres = makeTitle({
      title: 'Con tres',
      ratings: makeRatings({ imdb: 8, rottenTomatoes: 80, tmdb: 8 }),
    });
    const dos = makeTitle({ title: 'Con dos', ratings: makeRatings({ imdb: 8, tmdb: 8 }) });
    expect(rankTitles([dos, tres]).map((e) => e.title.title)).toEqual(['Con tres', 'Con dos']);
  });

  it('recorta al tope pedido', () => {
    expect(rankTitles([excelente, buena, floja], { limit: 2 })).toHaveLength(2);
  });

  it('sin notas suficientes devuelve lista vacía, no inventa', () => {
    expect(rankTitles([makeTitle(), makeTitle()])).toEqual([]);
  });
});

describe('formato de la clasificación (FR-058)', () => {
  const entry = {
    title: makeTitle({
      title: 'La hora silenciosa',
      platforms: [{ id: 'netflix', name: 'Netflix', providerId: 8, logoUrl: null, link: null }],
      ratings: makeRatings({ imdb: 8, rottenTomatoes: 90, tmdb: 7 }),
    }),
    score: { score: 8.4, sources: 3, present: [] as never[] },
  };

  it('la nota lleva coma decimal', () => {
    expect(formatRankingScore(8.4)).toBe('8,4');
    expect(formatRankingScore(9)).toBe('9,0');
  });

  it('entre paréntesis va la plataforma, y solo la plataforma', () => {
    expect(formatRankingLine(entry, 1)).toBe('1. La hora silenciosa — 8,4 (Netflix)');
  });

  it('con varias plataformas las lista todas', () => {
    const varias = {
      ...entry,
      title: makeTitle({
        title: 'Doble',
        platforms: [
          { id: 'netflix', name: 'Netflix', providerId: 8, logoUrl: null, link: null },
          { id: 'filmin', name: 'Filmin', providerId: 63, logoUrl: null, link: null },
        ],
      }),
    };
    expect(formatRankingLine(varias, 2)).toBe('2. Doble — 8,4 (Netflix, Filmin)');
  });

  it('marca con asterisco la media que no sale de las tres fuentes', () => {
    const parcial = { ...entry, score: { score: 8.4, sources: 2, present: [] as never[] } };
    expect(formatRankingLine(parcial, 3)).toBe('3. La hora silenciosa — 8,4 * (Netflix)');
  });

  it('la lista lleva cabecera, numeración y la nota al pie solo si hace falta', () => {
    const completa = formatRankingList({ heading: 'Top 1 películas de 2024', entries: [entry] });
    expect(completa).toContain('Top 1 películas de 2024');
    expect(completa).toContain('1. La hora silenciosa — 8,4 (Netflix)');
    expect(completa).not.toContain('*');

    const parcial = formatRankingList({
      heading: 'Top 1',
      entries: [{ ...entry, score: { score: 7, sources: 2, present: [] as never[] } }],
    });
    expect(parcial).toContain('* Media de dos fuentes');
  });

  it('una lista vacía lo dice en vez de quedarse en blanco', () => {
    expect(formatRankingList({ heading: 'Top 10', entries: [] })).toContain(
      'ningún título reúne notas suficientes',
    );
  });
});
