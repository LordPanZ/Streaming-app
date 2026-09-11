/** Constructores de datos de prueba. Mantienen los invariantes del modelo. */

import type { CriticRatings, Title, Trailer, UserRating } from '../../src/shared/types';
import { emptyCriticRatings } from '../../src/core/domain/scoring';

let counter = 0;

export function makeTitle(overrides: Partial<Title> = {}): Title {
  counter += 1;
  const base: Title = {
    id: `tmdb:movie:${counter}`,
    mediaType: 'movie',
    title: `Película ${counter}`,
    originalTitle: `Movie ${counter}`,
    year: 2026,
    overview: 'Sinopsis de prueba.',
    posterUrl: null,
    backdropUrl: null,
    runtimeMinutes: 100,
    seasons: null,
    genres: ['Drama'],
    platforms: [
      { id: 'netflix', name: 'Netflix', providerId: 8, logoUrl: null, link: null },
    ],
    availableFrom: '2026-09-07',
    releaseWeek: '2026-W37',
    imdbId: null,
    ratings: emptyCriticRatings(),
    trailer: null,
    cast: [],
    directors: [],
    firstSeenAt: '2026-09-07T09:00:00.000Z',
    updatedAt: '2026-09-07T09:00:00.000Z',
  };
  return { ...base, ...overrides };
}

export function makeRatings(overrides: Partial<CriticRatings> = {}): CriticRatings {
  return { ...emptyCriticRatings(), ...overrides };
}

export function makeTrailer(overrides: Partial<Trailer> = {}): Trailer {
  return {
    youtubeId: 'abc123',
    url: 'https://www.youtube.com/watch?v=abc123',
    title: 'Tráiler oficial en castellano',
    language: 'es',
    kind: 'trailer',
    liveness: 'unverified',
    checkedAt: null,
    searchFallbackUrl: 'https://www.youtube.com/results?search_query=x',
    ...overrides,
  };
}

export function makeUserRating(overrides: Partial<UserRating> = {}): UserRating {
  return {
    titleId: 'tmdb:movie:1',
    watched: true,
    watchedAt: '2026-09-08T20:00:00.000Z',
    watchedOnPlatform: null,
    scores: {},
    notes: '',
    createdAt: '2026-09-08T20:00:00.000Z',
    updatedAt: '2026-09-08T20:00:00.000Z',
    ...overrides,
  };
}
