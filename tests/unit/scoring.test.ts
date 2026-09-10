/**
 * FR-014, FR-015, FR-023, FR-024, FR-027 · ADR-008, ADR-009
 */

import { describe, expect, it } from 'vitest';
import {
  aggregateCritic,
  emptyCriticRatings,
  normalizedWeights,
  normalizeCriticValue,
  personalScore,
  personalVsCritic,
} from '../../src/core/domain/scoring';
import { defaultCriteria } from '../../src/core/domain/criteria';
import type { RatingCriterion } from '../../src/shared/types';
import { makeRatings, makeUserRating } from '../helpers/factories';

describe('normalizeCriticValue', () => {
  it('deja IMDb y TMDB en su escala 0–10', () => {
    expect(normalizeCriticValue('imdb', 7.8)).toBe(7.8);
    expect(normalizeCriticValue('tmdb', 6.4)).toBe(6.4);
  });

  it('convierte los porcentajes de Rotten Tomatoes y Metacritic a 0–10', () => {
    expect(normalizeCriticValue('rottenTomatoes', 88)).toBe(8.8);
    expect(normalizeCriticValue('metacritic', 68)).toBe(6.8);
  });

  it('recorta valores fuera de rango en vez de propagarlos', () => {
    expect(normalizeCriticValue('imdb', 12)).toBe(10);
    expect(normalizeCriticValue('imdb', -1)).toBe(0);
  });
});

describe('aggregateCritic (FR-015)', () => {
  it('sin ninguna fuente devuelve ausente y confianza «none» (FR-014)', () => {
    const result = aggregateCritic(emptyCriticRatings());
    expect(result.score).toBeNull();
    expect(result.confidence).toBe('none');
    expect(result.sources).toHaveLength(0);
  });

  it('con IMDb 8.0 y Rotten Tomatoes 90 da entre 8.0 y 9.0 con confianza media', () => {
    const result = aggregateCritic(makeRatings({ imdb: 8, rottenTomatoes: 90 }));
    expect(result.score).toBeGreaterThanOrEqual(8);
    expect(result.score).toBeLessThanOrEqual(9);
    expect(result.confidence).toBe('medium');
  });

  it('escala la confianza con el número de fuentes', () => {
    expect(aggregateCritic(makeRatings({ imdb: 7 })).confidence).toBe('low');
    expect(aggregateCritic(makeRatings({ imdb: 7, tmdb: 7 })).confidence).toBe('medium');
    expect(
      aggregateCritic(makeRatings({ imdb: 7, tmdb: 7, metacritic: 70 })).confidence,
    ).toBe('high');
  });

  it('renormaliza los pesos sobre las fuentes presentes', () => {
    const result = aggregateCritic(makeRatings({ imdb: 8, tmdb: 6 }));
    const total = result.sources.reduce((sum, source) => sum + source.weight, 0);
    expect(total).toBeCloseTo(1, 3);
  });

  it('una nota de 0 real cuenta como dato, no como ausencia', () => {
    const result = aggregateCritic(makeRatings({ imdb: 0 }));
    expect(result.score).toBe(0);
    expect(result.confidence).toBe('low');
  });
});

describe('personalScore (FR-023, FR-024)', () => {
  const criteria = defaultCriteria();

  it('sin valoración devuelve ausente, nunca 0', () => {
    expect(personalScore(null, criteria).score).toBeNull();
  });

  it('con la valoración creada pero sin criterios puntuados devuelve ausente', () => {
    expect(personalScore(makeUserRating({ scores: {} }), criteria).score).toBeNull();
  });

  it('pondera solo los criterios puntuados y renormaliza sus pesos', () => {
    // story (25) = 10, acting (20) = 5 → (10·25 + 5·20) / 45 = 7.8
    const rating = makeUserRating({ scores: { story: 10, acting: 5 } });
    const result = personalScore(rating, criteria);
    expect(result.score).toBe(7.8);
    expect(result.scoredCriteria).toBe(2);
    expect(result.totalCriteria).toBe(criteria.length);
  });

  it('los pesos 3-1-1 equivalen a 60 %, 20 % y 20 % (criterio de FR-023)', () => {
    const custom: RatingCriterion[] = [
      { id: 'a', label: 'A', description: '', weight: 3, enabled: true, order: 0 },
      { id: 'b', label: 'B', description: '', weight: 1, enabled: true, order: 1 },
      { id: 'c', label: 'C', description: '', weight: 1, enabled: true, order: 2 },
    ];
    const weights = normalizedWeights(custom);
    expect(weights.map((w) => w.percent)).toEqual([60, 20, 20]);

    const rating = makeUserRating({ scores: { a: 10, b: 0, c: 0 } });
    expect(personalScore(rating, custom).score).toBe(6);
  });

  it('ignora los criterios desactivados (FR-026)', () => {
    const custom: RatingCriterion[] = [
      { id: 'a', label: 'A', description: '', weight: 1, enabled: true, order: 0 },
      { id: 'b', label: 'B', description: '', weight: 1, enabled: false, order: 1 },
    ];
    const rating = makeUserRating({ scores: { a: 10, b: 0 } });
    expect(personalScore(rating, custom).score).toBe(10);
  });

  it('conserva las puntuaciones históricas de un criterio desactivado', () => {
    const rating = makeUserRating({ scores: { story: 8, obsoleto: 3 } });
    expect(rating.scores.obsoleto).toBe(3);
    expect(personalScore(rating, defaultCriteria()).scoredCriteria).toBe(1);
  });

  it('con todos los pesos a cero reparte por igual en vez de devolver NaN', () => {
    const custom: RatingCriterion[] = [
      { id: 'a', label: 'A', description: '', weight: 0, enabled: true, order: 0 },
      { id: 'b', label: 'B', description: '', weight: 0, enabled: true, order: 1 },
    ];
    const rating = makeUserRating({ scores: { a: 10, b: 6 } });
    expect(personalScore(rating, custom).score).toBe(8);
  });
});

describe('personalVsCritic (FR-027)', () => {
  it('devuelve la diferencia cuando existen ambas notas', () => {
    const personal = personalScore(makeUserRating({ scores: { story: 9 } }), defaultCriteria());
    const critic = aggregateCritic(makeRatings({ imdb: 7 }));
    expect(personalVsCritic(personal, critic)).toBe(2);
  });

  it('no compara contra un dato inexistente', () => {
    const personal = personalScore(makeUserRating({ scores: { story: 9 } }), defaultCriteria());
    expect(personalVsCritic(personal, aggregateCritic(emptyCriticRatings()))).toBeNull();
  });
});
