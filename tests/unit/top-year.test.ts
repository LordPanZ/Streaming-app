/**
 * FR-058 · recopilación de lo mejor valorado de un año, de punta a punta.
 *
 * Recorre el camino completo con proveedores simulados: descubrimiento por año
 * → ficha → notas de OMDb → media de las tres → lista.
 */

import { describe, expect, it } from 'vitest';
import { HttpClient, type FetchLike } from '../../src/core/providers/http';
import { TmdbClient } from '../../src/core/providers/tmdb';
import { OmdbClient } from '../../src/core/providers/omdb';
import { collectTopOfYear } from '../../src/core/agent/top-year';
import { formatRankingList } from '../../src/core/domain/ranking-format';
import { loadFixture } from '../helpers/fake-fetch';

const NOW = new Date('2026-09-13T09:00:00.000Z');

/** Tres títulos con notas distintas, para que el orden signifique algo. */
const NOTAS: Record<number, { imdb: string; rt: number }> = {
  501: { imdb: '9.0', rt: 95 },
  502: { imdb: '7.0', rt: 65 },
  503: { imdb: '8.0', rt: 85 },
};

async function build(options: { conOmdb?: boolean } = {}) {
  const providers = await loadFixture<Record<string, unknown>>('tmdb-providers-es.json');
  const details = await loadFixture<Record<string, unknown>>('tmdb-movie-details.json');
  const requests: string[] = [];

  const fetchImpl: FetchLike = async (url) => {
    requests.push(url);
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

    if (url.includes('/watch/providers/')) return json(providers);

    if (url.includes('/discover/movie')) {
      // La página 2 vuelve vacía: el recopilador debe parar sin quejarse.
      if (url.includes('page=1')) {
        return json({
          page: 1,
          total_pages: 1,
          results: Object.keys(NOTAS).map((id) => ({ id: Number(id) })),
        });
      }
      return json({ page: 2, total_pages: 1, results: [] });
    }

    const movie = /movie\/(\d+)\?/.exec(url);
    if (movie) {
      const id = Number(movie[1]);
      return json({
        ...details,
        id,
        title: `Película ${id}`,
        vote_average: 6,
        // El 503 llega marcado como animación aunque TMDB no debería haberlo
        // devuelto: sirve para probar la red de seguridad.
        genres: id === 503 ? [{ id: 16, name: 'Animación' }] : [{ id: 18, name: 'Drama' }],
        external_ids: { imdb_id: `tt0000${id}` },
      });
    }

    if (url.includes('omdbapi')) {
      const id = Number(/tt0000(\d+)/.exec(url)?.[1] ?? 0);
      const notas = NOTAS[id];
      return json({
        Response: 'True',
        imdbRating: notas?.imdb ?? 'N/A',
        Ratings: notas ? [{ Source: 'Rotten Tomatoes', Value: `${notas.rt}%` }] : [],
      });
    }

    return json({});
  };

  const http = new HttpClient({ fetchImpl, sleep: () => Promise.resolve(), cache: null });
  return {
    requests,
    tmdb: new TmdbClient({ apiKey: 'K', http }),
    omdb: options.conOmdb === false ? null : new OmdbClient({ apiKey: 'K2', http }),
  };
}

describe('collectTopOfYear (FR-058)', () => {
  it('ordena por la media de las tres fuentes', async () => {
    const world = await build();
    const result = await collectTopOfYear(
      { tmdb: world.tmdb, omdb: world.omdb, now: () => NOW },
      { year: 2024, mediaType: 'movie', providerIds: [8], limit: 10 },
    );

    // 501: (9 + 9,5 + 7,4) / 3 = 8,6 · 503: (8 + 8,5 + 7,4) / 3 = 8,0
    // 502: (7 + 6,5 + 7,4) / 3 = 7,0     ← la nota de TMDB sale de la ficha
    expect(result.ranked.map((entry) => entry.title.title)).toEqual([
      'Película 501',
      'Película 503',
      'Película 502',
    ]);
    expect(result.ranked[0]?.score.sources).toBe(3);
  });

  it('pide el año y el mínimo de votos a TMDB', async () => {
    const world = await build();
    await collectTopOfYear(
      { tmdb: world.tmdb, omdb: world.omdb, now: () => NOW },
      { year: 2024, mediaType: 'movie', providerIds: [8, 119], minVotes: 500 },
    );

    const discover = world.requests.find((url) => url.includes('/discover/movie')) ?? '';
    expect(discover).toContain('primary_release_year=2024');
    expect(discover).toContain('vote_count.gte=500');
    expect(discover).toContain('sort_by=vote_average.desc');
    // Varias plataformas en una sola petición, con el «o» lógico de TMDB.
    expect(decodeURIComponent(discover)).toContain('with_watch_providers=8|119');
  });

  it('sin OMDb lo dice y no finge una media de tres', async () => {
    const world = await build({ conOmdb: false });
    const result = await collectTopOfYear(
      { tmdb: world.tmdb, omdb: null, now: () => NOW },
      { year: 2024, mediaType: 'movie', providerIds: [8] },
    );

    expect(result.issues.join(' ')).toContain('Sin clave de OMDb');
    // Solo queda la nota de TMDB: una fuente no llega al mínimo de dos.
    expect(result.ranked).toEqual([]);
    expect(result.withoutEnoughSources).toBe(3);
  });

  it('pide a TMDB que excluya la animación, por identificador (FR-059)', async () => {
    const world = await build();
    await collectTopOfYear(
      { tmdb: world.tmdb, omdb: world.omdb, now: () => NOW },
      { year: 2024, mediaType: 'movie', providerIds: [8], excludeAnimation: true },
    );

    const discover = world.requests.find((url) => url.includes('/discover/movie')) ?? '';
    // Por número, no por nombre: el catálogo llega traducido.
    expect(discover).toContain('without_genres=16');
  });

  it('descarta la animación que se cuele pese al filtro de TMDB (FR-059)', async () => {
    const world = await build();
    const result = await collectTopOfYear(
      { tmdb: world.tmdb, omdb: world.omdb, now: () => NOW },
      { year: 2024, mediaType: 'movie', providerIds: [8], excludeAnimation: true },
    );

    // La 503 viene marcada como animación en su ficha: no puede entrar.
    expect(result.ranked.map((entry) => entry.title.title)).not.toContain('Película 503');
    expect(result.ranked.map((entry) => entry.title.title)).toEqual([
      'Película 501',
      'Película 502',
    ]);
  });

  it('sin pedirlo, la animación entra como cualquier otra', async () => {
    const world = await build();
    const result = await collectTopOfYear(
      { tmdb: world.tmdb, omdb: world.omdb, now: () => NOW },
      { year: 2024, mediaType: 'movie', providerIds: [8] },
    );
    expect(result.ranked.map((entry) => entry.title.title)).toContain('Película 503');
  });

  it('la lista sale con el formato pedido', async () => {
    const world = await build();
    const result = await collectTopOfYear(
      { tmdb: world.tmdb, omdb: world.omdb, now: () => NOW },
      { year: 2024, mediaType: 'movie', providerIds: [8], limit: 2 },
    );

    const texto = formatRankingList({
      heading: 'Top 2 películas de 2024',
      entries: result.ranked,
    });
    expect(texto.split('\n')[2]).toMatch(/^1\. Película 501 — \d,\d \(Netflix\)$/);
  });
});
