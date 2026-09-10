/** NFR-003, NFR-004, NFR-009, NFR-010 · reglas transversales del cliente HTTP */

import { describe, expect, it, vi } from 'vitest';
import {
  ALLOWED_HOSTS,
  BlockedHostError,
  HttpClient,
  HttpError,
  sanitizeUrl,
} from '../../src/core/providers/http';
import { ResponseCache } from '../../src/core/providers/cache';
import { createFakeFetch, fetchFromTable } from '../helpers/fake-fetch';

const noSleep = () => Promise.resolve();
const noJitter = () => 0;

function client(fake: ReturnType<typeof createFakeFetch>, extra = {}) {
  return new HttpClient({ fetchImpl: fake.fetch, sleep: noSleep, jitter: noJitter, ...extra });
}

describe('lista blanca de destinos (NFR-010, ADR-010)', () => {
  it('declara exactamente los cuatro destinos del inventario', () => {
    expect([...ALLOWED_HOSTS].sort()).toEqual([
      'api.themoviedb.org',
      'image.tmdb.org',
      'www.omdbapi.com',
      'www.youtube.com',
    ]);
  });

  it('rechaza cualquier otro anfitrión sin llegar a pedir nada', async () => {
    const fake = fetchFromTable([]);
    await expect(client(fake).getJson('https://evil.example.com/x')).rejects.toThrow(BlockedHostError);
    expect(fake.requests).toHaveLength(0);
  });

  it('rechaza una URL mal formada', async () => {
    const fake = fetchFromTable([]);
    await expect(client(fake).getJson('no-es-una-url')).rejects.toThrow(BlockedHostError);
  });

  it('permite los destinos del inventario', async () => {
    const fake = fetchFromTable([['themoviedb', { body: { ok: true } }]]);
    await expect(
      client(fake).getJson('https://api.themoviedb.org/3/configuration'),
    ).resolves.toEqual({ ok: true });
  });
});

describe('saneado de claves (NFR-009)', () => {
  it('enmascara api_key y apikey en cualquier URL', () => {
    expect(sanitizeUrl('https://api.themoviedb.org/3/x?api_key=SECRETO&page=1')).toBe(
      'https://api.themoviedb.org/3/x?api_key=***&page=1',
    );
    expect(sanitizeUrl('https://www.omdbapi.com/?apikey=SECRETO&i=tt1')).toBe(
      'https://www.omdbapi.com/?apikey=***&i=tt1',
    );
  });

  it('la clave no aparece en el error de un 404', async () => {
    const fake = fetchFromTable([['themoviedb', { status: 404, body: {} }]]);
    const promise = client(fake).getJson('https://api.themoviedb.org/3/movie/1?api_key=MI-SECRETO');
    await expect(promise).rejects.toThrow(HttpError);
    await promise.catch((error: Error) => {
      expect(error.message).not.toContain('MI-SECRETO');
      expect(error.message).toContain('***');
    });
  });

  it('la clave no aparece en el error de un fallo de red', async () => {
    const fake = createFakeFetch(() => ({ networkError: 'falló https://x?api_key=MI-SECRETO' }));
    const promise = client(fake).getJson('https://www.omdbapi.com/?apikey=MI-SECRETO&i=tt1');
    await expect(promise).rejects.toThrow();
    await promise.catch((error: Error) => {
      expect(error.message).not.toContain('MI-SECRETO');
    });
  });
});

describe('reintentos y espera exponencial (NFR-003)', () => {
  it('reintenta ante 429 y acaba resolviendo', async () => {
    const fake = createFakeFetch((_url, index) =>
      index < 2 ? { status: 429, body: {} } : { body: { ok: true } },
    );
    const http = client(fake);
    await expect(http.getJson('https://api.themoviedb.org/3/x')).resolves.toEqual({ ok: true });
    expect(fake.requests).toHaveLength(3);
    expect(http.metrics.rateLimited).toBe(2);
    expect(http.metrics.retries).toBe(2);
  });

  it('reintenta ante 5xx', async () => {
    const fake = createFakeFetch((_url, index) =>
      index === 0 ? { status: 503, body: {} } : { body: { ok: true } },
    );
    await expect(client(fake).getJson('https://api.themoviedb.org/3/x')).resolves.toEqual({ ok: true });
    expect(fake.requests).toHaveLength(2);
  });

  it('no reintenta ante un 4xx que no es 429: reintentar no lo arregla', async () => {
    const fake = fetchFromTable([['themoviedb', { status: 401, body: {} }]]);
    await expect(client(fake).getJson('https://api.themoviedb.org/3/x')).rejects.toThrow(HttpError);
    expect(fake.requests).toHaveLength(1);
  });

  it('se rinde tras el número máximo de intentos', async () => {
    const fake = createFakeFetch(() => ({ status: 429, body: {} }));
    await expect(
      client(fake, { maxRetries: 2 }).getJson('https://api.themoviedb.org/3/x'),
    ).rejects.toThrow(/Límite de tasa/);
    expect(fake.requests).toHaveLength(3);
  });

  it('la espera crece exponencialmente', async () => {
    const sleep = vi.fn((_ms: number) => Promise.resolve());
    const fake = createFakeFetch((_u, index) => (index < 3 ? { status: 503, body: {} } : { body: {} }));
    await client(fake, { sleep, baseBackoffMs: 100 }).getJson('https://api.themoviedb.org/3/x');
    expect(sleep.mock.calls.map((call) => call[0])).toEqual([100, 200, 400]);
  });

  it('respeta Retry-After cuando pide más que la espera calculada', async () => {
    const sleep = vi.fn((_ms: number) => Promise.resolve());
    const fake = createFakeFetch((_u, index) =>
      index === 0 ? { status: 429, body: {}, headers: { 'retry-after': '5' } } : { body: {} },
    );
    await client(fake, { sleep, baseBackoffMs: 100 }).getJson('https://api.themoviedb.org/3/x');
    expect(sleep).toHaveBeenCalledWith(5000);
  });
});

describe('caché (NFR-004)', () => {
  it('no repite una petición ya cacheada', async () => {
    const fake = createFakeFetch(() => ({ body: { n: 1 } }));
    const http = client(fake, { cache: new ResponseCache() });
    const url = 'https://api.themoviedb.org/3/x?api_key=K';

    await http.getJson(url, { cacheTtlMs: 60_000 });
    await http.getJson(url, { cacheTtlMs: 60_000 });

    expect(fake.requests).toHaveLength(1);
    expect(http.metrics.cacheHits).toBe(1);
  });

  it('sin tiempo de validez no cachea', async () => {
    const fake = createFakeFetch(() => ({ body: { n: 1 } }));
    const http = client(fake, { cache: new ResponseCache() });
    await http.getJson('https://api.themoviedb.org/3/x');
    await http.getJson('https://api.themoviedb.org/3/x');
    expect(fake.requests).toHaveLength(2);
  });

  it('la entrada caduca', async () => {
    let now = 1000;
    const cache = new ResponseCache(() => now);
    const fake = createFakeFetch(() => ({ body: { n: 1 } }));
    const http = client(fake, { cache });

    await http.getJson('https://api.themoviedb.org/3/x', { cacheTtlMs: 500 });
    now += 600;
    await http.getJson('https://api.themoviedb.org/3/x', { cacheTtlMs: 500 });
    expect(fake.requests).toHaveLength(2);
  });

  it('sobrevive a un reinicio y no guarda claves en el volcado (NFR-009)', () => {
    const cache = new ResponseCache(() => 1000);
    cache.set('https://www.omdbapi.com/?apikey=SECRETO&i=tt1', { ok: true }, 60_000);

    const snapshot = cache.toSnapshot();
    expect(JSON.stringify(snapshot)).not.toContain('SECRETO');

    const restored = ResponseCache.fromSnapshot(snapshot, () => 1000);
    expect(restored.get('https://www.omdbapi.com/?apikey=OTRA-CLAVE&i=tt1')).toEqual({ ok: true });
  });

  it('descarta al restaurar lo que ya había caducado', () => {
    const cache = new ResponseCache(() => 1000);
    cache.set('https://api.themoviedb.org/3/x', { n: 1 }, 100);
    const snapshot = cache.toSnapshot();
    expect(ResponseCache.fromSnapshot(snapshot, () => 999_999).size).toBe(0);
  });
});

describe('probeStatus (base de FR-017)', () => {
  it('devuelve el código sin lanzar ante un 404', async () => {
    const fake = fetchFromTable([['youtube', { status: 404, body: {} }]]);
    await expect(client(fake).probeStatus('https://www.youtube.com/oembed?url=x')).resolves.toBe(404);
  });

  it('devuelve 0 ante un error de red', async () => {
    const fake = createFakeFetch(() => ({ networkError: 'sin conexión' }));
    await expect(client(fake).probeStatus('https://www.youtube.com/oembed?url=x')).resolves.toBe(0);
  });
});

describe('concurrencia (Art. V.1)', () => {
  it('nunca supera el máximo de peticiones simultáneas', async () => {
    let active = 0;
    let peak = 0;
    const fetchImpl = async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return new Response('{}', { status: 200 });
    };

    const http = new HttpClient({ fetchImpl, maxConcurrency: 2, sleep: noSleep });
    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        http.getJson(`https://api.themoviedb.org/3/x?i=${i}`),
      ),
    );
    expect(peak).toBeLessThanOrEqual(2);
  });
});
