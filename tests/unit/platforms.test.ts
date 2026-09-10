/** FR-005, FR-006 · cobertura de plataformas y resolución dinámica */

import { describe, expect, it } from 'vitest';
import {
  defaultPlatformToggles,
  getPlatform,
  normalizeName,
  PLATFORMS,
  platformIdForProviderName,
  platformName,
  resolvePlatforms,
} from '../../src/core/domain/platforms';

const REQUIRED_BY_SPEC = [
  'netflix', 'prime-video', 'disney-plus', 'hbo-max', 'movistar-plus',
  'apple-tv-plus', 'skyshowtime', 'filmin', 'crunchyroll', 'atresplayer',
  'rakuten-tv', 'pluto-tv',
];

describe('catálogo de plataformas (FR-005)', () => {
  it('cubre como mínimo las plataformas que exige la especificación', () => {
    const ids = PLATFORMS.map((platform) => platform.id);
    for (const required of REQUIRED_BY_SPEC) {
      expect(ids).toContain(required);
    }
  });

  it('no repite identificadores ni identificadores de proveedor', () => {
    const ids = PLATFORMS.map((p) => p.id);
    const providerIds = PLATFORMS.map((p) => p.providerIdHint);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(providerIds).size).toBe(providerIds.length);
  });

  it('activa todas por defecto', () => {
    const toggles = defaultPlatformToggles();
    expect(Object.values(toggles).every(Boolean)).toBe(true);
    expect(Object.keys(toggles)).toHaveLength(PLATFORMS.length);
  });

  it('platformName cae al identificador si no conoce la plataforma', () => {
    expect(platformName('netflix')).toBe('Netflix');
    expect(platformName('inventada')).toBe('inventada');
    expect(getPlatform('inventada')).toBeUndefined();
  });
});

describe('normalizeName', () => {
  it('ignora mayúsculas, tildes y signos', () => {
    expect(normalizeName('Movistar Plus+')).toBe(normalizeName('movistar plus'));
    expect(normalizeName('HBO  Max')).toBe(normalizeName('hbo-max'));
    expect(normalizeName('HBO España')).toBe('hboespana');
  });

  it('no confunde plataformas distintas', () => {
    expect(normalizeName('Disney+')).not.toBe(normalizeName('Disney Junior'));
  });
});

describe('platformIdForProviderName', () => {
  it('reconoce los alias declarados', () => {
    expect(platformIdForProviderName('Amazon Prime Video')).toBe('prime-video');
    expect(platformIdForProviderName('Disney Plus')).toBe('disney-plus');
    expect(platformIdForProviderName('Max')).toBe('hbo-max');
    expect(platformIdForProviderName('Apple TV Plus')).toBe('apple-tv-plus');
  });

  it('devuelve null para lo desconocido en vez de adivinar', () => {
    expect(platformIdForProviderName('Canal Random')).toBeNull();
  });
});

describe('resolvePlatforms (FR-006)', () => {
  it('usa el identificador del catálogo cuando difiere de la pista', () => {
    const resolution = resolvePlatforms(
      ['netflix'],
      [{ provider_id: 9999, provider_name: 'Netflix', logo_path: '/n.jpg' }],
    );
    expect(resolution.resolved[0]?.providerId).toBe(9999);
    expect(resolution.resolved[0]?.driftedFromHint).toBe(true);
    expect(resolution.drift.join(' ')).toContain('9999');
  });

  it('no marca discrepancia cuando coincide con la pista', () => {
    const resolution = resolvePlatforms(
      ['netflix'],
      [{ provider_id: 8, provider_name: 'Netflix' }],
    );
    expect(resolution.resolved[0]?.driftedFromHint).toBe(false);
    expect(resolution.drift).toHaveLength(0);
  });

  it('resuelve por alias cuando el catálogo usa otro nombre', () => {
    const resolution = resolvePlatforms(
      ['hbo-max'],
      [{ provider_id: 1899, provider_name: 'Max' }],
    );
    expect(resolution.resolved[0]?.id).toBe('hbo-max');
    expect(resolution.resolved[0]?.providerId).toBe(1899);
  });

  it('cae a la pista y lo anota cuando la plataforma no está en el catálogo', () => {
    const resolution = resolvePlatforms(['filmin'], []);
    expect(resolution.resolved[0]?.providerId).toBe(63);
    expect(resolution.drift[0]).toContain('respaldo');
  });

  it('señala como no resueltas las plataformas que no existen en el proyecto', () => {
    const resolution = resolvePlatforms(['fantasma'], []);
    expect(resolution.resolved).toHaveLength(0);
    expect(resolution.unresolved).toEqual(['fantasma']);
  });

  it('respeta el orden y el número de plataformas pedidas', () => {
    const catalog = [
      { provider_id: 8, provider_name: 'Netflix' },
      { provider_id: 337, provider_name: 'Disney Plus' },
    ];
    const resolution = resolvePlatforms(['disney-plus', 'netflix'], catalog);
    expect(resolution.resolved.map((p) => p.id)).toEqual(['disney-plus', 'netflix']);
  });
});
