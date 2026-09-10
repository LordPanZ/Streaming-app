/** FR-022, FR-023, FR-026 · criterios de valoración */

import { describe, expect, it } from 'vitest';
import {
  activeCriteria,
  clampScore,
  DEFAULT_CRITERIA,
  defaultCriteria,
  isValidScore,
  mergeCriteria,
  sanitizeScores,
} from '../../src/core/domain/criteria';

describe('criterios por defecto (FR-022)', () => {
  it('define los siete criterios de la especificación', () => {
    expect(DEFAULT_CRITERIA).toHaveLength(7);
    expect(DEFAULT_CRITERIA.map((c) => c.id)).toEqual([
      'story', 'acting', 'direction', 'visuals', 'sound', 'pacing', 'impact',
    ]);
  });

  it('todos tienen peso positivo (invariante 5) y etiqueta en castellano', () => {
    for (const criterion of DEFAULT_CRITERIA) {
      expect(criterion.weight).toBeGreaterThan(0);
      expect(criterion.label.length).toBeGreaterThan(0);
      expect(criterion.description.length).toBeGreaterThan(0);
    }
  });

  it('defaultCriteria devuelve copias independientes', () => {
    const first = defaultCriteria();
    first[0]!.weight = 999;
    expect(defaultCriteria()[0]!.weight).toBe(25);
  });
});

describe('isValidScore (FR-022)', () => {
  it('acepta 0–10 en pasos de 0,5', () => {
    for (const value of [0, 0.5, 5, 7.5, 10]) {
      expect(isValidScore(value)).toBe(true);
    }
  });

  it('rechaza fuera de rango, pasos intermedios y no números', () => {
    for (const value of [-0.5, 10.5, 7.3, NaN, Infinity, '8', null, undefined]) {
      expect(isValidScore(value)).toBe(false);
    }
  });
});

describe('clampScore', () => {
  it('ajusta al paso de 0,5 más cercano dentro del rango', () => {
    expect(clampScore(7.3)).toBe(7.5);
    expect(clampScore(7.2)).toBe(7);
    expect(clampScore(-3)).toBe(0);
    expect(clampScore(99)).toBe(10);
  });
});

describe('sanitizeScores (NFR-008)', () => {
  const criteria = defaultCriteria();

  it('descarta criterios desconocidos', () => {
    expect(sanitizeScores({ story: 8, inventado: 9 }, criteria)).toEqual({ story: 8 });
  });

  it('descarta valores que no son números finitos', () => {
    const result = sanitizeScores(
      { story: '8', acting: NaN, direction: Infinity, visuals: null, sound: 6 },
      criteria,
    );
    expect(result).toEqual({ sound: 6 });
  });

  it('ajusta al paso válido en lugar de rechazar', () => {
    expect(sanitizeScores({ story: 7.3, acting: 99 }, criteria)).toEqual({ story: 7.5, acting: 10 });
  });

  it('un mapa vacío sigue siendo válido (valoración parcial, FR-025)', () => {
    expect(sanitizeScores({}, criteria)).toEqual({});
  });
});

describe('activeCriteria (FR-026)', () => {
  it('filtra los desactivados y respeta el orden declarado', () => {
    const criteria = [
      { id: 'b', label: 'B', description: '', weight: 1, enabled: true, order: 2 },
      { id: 'a', label: 'A', description: '', weight: 1, enabled: true, order: 1 },
      { id: 'c', label: 'C', description: '', weight: 1, enabled: false, order: 0 },
    ];
    expect(activeCriteria(criteria).map((c) => c.id)).toEqual(['a', 'b']);
  });
});

describe('mergeCriteria (FR-026)', () => {
  it('sin nada guardado devuelve los de fábrica', () => {
    expect(mergeCriteria(undefined)).toHaveLength(7);
    expect(mergeCriteria([])).toHaveLength(7);
  });

  it('conserva las personalizaciones del usuario', () => {
    const stored = [
      { id: 'story', label: 'Mi guion', description: '', weight: 50, enabled: true, order: 0 },
    ];
    const merged = mergeCriteria(stored);
    const story = merged.find((c) => c.id === 'story');
    expect(story?.label).toBe('Mi guion');
    expect(story?.weight).toBe(50);
  });

  it('añade los criterios nuevos que introduzca una versión posterior', () => {
    const merged = mergeCriteria([
      { id: 'story', label: 'Guion', description: '', weight: 25, enabled: true, order: 0 },
    ]);
    expect(merged).toHaveLength(7);
    expect(merged.map((c) => c.id)).toContain('impact');
  });

  it('no resucita un criterio que el usuario había desactivado', () => {
    const merged = mergeCriteria(
      DEFAULT_CRITERIA.map((c) => ({ ...c, enabled: c.id !== 'sound' })),
    );
    expect(merged.find((c) => c.id === 'sound')?.enabled).toBe(false);
  });

  it('conserva criterios personalizados que no son de fábrica', () => {
    const merged = mergeCriteria([
      { id: 'mio', label: 'Mío', description: '', weight: 5, enabled: true, order: 0 },
    ]);
    expect(merged.map((c) => c.id)).toContain('mio');
    expect(merged).toHaveLength(8);
  });
});
