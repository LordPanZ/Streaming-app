/** FR-011, FR-012, FR-021, FR-025, FR-033, FR-040, NFR-006 · capa de persistencia */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JsonStore } from '../../src/core/store/json-store';
import { MemoryStorage, STORAGE_KEYS } from '../../src/core/store/storage';
import { NodeFileStorage, atomicWriteFile } from '../../src/platform/node/node-storage';
import { CatalogStore, mergeTitle } from '../../src/core/store/catalog';
import { buildWatchedStats, RatingsStore } from '../../src/core/store/ratings';
import { SettingsStore, defaultSettings, sanitizeSettings } from '../../src/core/store/settings';
import { RunsStore, MAX_RUNS } from '../../src/core/store/runs';
import { defaultCriteria } from '../../src/core/domain/criteria';
import type { AgentRun, Settings } from '../../src/shared/types';
import { makeRatings, makeTitle } from '../helpers/factories';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'estrenos-test-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('JsonStore sobre almacenamiento (ADR-013)', () => {
  function store<T>(storage: MemoryStorage | NodeFileStorage, defaults: () => T, onRecover?: never) {
    return new JsonStore<T>({ storage, key: 'prueba', defaults, ...(onRecover ? { onRecover } : {}) });
  }

  it('arranca con los valores por defecto cuando no hay documento', async () => {
    expect(await store(new MemoryStorage(), () => ({ n: 1 })).load()).toEqual({ n: 1 });
  });

  it('persiste y relee a través del almacenamiento', async () => {
    const storage = new MemoryStorage();
    const first = store(storage, () => ({ n: 1 }));
    await first.load();
    await first.save({ n: 42 });

    expect(await store(storage, () => ({ n: 1 })).load()).toEqual({ n: 42 });
  });

  it('aparta un documento corrupto y arranca por defecto en vez de romperse', async () => {
    const storage = new MemoryStorage();
    await storage.write('prueba', '{esto no es json');

    const recoveries: string[] = [];
    const subject = new JsonStore({
      storage,
      key: 'prueba',
      defaults: () => ({ n: 1 }),
      onRecover: (info) => recoveries.push(info.backupKey),
    });

    expect(await subject.load()).toEqual({ n: 1 });
    expect(recoveries).toHaveLength(1);
    expect(await storage.read(recoveries[0]!)).toBe('{esto no es json');
  });

  it('serializa las escrituras concurrentes', async () => {
    const storage = new MemoryStorage();
    const subject = store<{ n: number }>(storage, () => ({ n: 0 }));
    await subject.load();

    await Promise.all(Array.from({ length: 25 }, (_, i) => subject.save({ n: i })));
    expect(JSON.parse((await storage.read('prueba'))!)).toEqual({ n: 24 });
  });

  it('get() falla si no se ha cargado, en vez de devolver algo inventado', () => {
    expect(() => store(new MemoryStorage(), () => ({ n: 1 })).get()).toThrow(/no está cargado/);
  });

  it('dice dónde vive el documento, para poder enseñárselo al usuario', () => {
    expect(store(new MemoryStorage(), () => ({})).location).toBe('memoria:prueba');
  });
});

describe('NodeFileStorage (FR-040)', () => {
  it('escribe de forma atómica: no deja archivos temporales', async () => {
    const storage = new NodeFileStorage(dir);
    await storage.write(STORAGE_KEYS.titles, '{"a":1}');

    const { readdir } = await import('node:fs/promises');
    expect(await readdir(dir)).toEqual(['titles.json']);
    expect(await storage.read(STORAGE_KEYS.titles)).toBe('{"a":1}');
  });

  it('atomicWriteFile deja el archivo completo y ningún temporal', async () => {
    await atomicWriteFile(join(dir, 'x.json'), '{"a":1}', dir);
    const { readdir } = await import('node:fs/promises');
    expect(await readdir(dir)).toEqual(['x.json']);
  });

  it('un documento inexistente se lee como ausente, no como error', async () => {
    expect(await new NodeFileStorage(dir).read(STORAGE_KEYS.runs)).toBeNull();
  });

  it('borrar algo que no existe no falla', async () => {
    await expect(new NodeFileStorage(dir).remove(STORAGE_KEYS.runs)).resolves.toBeUndefined();
  });

  it('rechaza una clave que podría salirse del directorio', async () => {
    await expect(new NodeFileStorage(dir).read('../../etc/passwd')).rejects.toThrow(/no válida/);
  });

  it('sobrevive a un reinicio', async () => {
    await new NodeFileStorage(dir).write(STORAGE_KEYS.settings, '{"ok":true}');
    expect(await new NodeFileStorage(dir).read(STORAGE_KEYS.settings)).toBe('{"ok":true}');
  });
});

describe('CatalogStore (FR-011, FR-012, NFR-006)', () => {
  async function newCatalog() {
    const catalog = new CatalogStore(new MemoryStorage());
    await catalog.load();
    return catalog;
  }

  it('inserta y recupera títulos', async () => {
    const catalog = await newCatalog();
    const outcome = await catalog.upsertMany([makeTitle({ id: 'a' })]);
    expect(outcome).toEqual({ created: 1, updated: 0, skipped: 0 });
    expect(catalog.get('a')?.id).toBe('a');
    expect(catalog.size).toBe(1);
  });

  it('descarta títulos sin plataforma (invariante 2)', async () => {
    const catalog = await newCatalog();
    const outcome = await catalog.upsertMany([makeTitle({ id: 'a', platforms: [] })]);
    expect(outcome.skipped).toBe(1);
    expect(catalog.size).toBe(0);
  });

  it('ordena por fecha descendente', async () => {
    const catalog = await newCatalog();
    await catalog.upsertMany([
      makeTitle({ id: 'viejo', availableFrom: '2026-09-01' }),
      makeTitle({ id: 'nuevo', availableFrom: '2026-09-09' }),
    ]);
    expect(catalog.all().map((t) => t.id)).toEqual(['nuevo', 'viejo']);
  });

  it('estrecha por semana, plataforma y género usando los índices', async () => {
    const catalog = await newCatalog();
    await catalog.upsertMany([
      makeTitle({ id: 'a', releaseWeek: '2026-W37', genres: ['Drama'] }),
      makeTitle({
        id: 'b',
        releaseWeek: '2026-W36',
        genres: ['Comedia'],
        platforms: [{ id: 'filmin', name: 'Filmin', providerId: 63, logoUrl: null, link: null }],
      }),
    ]);

    expect(catalog.narrow({ week: '2026-W37' }).map((t) => t.id)).toEqual(['a']);
    expect(catalog.narrow({ platforms: ['filmin'] }).map((t) => t.id)).toEqual(['b']);
    expect(catalog.narrow({ genres: ['Comedia'] }).map((t) => t.id)).toEqual(['b']);
    expect(catalog.narrow({ week: '2026-W37', genres: ['Comedia'] })).toHaveLength(0);
    expect(catalog.narrow()).toHaveLength(2);
  });

  it('mantiene los índices al reemplazar un título', async () => {
    const catalog = await newCatalog();
    await catalog.upsertMany([makeTitle({ id: 'a', genres: ['Drama'] })]);
    await catalog.replace(makeTitle({ id: 'a', genres: ['Terror'] }));

    expect(catalog.narrow({ genres: ['Drama'] })).toHaveLength(0);
    expect(catalog.narrow({ genres: ['Terror'] })).toHaveLength(1);
  });

  it('sobrevive a un reinicio conservando los índices', async () => {
    const storage = new NodeFileStorage(dir);
    const first = new CatalogStore(storage);
    await first.load();
    await first.upsertMany([makeTitle({ id: 'a', genres: ['Drama'] })]);

    const second = new CatalogStore(storage);
    await second.load();
    expect(second.narrow({ genres: ['Drama'] }).map((t) => t.id)).toEqual(['a']);
  });

  it('descarta al leer las entradas que romperían los invariantes', async () => {
    const storage = new MemoryStorage();
    await storage.write(
      STORAGE_KEYS.titles,
      JSON.stringify({ schemaVersion: 1, titles: [{ id: 'roto' }, makeTitle({ id: 'bueno' })] }),
    );
    const catalog = new CatalogStore(storage);
    await catalog.load();
    expect(catalog.all().map((t) => t.id)).toEqual(['bueno']);
  });
});

describe('mergeTitle', () => {
  it('conserva la primera observación y la fecha de estreno original', () => {
    const existing = makeTitle({
      id: 'a',
      firstSeenAt: '2026-01-01T00:00:00.000Z',
      availableFrom: '2026-09-01',
      releaseWeek: '2026-W36',
    });
    const merged = mergeTitle(
      existing,
      makeTitle({ id: 'a', firstSeenAt: '2026-09-10T00:00:00.000Z', availableFrom: '2026-09-10' }),
    );
    expect(merged.firstSeenAt).toBe('2026-01-01T00:00:00.000Z');
    expect(merged.availableFrom).toBe('2026-09-01');
    expect(merged.releaseWeek).toBe('2026-W36');
  });

  it('une plataformas sin duplicar', () => {
    const existing = makeTitle({ id: 'a' });
    const merged = mergeTitle(
      existing,
      makeTitle({
        id: 'a',
        platforms: [
          { id: 'filmin', name: 'Filmin', providerId: 63, logoUrl: null, link: null },
          { id: 'netflix', name: 'Netflix', providerId: 8, logoUrl: null, link: null },
        ],
      }),
    );
    expect(merged.platforms.map((p) => p.id).sort()).toEqual(['filmin', 'netflix']);
  });

  it('no borra una nota buena con un nulo (FR-014)', () => {
    const existing = makeTitle({ id: 'a', ratings: makeRatings({ imdb: 8, rottenTomatoes: 90 }) });
    const merged = mergeTitle(existing, makeTitle({ id: 'a', ratings: makeRatings({ imdb: null }) }));
    expect(merged.ratings.imdb).toBe(8);
    expect(merged.ratings.rottenTomatoes).toBe(90);
  });

  it('no borra un tráiler existente con un nulo', () => {
    const existing = makeTitle({
      id: 'a',
      trailer: {
        youtubeId: 'x', url: 'u', title: 't', language: 'es', kind: 'trailer',
        liveness: 'live', checkedAt: '2026-09-01T00:00:00.000Z', searchFallbackUrl: 's',
      },
    });
    expect(mergeTitle(existing, makeTitle({ id: 'a', trailer: null })).trailer?.youtubeId).toBe('x');
  });
});

describe('RatingsStore (FR-021, FR-025)', () => {
  async function newRatings() {
    const ratings = new RatingsStore(new MemoryStorage());
    await ratings.load();
    return ratings;
  }

  describe('«me interesa verla» (FR-054)', () => {
    it('marca y desmarca sin tocar nada más', async () => {
      const ratings = await newRatings();
      const marked = await ratings.setInterested('a', true);
      expect(marked.interested).toBe(true);
      expect(marked.watched).toBe(false);
      expect(marked.scores).toEqual({});

      expect((await ratings.setInterested('a', false)).interested).toBe(false);
    });

    it('marcar como vista lo saca de la lista de pendientes (invariante 8)', async () => {
      const ratings = await newRatings();
      await ratings.setInterested('a', true);
      expect((await ratings.setWatched('a', true)).interested).toBe(false);
    });

    it('puntuar también lo saca: puntuar es haber visto', async () => {
      const ratings = await newRatings();
      await ratings.setInterested('a', true);
      const rated = await ratings.setScores('a', { story: 8 });
      expect(rated.watched).toBe(true);
      expect(rated.interested).toBe(false);
    });

    it('desmarcar el visionado no resucita el interés', async () => {
      // Si vuelve a interesar, se marca otra vez. Resucitarlo solo sería
      // adivinar por qué el usuario desmarcó.
      const ratings = await newRatings();
      await ratings.setInterested('a', true);
      await ratings.setWatched('a', true);
      expect((await ratings.setWatched('a', false)).interested).toBe(false);
    });

    it('una valoración guardada por una versión anterior se lee como «no marcada»', async () => {
      // El campo llegó en la 1.3.0: sin normalizar quedaría «undefined», que no
      // es «false» y se comporta distinto al filtrar.
      const storage = new MemoryStorage();
      await storage.write(
        STORAGE_KEYS.ratings,
        JSON.stringify({
          schemaVersion: 1,
          ratings: [
            {
              titleId: 'antigua',
              watched: true,
              watchedAt: '2026-01-01T00:00:00.000Z',
              watchedOnPlatform: null,
              scores: { story: 7 },
              notes: '',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
        }),
      );

      const ratings = new RatingsStore(storage);
      await ratings.load();
      const loaded = ratings.get('antigua');
      expect(loaded?.interested).toBe(false);
      expect(loaded?.scores).toEqual({ story: 7 });
    });
  });

  it('marca como visto guardando la fecha', async () => {
    const ratings = await newRatings();
    const now = new Date('2026-09-08T20:00:00.000Z');
    const saved = await ratings.setWatched('a', true, {}, now);
    expect(saved.watched).toBe(true);
    expect(saved.watchedAt).toBe(now.toISOString());
  });

  it('al desmarcar borra la fecha (invariante 6)', async () => {
    const ratings = await newRatings();
    await ratings.setWatched('a', true);
    const cleared = await ratings.setWatched('a', false);
    expect(cleared.watched).toBe(false);
    expect(cleared.watchedAt).toBeNull();
    expect(cleared.watchedOnPlatform).toBeNull();
  });

  it('valorar implica haber visto', async () => {
    const ratings = await newRatings();
    const saved = await ratings.setScores('a', { story: 8 });
    expect(saved.watched).toBe(true);
    expect(saved.watchedAt).not.toBeNull();
  });

  it('admite valoración parcial y la completa después (FR-025)', async () => {
    const ratings = await newRatings();
    await ratings.setScores('a', { story: 8 });
    const completed = await ratings.setScores('a', { story: 8, acting: 6 }, 'Buena');
    expect(completed.scores).toEqual({ story: 8, acting: 6 });
    expect(completed.notes).toBe('Buena');
  });

  it('persiste entre reinicios', async () => {
    const storage = new NodeFileStorage(dir);
    const first = new RatingsStore(storage);
    await first.load();
    await first.setWatched('a', true);

    const second = new RatingsStore(storage);
    await second.load();
    expect(second.get('a')?.watched).toBe(true);
  });

  it('no pisa valoraciones existentes al fusionar sin confirmación (FR-038)', async () => {
    const ratings = await newRatings();
    await ratings.setScores('a', { story: 9 });

    const result = await ratings.merge(
      [{ titleId: 'a', watched: true, watchedAt: null, watchedOnPlatform: null,
         interested: false,
         scores: { story: 1 }, notes: '', createdAt: '', updatedAt: '' }],
      false,
    );
    expect(result).toEqual({ imported: 0, skipped: 1 });
    expect(ratings.get('a')?.scores.story).toBe(9);
  });

  it('las pisa cuando se confirma explícitamente', async () => {
    const ratings = await newRatings();
    await ratings.setScores('a', { story: 9 });
    await ratings.merge(
      [{ titleId: 'a', watched: true, watchedAt: null, watchedOnPlatform: null,
         interested: false,
         scores: { story: 1 }, notes: '', createdAt: '', updatedAt: '' }],
      true,
    );
    expect(ratings.get('a')?.scores.story).toBe(1);
  });
});

describe('buildWatchedStats (FR-033)', () => {
  it('resume vistas, nota media y desglose por género', () => {
    const titles = [
      makeTitle({ id: 'a', genres: ['Drama'], ratings: makeRatings({ imdb: 8 }) }),
      makeTitle({ id: 'b', genres: ['Drama', 'Comedia'] }),
    ];
    const stats = buildWatchedStats(
      titles,
      [
        { titleId: 'a', watched: true, watchedAt: null, watchedOnPlatform: null,
          interested: false,
          scores: { story: 10 }, notes: '', createdAt: '', updatedAt: '' },
        { titleId: 'b', watched: true, watchedAt: null, watchedOnPlatform: null,
          interested: false,
          scores: { story: 6 }, notes: '', createdAt: '', updatedAt: '' },
      ],
      defaultCriteria(),
    );

    expect(stats.totalWatched).toBe(2);
    expect(stats.totalRated).toBe(2);
    expect(stats.averagePersonal).toBe(8);
    expect(stats.averageCritic).toBe(8);
    expect(stats.byGenre.find((g) => g.genre === 'Drama')?.watched).toBe(2);
    expect(stats.topRated[0]?.titleId).toBe('a');
  });

  it('no cuenta los no vistos', () => {
    const stats = buildWatchedStats(
      [makeTitle({ id: 'a' })],
      [{ titleId: 'a', watched: false, watchedAt: null, watchedOnPlatform: null,
         interested: false,
         scores: {}, notes: '', createdAt: '', updatedAt: '' }],
      defaultCriteria(),
    );
    expect(stats.totalWatched).toBe(0);
    expect(stats.averagePersonal).toBeNull();
  });
});

describe('SettingsStore', () => {
  it('arranca con los valores por defecto de la especificación', async () => {
    const settings = new SettingsStore(new MemoryStorage());
    const loaded = await settings.load();
    expect(loaded.schedule.weekday).toBe(1);
    expect(loaded.schedule.hour).toBe(9);
    expect(loaded.window).toEqual({ lookbackDays: 7, graceDays: 2 });
    expect(loaded.criteria).toHaveLength(7);
    expect(loaded.revalidateTrailerWeeks).toBe(8);
  });

  it('aplica parches parciales sin perder el resto', async () => {
    const settings = new SettingsStore(new MemoryStorage());
    await settings.load();
    const updated = await settings.update({ revalidateTrailerWeeks: 4 });
    expect(updated.revalidateTrailerWeeks).toBe(4);
    expect(updated.schedule.hour).toBe(9);
  });

  it('lista las plataformas activas (FR-005)', async () => {
    const settings = new SettingsStore(new MemoryStorage());
    await settings.load();
    await settings.update({ platforms: { ...settings.get().platforms, 'pluto-tv': false } });
    expect(settings.enabledPlatformIds()).not.toContain('pluto-tv');
    expect(settings.enabledPlatformIds()).toContain('netflix');
  });
});

describe('sanitizeSettings', () => {
  const base = defaultSettings();

  it('recorta valores fuera de rango en vez de aceptarlos', () => {
    const result = sanitizeSettings(
      { schedule: { ...base.schedule, weekday: 99, hour: -4 }, window: { lookbackDays: 0, graceDays: 999 } },
      base,
    );
    expect(result.schedule.weekday).toBe(6);
    expect(result.schedule.hour).toBe(0);
    expect(result.window.lookbackDays).toBe(1);
    expect(result.window.graceDays).toBe(30);
  });

  it('fuerza pesos positivos (invariante 5)', () => {
    const result = sanitizeSettings(
      { criteria: [{ id: 'a', label: 'A', description: '', weight: -5, enabled: true, order: 0 }] },
      base,
    );
    expect(result.criteria.find((c) => c.id === 'a')?.weight).toBeGreaterThan(0);
  });

  it('descarta fechas no válidas del calendario', () => {
    const result = sanitizeSettings({ schedule: { ...base.schedule, nextRunAt: 'mañana' } }, base);
    expect(result.schedule.nextRunAt).toBe(base.schedule.nextRunAt);
  });

  describe('listón de calidad (FR-053)', () => {
    it('viene apagado de fábrica: la primera vez se ve lo que hay', () => {
      expect(base.quality).toEqual({ minCritic: 0, includeUnrated: true });
    });

    it('recorta la nota al rango 0-10 con un decimal', () => {
      expect(sanitizeSettings({ quality: { minCritic: 99, includeUnrated: true } }, base).quality
        .minCritic).toBe(10);
      expect(sanitizeSettings({ quality: { minCritic: -3, includeUnrated: true } }, base).quality
        .minCritic).toBe(0);
      expect(sanitizeSettings({ quality: { minCritic: 7.46, includeUnrated: true } }, base).quality
        .minCritic).toBe(7.5);
    });

    it('ante basura conserva el valor anterior en vez de reiniciarlo', () => {
      const previous = { ...base, quality: { minCritic: 8, includeUnrated: false } };
      const result = sanitizeSettings(
        { quality: { minCritic: 'mucho', includeUnrated: 'sí' } as never },
        previous,
      );
      expect(result.quality).toEqual({ minCritic: 8, includeUnrated: false });
    });

    it('unos ajustes guardados sin listón migran al valor por defecto', () => {
      // Es el caso de quien actualiza desde una versión anterior: el ajuste no
      // existía en su archivo y no puede hacer que la aplicación no arranque.
      const legacy = { ...base } as Partial<Settings>;
      delete legacy.quality;
      expect(sanitizeSettings(legacy, base).quality).toEqual(base.quality);
    });
  });
});

describe('RunsStore (FR-008)', () => {
  function fakeRun(id: string): AgentRun {
    return {
      id, trigger: 'manual', startedAt: '', finishedAt: '', durationMs: 0, status: 'success',
      window: { from: '', to: '' }, platformsQueried: [],
      counts: { discovered: 0, created: 0, updated: 0, skipped: 0 },
      perPlatform: {}, http: { requests: 0, cacheHits: 0, retries: 0, rateLimited: 0 },
      stages: [], issues: [],
    };
  }

  it('guarda los informes del más reciente al más antiguo', async () => {
    const runs = new RunsStore(new MemoryStorage());
    await runs.load();
    await runs.append(fakeRun('1'));
    await runs.append(fakeRun('2'));
    expect(runs.list().map((r) => r.id)).toEqual(['2', '1']);
    expect(runs.last()?.id).toBe('2');
  });

  it('acota el historial para que el archivo no crezca sin límite', async () => {
    const runs = new RunsStore(new MemoryStorage());
    await runs.load();
    for (let i = 0; i < MAX_RUNS + 10; i += 1) {
      await runs.append(fakeRun(String(i)));
    }
    expect(runs.list()).toHaveLength(MAX_RUNS);
    expect(runs.last()?.id).toBe(String(MAX_RUNS + 9));
  });
});
