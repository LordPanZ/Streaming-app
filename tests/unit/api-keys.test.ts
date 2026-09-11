/** FR-035, FR-050 · reconocimiento de las claves antes de usarlas */

import { describe, expect, it } from 'vitest';
import {
  classifyOmdbKey,
  classifyTmdbKey,
  omdbKeyWarning,
  tmdbKeyWarning,
} from '../../src/core/domain/api-keys';

const V3 = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const V4 =
  'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJhMWIyYzNkNCIsInN1YiI6IjY1MCJ9.Qw3rT5yU7iO9pAsDfGhJkLzXcVbNm';

describe('classifyTmdbKey', () => {
  it('reconoce la clave v3, que es la que usamos', () => {
    expect(classifyTmdbKey(V3)).toBe('v3');
    expect(classifyTmdbKey(V3.toUpperCase())).toBe('v3');
    expect(classifyTmdbKey(`  ${V3}  `)).toBe('v3');
  });

  it('reconoce el testigo v4, que es el que la gente copia por error', () => {
    expect(classifyTmdbKey(V4)).toBe('v4-token');
    // Aunque venga truncado al copiar, el prefijo ya lo delata.
    expect(classifyTmdbKey('eyJhbGciOiJIUzI1NiJ9')).toBe('v4-token');
  });

  it('distingue lo vacío de lo irreconocible', () => {
    expect(classifyTmdbKey('')).toBe('empty');
    expect(classifyTmdbKey('   ')).toBe('empty');
    expect(classifyTmdbKey('mi-clave-secreta')).toBe('unknown');
    // 31 caracteres: casi, pero no.
    expect(classifyTmdbKey(V3.slice(0, 31))).toBe('unknown');
  });
});

describe('tmdbKeyWarning', () => {
  it('no molesta cuando la clave es la correcta', () => {
    expect(tmdbKeyWarning(V3)).toBeNull();
    expect(tmdbKeyWarning('')).toBeNull();
  });

  it('explica el error del v4 diciendo dónde está la buena', () => {
    const warning = tmdbKeyWarning(V4);
    expect(warning).toContain('v4');
    expect(warning).toContain('v3');
    expect(warning).toContain('32');
  });

  it('ante un formato desconocido avisa pero no cierra la puerta', () => {
    const warning = tmdbKeyWarning('algo-raro');
    expect(warning).toContain('intentará');
  });
});

describe('claves de OMDb', () => {
  it('acepta el formato corto habitual', () => {
    expect(classifyOmdbKey('a1b2c3d4')).toBe('plausible');
    expect(omdbKeyWarning('a1b2c3d4')).toBeNull();
  });

  it('avisa de lo que no lo parece, sin bloquearlo', () => {
    expect(classifyOmdbKey(V4)).toBe('unknown');
    expect(omdbKeyWarning(V4)).toContain('intentará');
  });

  it('lo vacío no genera aviso', () => {
    expect(classifyOmdbKey('')).toBe('empty');
    expect(omdbKeyWarning('')).toBeNull();
  });
});
