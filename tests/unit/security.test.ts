/**
 * NFR-009 y Art. III · las claves de API no sobreviven a nada que se escriba
 * en disco, se muestre al usuario o se exporte.
 */

import { describe, expect, it } from 'vitest';
import { sanitizeMessage, sanitizeUrl } from '../../src/core/providers/http';
import { ResponseCache } from '../../src/core/providers/cache';
import { describeError, RunRecorder, sanitizeIssue } from '../../src/core/agent/report';
import { buildExportBundle } from '../../src/core/store/transfer';
import { CatalogStore } from '../../src/core/store/catalog';
import { RatingsStore } from '../../src/core/store/ratings';
import { SettingsStore } from '../../src/core/store/settings';
import { RunsStore } from '../../src/core/store/runs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpError } from '../../src/core/providers/http';

const SECRET = 'abcdef0123456789SECRETO';

describe('sanitizeUrl (NFR-009)', () => {
  it('enmascara todos los nombres de parámetro sensibles', () => {
    const url = `https://x/y?api_key=${SECRET}&apikey=${SECRET}&token=${SECRET}&key=${SECRET}&page=2`;
    const safe = sanitizeUrl(url);
    expect(safe).not.toContain(SECRET);
    expect(safe).toContain('page=2');
  });

  it('es insensible a mayúsculas en el nombre del parámetro', () => {
    expect(sanitizeUrl(`https://x/y?API_KEY=${SECRET}`)).not.toContain(SECRET);
  });

  it('no toca una URL sin secretos', () => {
    expect(sanitizeUrl('https://x/y?page=2')).toBe('https://x/y?page=2');
  });
});

describe('mensajes de error', () => {
  it('describeError sanea el texto de cualquier excepción', () => {
    const error = new Error(`falló https://www.omdbapi.com/?apikey=${SECRET}`);
    expect(describeError(error)).not.toContain(SECRET);
  });

  it('describeError acepta lo que no es un Error', () => {
    expect(describeError(`api_key=${SECRET}`)).not.toContain(SECRET);
  });

  it('HttpError guarda la URL ya saneada', () => {
    const error = new HttpError(404, sanitizeUrl(`https://x/y?api_key=${SECRET}`));
    expect(error.safeUrl).not.toContain(SECRET);
    expect(error.message).not.toContain(SECRET);
  });

  it('sanitizeIssue limpia el mensaje de una incidencia', () => {
    const issue = sanitizeIssue({
      stage: 'rate',
      source: 'omdb',
      message: `https://www.omdbapi.com/?apikey=${SECRET}&i=tt1`,
      severity: 'warn',
    });
    expect(issue.message).not.toContain(SECRET);
  });
});

describe('informe de ejecución (FR-008 + NFR-009)', () => {
  it('ninguna clave sobrevive a la serialización del informe', () => {
    const recorder = new RunRecorder(
      'run-1',
      'manual',
      new Date('2026-09-10T09:00:00.000Z'),
      { from: '2026-09-01', to: '2026-09-10' },
      ['netflix'],
    );
    recorder.warn('rate', 'omdb', `Error en https://www.omdbapi.com/?apikey=${SECRET}`);
    recorder.error('discover', 'tmdb', `401 en https://api.themoviedb.org/3/x?api_key=${SECRET}`);

    const run = recorder.build(new Date('2026-09-10T09:05:00.000Z'), {
      requests: 3, cacheHits: 1, retries: 0, rateLimited: 0,
    });

    expect(JSON.stringify(run)).not.toContain(SECRET);
    expect(run.issues).toHaveLength(2);
    expect(run.status).toBe('failed');
  });
});

describe('caché en disco', () => {
  it('el volcado no contiene claves (Art. III.3)', () => {
    const cache = new ResponseCache(() => 0);
    cache.set(`https://www.omdbapi.com/?apikey=${SECRET}&i=tt1`, { a: 1 }, 10_000);
    cache.set(`https://api.themoviedb.org/3/x?api_key=${SECRET}`, { b: 2 }, 10_000);
    expect(JSON.stringify(cache.toSnapshot())).not.toContain(SECRET);
  });
});

describe('exportación de datos (FR-037 + Art. III.4)', () => {
  it('el paquete exportado no contiene ninguna clave de API', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'estrenos-sec-'));
    try {
      const catalog = new CatalogStore(join(dir, 'titles.json'));
      const ratings = new RatingsStore(join(dir, 'ratings.json'));
      const settings = new SettingsStore(join(dir, 'settings.json'));
      const runs = new RunsStore(join(dir, 'runs.json'));
      await Promise.all([catalog.load(), ratings.load(), settings.load(), runs.load()]);

      const bundle = buildExportBundle({ catalog, ratings, settings, runs }, '1.0.0');
      const serialized = JSON.stringify(bundle);

      expect(serialized).not.toContain(SECRET);
      expect(serialized).not.toContain('api_key');
      expect(serialized).not.toContain('apikey');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('sanitizeMessage', () => {
  it('es el mismo saneado que el de las URL, aplicado a texto libre', () => {
    expect(sanitizeMessage(`hola api_key=${SECRET} adiós`)).toBe('hola api_key=*** adiós');
  });
});
