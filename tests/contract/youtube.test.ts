/** Contrato §3 · verificación de tráileres (FR-017, ADR-004) */

import { describe, expect, it } from 'vitest';
import { HttpClient } from '../../src/core/providers/http';
import {
  livenessFromStatus,
  oembedUrlFor,
  YoutubeVerifier,
} from '../../src/core/providers/youtube';
import { createFakeFetch, fetchFromTable } from '../helpers/fake-fetch';
import { makeTrailer } from '../helpers/factories';

const NOW = new Date('2026-09-10T09:00:00.000Z');

function verifier(fake: ReturnType<typeof createFakeFetch>) {
  return new YoutubeVerifier(
    new HttpClient({ fetchImpl: fake.fetch, sleep: () => Promise.resolve() }),
  );
}

describe('oembedUrlFor', () => {
  it('construye la URL del punto oEmbed con el vídeo escapado', () => {
    const url = oembedUrlFor('abc123');
    expect(url).toContain('https://www.youtube.com/oembed');
    expect(url).toContain('format=json');
    expect(decodeURIComponent(url)).toContain('https://www.youtube.com/watch?v=abc123');
  });
});

describe('livenessFromStatus (ADR-004)', () => {
  it('solo un 200 autoriza a decir «vivo»', () => {
    expect(livenessFromStatus(200)).toBe('live');
  });

  it('401, 403 y 404 significan retirado o restringido', () => {
    expect(livenessFromStatus(401)).toBe('dead');
    expect(livenessFromStatus(403)).toBe('dead');
    expect(livenessFromStatus(404)).toBe('dead');
  });

  it('lo demás queda sin verificar, que no es lo mismo que muerto', () => {
    expect(livenessFromStatus(500)).toBe('unverified');
    expect(livenessFromStatus(0)).toBe('unverified');
    expect(livenessFromStatus(302)).toBe('unverified');
  });
});

describe('YoutubeVerifier (FR-017)', () => {
  it('marca como vivo un vídeo que responde 200', async () => {
    const fake = fetchFromTable([['oembed', { body: { title: 'Tráiler' } }]]);
    const verified = await verifier(fake).verify(makeTrailer(), NOW);

    expect(verified.liveness).toBe('live');
    expect(verified.checkedAt).toBe(NOW.toISOString());
  });

  it('marca como muerto un vídeo retirado (criterio de aceptación de FR-017)', async () => {
    const fake = fetchFromTable([['oembed', { status: 404, body: {} }]]);
    const verified = await verifier(fake).verify(makeTrailer(), NOW);

    expect(verified.liveness).toBe('dead');
    expect(verified.checkedAt).toBe(NOW.toISOString());
  });

  it('un fallo de red deja el enlace sin verificar, nunca vivo (Art. IV.3)', async () => {
    const fake = createFakeFetch(() => ({ networkError: 'sin conexión' }));
    const verified = await verifier(fake).verify(makeTrailer(), NOW);

    expect(verified.liveness).toBe('unverified');
    expect(verified.checkedAt).toBeNull();
  });

  it('no pierde el enlace de búsqueda de respaldo al verificar (FR-018)', async () => {
    const fake = fetchFromTable([['oembed', { status: 404, body: {} }]]);
    const original = makeTrailer({ searchFallbackUrl: 'https://www.youtube.com/results?search_query=x' });
    const verified = await verifier(fake).verify(original, NOW);

    expect(verified.searchFallbackUrl).toBe(original.searchFallbackUrl);
    expect(verified.youtubeId).toBe(original.youtubeId);
  });

  it('conserva la fecha de la última verificación buena si ahora no se puede comprobar', async () => {
    const fake = createFakeFetch(() => ({ networkError: 'sin conexión' }));
    const previous = makeTrailer({ liveness: 'live', checkedAt: '2026-09-01T00:00:00.000Z' });
    const verified = await verifier(fake).verify(previous, NOW);

    expect(verified.liveness).toBe('unverified');
    expect(verified.checkedAt).toBe('2026-09-01T00:00:00.000Z');
  });
});
