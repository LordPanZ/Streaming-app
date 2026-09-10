/**
 * Contrato §2 · OMDb
 * Cubre FR-013 y, sobre todo, FR-014: una nota ausente jamás vale cero.
 */

import { describe, expect, it } from 'vitest';
import { HttpClient } from '../../src/core/providers/http';
import {
  hasRatings,
  OmdbClient,
  parseNumeric,
  parseOmdbRatings,
  parseRatingValue,
  type OmdbResponse,
} from '../../src/core/providers/omdb';
import { fetchFromTable, loadFixture } from '../helpers/fake-fetch';

const NOW = new Date('2026-09-10T09:00:00.000Z');

function makeClient(fake: ReturnType<typeof fetchFromTable>) {
  return new OmdbClient({
    apiKey: 'CLAVE-SECRETA',
    http: new HttpClient({ fetchImpl: fake.fetch, sleep: () => Promise.resolve() }),
  });
}

describe('parseRatingValue (contrato §2)', () => {
  it('interpreta los tres formatos que devuelve OMDb', () => {
    expect(parseRatingValue('88%')).toBe(88);
    expect(parseRatingValue('7.8/10')).toBe(7.8);
    expect(parseRatingValue('68/100')).toBe(68);
  });

  it('tolera espacios', () => {
    expect(parseRatingValue(' 88 % ')).toBe(88);
    expect(parseRatingValue('7.8 / 10')).toBe(7.8);
  });

  it('devuelve null ante lo ininteligible', () => {
    expect(parseRatingValue('algo raro')).toBeNull();
    expect(parseRatingValue('N/A')).toBeNull();
    expect(parseRatingValue('')).toBeNull();
  });
});

describe('parseNumeric', () => {
  it('quita los separadores de millar', () => {
    expect(parseNumeric('12,345')).toBe(12345);
  });

  it('trata N/A y lo vacío como ausencia, no como cero (FR-014)', () => {
    expect(parseNumeric('N/A')).toBeNull();
    expect(parseNumeric('')).toBeNull();
    expect(parseNumeric(undefined)).toBeNull();
    expect(parseNumeric(null)).toBeNull();
  });

  it('un cero real sí es un dato', () => {
    expect(parseNumeric('0')).toBe(0);
  });
});

describe('parseOmdbRatings (FR-013, FR-014)', () => {
  it('extrae las tres fuentes de una respuesta completa', async () => {
    const response = await loadFixture<OmdbResponse>('omdb-full.json');
    const ratings = parseOmdbRatings(response, NOW);

    expect(ratings.imdb).toBe(7.8);
    expect(ratings.rottenTomatoes).toBe(88);
    expect(ratings.metacritic).toBe(68);
    expect(ratings.imdbVotes).toBe(12345);
    expect(ratings.fetchedAt).toBe(NOW.toISOString());
  });

  it('deja ausente lo que viene como N/A e ignora fuentes desconocidas', async () => {
    const response = await loadFixture<OmdbResponse>('omdb-partial.json');
    const ratings = parseOmdbRatings(response, NOW);

    expect(ratings.rottenTomatoes).toBe(62);
    expect(ratings.imdb).toBeNull();
    expect(ratings.metacritic).toBeNull();
    expect(ratings.imdbVotes).toBeNull();
  });

  it('una respuesta negativa deja todas las notas ausentes', async () => {
    const response = await loadFixture<OmdbResponse>('omdb-not-found.json');
    const ratings = parseOmdbRatings(response, NOW);

    expect(ratings.imdb).toBeNull();
    expect(ratings.rottenTomatoes).toBeNull();
    expect(ratings.metacritic).toBeNull();
    expect(ratings.fetchedAt).toBeNull();
    expect(hasRatings(ratings)).toBe(false);
  });

  it('nunca convierte una ausencia en cero (FR-014)', () => {
    const ratings = parseOmdbRatings({ Response: 'True', Ratings: [] }, NOW);
    expect(ratings.imdb).not.toBe(0);
    expect(ratings.rottenTomatoes).not.toBe(0);
    expect(ratings.metacritic).not.toBe(0);
  });

  it('los campos sueltos actúan de respaldo cuando falta la fuente en Ratings', () => {
    const ratings = parseOmdbRatings(
      { Response: 'True', imdbRating: '6.5', Metascore: '55', Ratings: [] },
      NOW,
    );
    expect(ratings.imdb).toBe(6.5);
    expect(ratings.metacritic).toBe(55);
  });

  it('Ratings manda sobre los campos sueltos', () => {
    const ratings = parseOmdbRatings(
      {
        Response: 'True',
        imdbRating: '1.0',
        Ratings: [{ Source: 'Internet Movie Database', Value: '9.0/10' }],
      },
      NOW,
    );
    expect(ratings.imdb).toBe(9);
  });

  it('tolera entradas malformadas dentro de Ratings sin romperse', () => {
    const ratings = parseOmdbRatings(
      {
        Response: 'True',
        Ratings: [
          null as never,
          { Source: 'Rotten Tomatoes' } as never,
          { Source: 'Rotten Tomatoes', Value: '70%' },
        ],
      },
      NOW,
    );
    expect(ratings.rottenTomatoes).toBe(70);
  });

  it('no deja la nota de TMDB dentro: esa fuente no es de OMDb', async () => {
    const response = await loadFixture<OmdbResponse>('omdb-full.json');
    expect(parseOmdbRatings(response, NOW).tmdb).toBeNull();
  });
});

describe('OmdbClient', () => {
  it('consulta por identificador de IMDb', async () => {
    const fake = fetchFromTable([['omdbapi', { body: await loadFixture('omdb-full.json') }]]);
    const ratings = await makeClient(fake).ratingsFor('tt9876543', NOW);

    expect(ratings.imdb).toBe(7.8);
    expect(fake.lastUrl()).toContain('i=tt9876543');
    expect(fake.lastUrl()).toContain('apikey=CLAVE-SECRETA');
  });

  it('un título desconocido no es un error de red', async () => {
    const fake = fetchFromTable([['omdbapi', { body: await loadFixture('omdb-not-found.json') }]]);
    await expect(makeClient(fake).ratingsFor('tt0000000', NOW)).resolves.toMatchObject({
      imdb: null,
      rottenTomatoes: null,
    });
  });

  it('verifyKey confirma una clave válida', async () => {
    const fake = fetchFromTable([['omdbapi', { body: await loadFixture('omdb-full.json') }]]);
    await expect(makeClient(fake).verifyKey()).resolves.toMatchObject({ ok: true });
  });

  it('verifyKey informa del rechazo sin filtrar la clave (NFR-009)', async () => {
    const fake = fetchFromTable([
      ['omdbapi', { body: { Response: 'False', Error: 'Invalid API key!' } }],
    ]);
    const result = await makeClient(fake).verifyKey();
    expect(result.ok).toBe(false);
    expect(result.message).not.toContain('CLAVE-SECRETA');
  });
});
