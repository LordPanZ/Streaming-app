/** FR-016, FR-017, FR-018, FR-019 · selección y respaldo de tráiler */

import { describe, expect, it } from 'vitest';
import {
  buildSearchFallbackUrl,
  candidatePriority,
  needsRevalidation,
  selectTrailer,
  youtubeWatchUrl,
  type VideoCandidate,
} from '../../src/core/domain/trailer';
import { makeTrailer } from '../helpers/factories';

function video(overrides: Partial<VideoCandidate> = {}): VideoCandidate {
  return {
    key: 'k1',
    name: 'Official Trailer',
    site: 'YouTube',
    type: 'Trailer',
    official: true,
    iso_639_1: 'en',
    iso_3166_1: 'US',
    published_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('candidatePriority (FR-016)', () => {
  it('prefiere el tráiler oficial en es-ES por encima de todo', () => {
    const spanish = video({ iso_639_1: 'es', iso_3166_1: 'ES' });
    expect(candidatePriority(spanish)).toBeGreaterThan(candidatePriority(video()));
  });

  it('un teaser en es-ES gana a un tráiler en inglés', () => {
    const teaser = video({ type: 'Teaser', iso_639_1: 'es', iso_3166_1: 'ES', official: false });
    expect(candidatePriority(teaser)).toBeGreaterThan(candidatePriority(video()));
  });

  it('descarta lo que no está en YouTube', () => {
    expect(candidatePriority(video({ site: 'Vimeo' }))).toBe(-1);
  });

  it('descarta tipos de vídeo que no son tráiler, teaser ni clip', () => {
    expect(candidatePriority(video({ type: 'Behind the Scenes' }))).toBe(-1);
  });

  it('reconoce el castellano por el nombre cuando la fuente no etiqueta el idioma', () => {
    const named = video({ name: 'Tráiler en castellano', iso_639_1: null, iso_3166_1: null });
    expect(candidatePriority(named)).toBeGreaterThan(candidatePriority(video({ official: false })));
  });
});

describe('selectTrailer (FR-016)', () => {
  it('elige el teaser es-ES frente al tráiler en-US (criterio de aceptación de FR-016)', () => {
    const chosen = selectTrailer(
      [
        video({ key: 'en', type: 'Trailer' }),
        video({ key: 'es', type: 'Teaser', iso_639_1: 'es', iso_3166_1: 'ES', official: false }),
      ],
      'Una película',
      2026,
    );
    expect(chosen?.youtubeId).toBe('es');
    expect(chosen?.language).toBe('es');
    expect(chosen?.kind).toBe('teaser');
  });

  it('cae al tráiler en versión original si no hay nada en castellano', () => {
    const chosen = selectTrailer([video({ key: 'en' })], 'Una película', 2026);
    expect(chosen?.youtubeId).toBe('en');
    expect(chosen?.language).toBe('original');
  });

  it('nunca marca el enlace como vivo sin verificarlo (Art. IV.3)', () => {
    const chosen = selectTrailer([video()], 'Una película', 2026);
    expect(chosen?.liveness).toBe('unverified');
    expect(chosen?.checkedAt).toBeNull();
  });

  it('siempre incluye el enlace de búsqueda de respaldo (FR-018)', () => {
    const chosen = selectTrailer([video()], 'El juego del calamar', 2026);
    expect(chosen?.searchFallbackUrl).toContain('youtube.com/results');
    expect(decodeURIComponent(chosen!.searchFallbackUrl)).toContain('El juego del calamar');
  });

  it('devuelve null cuando no hay ningún vídeo utilizable', () => {
    expect(selectTrailer([], 'X', 2026)).toBeNull();
    expect(selectTrailer([video({ site: 'Vimeo' })], 'X', 2026)).toBeNull();
  });

  it('a igual prioridad se queda con el más reciente', () => {
    const chosen = selectTrailer(
      [
        video({ key: 'viejo', published_at: '2020-01-01T00:00:00.000Z' }),
        video({ key: 'nuevo', published_at: '2026-01-01T00:00:00.000Z' }),
      ],
      'X',
      2026,
    );
    expect(chosen?.youtubeId).toBe('nuevo');
  });
});

describe('enlaces', () => {
  it('youtubeWatchUrl escapa el identificador', () => {
    expect(youtubeWatchUrl('a&b')).toBe('https://www.youtube.com/watch?v=a%26b');
  });

  it('buildSearchFallbackUrl incluye el año y los términos en castellano (FR-018)', () => {
    const url = decodeURIComponent(buildSearchFallbackUrl('Duna', 2026));
    expect(url).toContain('Duna');
    expect(url).toContain('2026');
    expect(url).toContain('tráiler');
    expect(url).toContain('español');
  });

  it('funciona sin año', () => {
    expect(buildSearchFallbackUrl('Duna', null)).toContain('search_query=');
  });
});

describe('needsRevalidation (FR-019)', () => {
  const recent = ['2026-W37', '2026-W36'];

  it('revalida siempre lo que nunca se ha verificado', () => {
    expect(needsRevalidation(makeTrailer({ liveness: 'unverified' }), '2020-W01', recent)).toBe(true);
  });

  it('revalida lo verificado de las últimas semanas', () => {
    expect(needsRevalidation(makeTrailer({ liveness: 'live' }), '2026-W36', recent)).toBe(true);
  });

  it('no revalida lo antiguo ya verificado', () => {
    expect(needsRevalidation(makeTrailer({ liveness: 'live' }), '2025-W01', recent)).toBe(false);
  });

  it('sin tráiler no hay nada que revalidar', () => {
    expect(needsRevalidation(null, '2026-W37', recent)).toBe(false);
  });
});
