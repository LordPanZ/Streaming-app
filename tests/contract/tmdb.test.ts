/**
 * Contrato §1 · TMDB
 * Cubre FR-004, FR-005, FR-007, FR-011, FR-012, FR-014, FR-016.
 */

import { describe, expect, it } from 'vitest';
import { HttpClient } from '../../src/core/providers/http';
import {
  extractCast,
  extractDirectors,
  extractGenres,
  extractPlatforms,
  GENRE_UNCLASSIFIED,
  imageUrl,
  mapTitle,
  MAX_CAST,
  MAX_DISCOVER_PAGES,
  normalizeImdbId,
  releaseDate,
  titleIdFor,
  TmdbClient,
  tmdbRating,
  type TmdbDetails,
  type TmdbDiscoverPage,
} from '../../src/core/providers/tmdb';
import { createFakeFetch, fetchFromTable, loadFixture } from '../helpers/fake-fetch';

const NOW = new Date('2026-09-10T09:00:00.000Z');

function makeClient(fake: ReturnType<typeof createFakeFetch>) {
  return new TmdbClient({
    apiKey: 'CLAVE-SECRETA',
    http: new HttpClient({ fetchImpl: fake.fetch, sleep: () => Promise.resolve() }),
  });
}

describe('TmdbClient · construcción de peticiones (contrato §1)', () => {
  it('pide el catálogo de proveedores de la región ES', async () => {
    const fake = fetchFromTable([
      ['/watch/providers/movie', { body: await loadFixture('tmdb-providers-es.json') }],
    ]);
    const providers = await makeClient(fake).providerCatalog('movie');

    expect(providers).toHaveLength(12);
    expect(fake.lastUrl()).toContain('/watch/providers/movie');
    expect(fake.lastUrl()).toContain('watch_region=ES');
    expect(fake.lastUrl()).toContain('api_key=CLAVE-SECRETA');
  });

  it('descubre películas con los parámetros de fecha y monetización correctos', async () => {
    const fake = fetchFromTable([
      ['/discover/movie', { body: await loadFixture('tmdb-discover-movie.json') }],
    ]);
    await makeClient(fake).discover({
      mediaType: 'movie',
      providerId: 8,
      from: '2026-09-01',
      to: '2026-09-10',
    });

    const url = decodeURIComponent(fake.lastUrl()!);
    expect(url).toContain('language=es-ES');
    expect(url).toContain('watch_region=ES');
    expect(url).toContain('with_watch_providers=8');
    expect(url).toContain('with_watch_monetization_types=flatrate');
    expect(url).toContain('primary_release_date.gte=2026-09-01');
    expect(url).toContain('primary_release_date.lte=2026-09-10');
    expect(url).toContain('include_adult=false');
  });

  it('usa first_air_date para las series (FR-007)', async () => {
    const fake = fetchFromTable([['/discover/tv', { body: { page: 1, total_pages: 1, results: [] } }]]);
    await makeClient(fake).discover({
      mediaType: 'series',
      providerId: 8,
      from: '2026-09-01',
      to: '2026-09-10',
    });

    const url = decodeURIComponent(fake.lastUrl()!);
    expect(url).toContain('/discover/tv');
    expect(url).toContain('first_air_date.gte=2026-09-01');
    expect(url).toContain('sort_by=first_air_date.desc');
  });

  it('resuelve la ficha en una sola petición con append_to_response', async () => {
    const fake = fetchFromTable([['/movie/1234', { body: await loadFixture('tmdb-movie-details.json') }]]);
    await makeClient(fake).details('movie', 1234);

    const url = decodeURIComponent(fake.lastUrl()!);
    expect(url).toContain('append_to_response=external_ids,videos,watch/providers');
    expect(fake.requests).toHaveLength(1);
  });

  it('pide los vídeos sin filtro de idioma para poder caer al original (FR-016)', async () => {
    const fake = fetchFromTable([['/videos', { body: { results: [] } }]]);
    await makeClient(fake).videos('movie', 1234);
    expect(fake.lastUrl()).not.toContain('language=');
  });
});

describe('TmdbClient · paginación', () => {
  it('recorre todas las páginas declaradas', async () => {
    const page1 = await loadFixture<TmdbDiscoverPage>('tmdb-discover-movie.json');
    const page2 = await loadFixture<TmdbDiscoverPage>('tmdb-discover-movie-page2.json');
    const fake = createFakeFetch((url) => ({ body: url.includes('page=2') ? page2 : page1 }));

    const results = await makeClient(fake).discoverAll({
      mediaType: 'movie',
      providerId: 8,
      from: '2026-09-01',
      to: '2026-09-10',
    });

    expect(results.map((r) => r.id)).toEqual([1234, 5678, 9012]);
    expect(fake.requests).toHaveLength(2);
  });

  it('no supera el tope de seguridad de páginas', async () => {
    const fake = createFakeFetch(() => ({
      body: { page: 1, total_pages: 500, total_results: 10_000, results: [] },
    }));
    await makeClient(fake).discoverAll({
      mediaType: 'movie',
      providerId: 8,
      from: '2026-09-01',
      to: '2026-09-10',
    });
    expect(fake.requests).toHaveLength(MAX_DISCOVER_PAGES);
  });
});

describe('mapeo de la ficha (FR-011, FR-012, FR-016)', () => {
  it('traduce una película completa al dominio', async () => {
    const details = await loadFixture<TmdbDetails>('tmdb-movie-details.json');
    const title = mapTitle({ mediaType: 'movie', details, now: NOW })!;

    expect(title.id).toBe('tmdb:movie:1234');
    expect(title.title).toBe('La hora silenciosa');
    expect(title.originalTitle).toBe('The Quiet Hour');
    expect(title.year).toBe(2026);
    expect(title.runtimeMinutes).toBe(118);
    expect(title.seasons).toBeNull();
    expect(title.genres).toEqual(['Drama', 'Suspense']);
    expect(title.availableFrom).toBe('2026-09-08');
    expect(title.releaseWeek).toBe('2026-W37');
    expect(title.imdbId).toBe('tt9876543');
    expect(title.posterUrl).toBe('https://image.tmdb.org/t/p/w500/poster1.jpg');
  });

  it('elige el tráiler en castellano frente al inglés (FR-016)', async () => {
    const details = await loadFixture<TmdbDetails>('tmdb-movie-details.json');
    const title = mapTitle({ mediaType: 'movie', details, now: NOW })!;

    expect(title.trailer?.youtubeId).toBe('SPANISHKEY1');
    expect(title.trailer?.language).toBe('es');
    expect(title.trailer?.liveness).toBe('unverified');
  });

  it('traduce una serie con temporadas y sin géneros declarados (FR-012)', async () => {
    const details = await loadFixture<TmdbDetails>('tmdb-tv-details.json');
    const title = mapTitle({ mediaType: 'series', details, now: NOW })!;

    expect(title.id).toBe('tmdb:tv:4321');
    expect(title.mediaType).toBe('series');
    expect(title.seasons).toBe(2);
    expect(title.runtimeMinutes).toBeNull();
    expect(title.genres).toEqual([GENRE_UNCLASSIFIED]);
    expect(title.availableFrom).toBe('2026-09-04');
    expect(title.trailer).toBeNull();
  });

  it('descarta la ficha sin fecha de disponibilidad', () => {
    expect(mapTitle({ mediaType: 'movie', details: { id: 1 }, now: NOW })).toBeNull();
  });

  it('descarta la ficha sin plataforma en España', () => {
    const details: TmdbDetails = { id: 1, title: 'X', release_date: '2026-09-08' };
    expect(mapTitle({ mediaType: 'movie', details, now: NOW })).toBeNull();
  });

  it('usa las plataformas del descubrimiento cuando la ficha no las declara', () => {
    const details: TmdbDetails = { id: 1, title: 'X', release_date: '2026-09-08' };
    const title = mapTitle({
      mediaType: 'movie',
      details,
      fallbackPlatforms: [
        { id: 'netflix', name: 'Netflix', providerId: 8, logoUrl: null, link: null },
      ],
      now: NOW,
    });
    expect(title?.platforms.map((p) => p.id)).toEqual(['netflix']);
  });

  it('incorpora vídeos adicionales sin duplicar los que ya tenía', async () => {
    const details = await loadFixture<TmdbDetails>('tmdb-tv-details.json');
    const title = mapTitle({
      mediaType: 'series',
      details,
      extraVideos: [
        { key: 'EXTRA', name: 'Tráiler', site: 'YouTube', type: 'Trailer', iso_639_1: 'es', iso_3166_1: 'ES' },
        { key: 'EXTRA', name: 'Duplicado', site: 'YouTube', type: 'Trailer' },
      ],
      now: NOW,
    });
    expect(title?.trailer?.youtubeId).toBe('EXTRA');
  });
});

describe('reparto y dirección (FR-048)', () => {
  it('vienen en la misma petición, sin consultas adicionales', async () => {
    const fake = fetchFromTable([['/movie/1234', { body: await loadFixture('tmdb-movie-details.json') }]]);
    await makeClient(fake).details('movie', 1234);

    expect(decodeURIComponent(fake.lastUrl()!)).toContain('credits');
    expect(fake.requests).toHaveLength(1);
  });

  it('ordena el reparto por importancia y lo acota', async () => {
    const details = await loadFixture<TmdbDetails>('tmdb-movie-details.json');
    const cast = extractCast(details);

    expect(cast).toHaveLength(MAX_CAST);
    expect(cast[0]).toBe('Irene Balboa');
    // El cuarto de la lista declara `order: 3`, así que va antes que el de `order: 4`.
    expect(cast.indexOf('Marta Oliván')).toBeLessThan(cast.indexOf('Diego Sanz'));
    expect(cast).not.toContain('Sobrante Dos');
  });

  it('saca la dirección del equipo en las películas', async () => {
    const details = await loadFixture<TmdbDetails>('tmdb-movie-details.json');
    // Aparece dos veces en el equipo, con dos puestos: no debe duplicarse.
    expect(extractDirectors(details)).toEqual(['Elena Vicens']);
  });

  it('en las series usa quien la crea, no el equipo', async () => {
    const details = await loadFixture<TmdbDetails>('tmdb-tv-details.json');
    expect(extractDirectors(details)).toEqual(['Nuria Calvo', 'Javier Sedano']);
  });

  it('sin créditos devuelve listas vacías, no huecos', () => {
    expect(extractCast({ id: 1 })).toEqual([]);
    expect(extractDirectors({ id: 1 })).toEqual([]);
    expect(extractCast({ id: 1, credits: { cast: [{ order: 0 }] } })).toEqual([]);
  });

  it('el título mapeado los lleva', async () => {
    const details = await loadFixture<TmdbDetails>('tmdb-movie-details.json');
    const title = mapTitle({ mediaType: 'movie', details, now: NOW })!;

    expect(title.cast).toContain('Irene Balboa');
    expect(title.directors).toEqual(['Elena Vicens']);
  });
});

describe('extractPlatforms (contrato §1.5)', () => {
  it('solo cuenta flatrate y free, nunca alquiler ni compra', async () => {
    const details = await loadFixture<TmdbDetails>('tmdb-movie-details.json');
    const platforms = extractPlatforms(details);
    expect(platforms.map((p) => p.id)).toEqual(['netflix']);
  });

  it('cuenta las gratuitas', async () => {
    const details = await loadFixture<TmdbDetails>('tmdb-tv-details.json');
    expect(extractPlatforms(details).map((p) => p.id)).toEqual(['atresplayer']);
  });

  it('ignora las regiones que no son la pedida', async () => {
    const details = await loadFixture<TmdbDetails>('tmdb-movie-details.json');
    expect(extractPlatforms(details, 'US').map((p) => p.id)).toEqual([]);
  });

  it('descarta proveedores que no están en nuestro catálogo', () => {
    const details: TmdbDetails = {
      id: 1,
      'watch/providers': {
        results: { ES: { flatrate: [{ provider_id: 999, provider_name: 'Canal Random' }] } },
      },
    };
    expect(extractPlatforms(details)).toEqual([]);
  });
});

describe('tmdbRating (FR-014)', () => {
  it('toma la nota cuando hay votos', () => {
    expect(tmdbRating({ id: 1, vote_average: 7.4, vote_count: 212 }).tmdb).toBe(7.4);
  });

  it('sin votos no hay dato: ausente, no cero', () => {
    expect(tmdbRating({ id: 1, vote_average: 0, vote_count: 0 }).tmdb).toBeNull();
  });
});

describe('utilidades de mapeo', () => {
  it('imageUrl compone la URL absoluta y respeta la ausencia', () => {
    expect(imageUrl('/p.jpg', 'w500')).toBe('https://image.tmdb.org/t/p/w500/p.jpg');
    expect(imageUrl(null, 'w500')).toBeNull();
  });

  it('titleIdFor genera identificadores estables y distintos por tipo', () => {
    expect(titleIdFor('movie', 1)).toBe('tmdb:movie:1');
    expect(titleIdFor('series', 1)).toBe('tmdb:tv:1');
  });

  it('releaseDate rechaza fechas mal formadas', () => {
    expect(releaseDate({ id: 1, release_date: '2026-09-08' })).toBe('2026-09-08');
    expect(releaseDate({ id: 1, release_date: '' })).toBeNull();
    expect(releaseDate({ id: 1, release_date: '2026' })).toBeNull();
  });

  it('extractGenres nunca devuelve una lista vacía (FR-012)', () => {
    expect(extractGenres({ id: 1 })).toEqual([GENRE_UNCLASSIFIED]);
    expect(extractGenres({ id: 1, genres: [] })).toEqual([GENRE_UNCLASSIFIED]);
  });

  it('normalizeImdbId valida el formato', () => {
    expect(normalizeImdbId('tt1234567')).toBe('tt1234567');
    expect(normalizeImdbId('  tt1234567 ')).toBe('tt1234567');
    expect(normalizeImdbId('1234567')).toBeNull();
    expect(normalizeImdbId(null)).toBeNull();
    expect(normalizeImdbId('')).toBeNull();
  });
});

describe('verifyKey (FR-036)', () => {
  it('confirma una clave válida', async () => {
    const fake = fetchFromTable([
      ['/watch/providers/movie', { body: await loadFixture('tmdb-providers-es.json') }],
    ]);
    const result = await makeClient(fake).verifyKey();
    expect(result.ok).toBe(true);
  });

  it('informa del fallo sin filtrar la clave (NFR-009)', async () => {
    const fake = fetchFromTable([['/watch/providers/movie', { status: 401, body: {} }]]);
    const result = await makeClient(fake).verifyKey();
    expect(result.ok).toBe(false);
    expect(result.message).not.toContain('CLAVE-SECRETA');
  });

  it('ante un 401 explica la confusión entre la clave v3 y el testigo v4', async () => {
    const fake = fetchFromTable([['/watch/providers/movie', { status: 401, body: {} }]]);
    const client = new TmdbClient({
      apiKey: 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJ4In0.ZmFrZQ',
      http: new HttpClient({ fetchImpl: fake.fetch, sleep: () => Promise.resolve() }),
    });

    const result = await client.verifyKey();
    expect(result.ok).toBe(false);
    expect(result.message).toContain('v3');
    expect(result.message).not.toContain('eyJhbGciOiJIUzI1NiJ9');
  });
});
