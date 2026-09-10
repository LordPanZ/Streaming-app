/** FR-011, FR-012, FR-021, FR-025, FR-033, FR-040, NFR-006 · capa de persistencia */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { atomicWriteJson, JsonStore } from '../../src/core/store/json-store';
import { CatalogStore, mergeTitle } from '../../src/core/store/catalog';
import { buildWatchedStats, RatingsStore } from '../../src/core/store/ratings';
import { SettingsStore, defaultSettings, sanitizeSettings } from '../../src/core/store/settings';
import { RunsStore, MAX_RUNS } from '../../src/core/store/runs';
import { defaultCriteria } from '../../src/core/domain/criteria';
import type { AgentRun } from '../../src/shared/types';
import { makeRatings, makeTitle } from '../helpers/factories';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'estrenos-test-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('JsonStore (FR-040)', () => {
  it('arranca con los valores por defecto cuando no hay archivo', async () => {
    const store = new JsonStore({ filePath: join(dir, 'x.json'), defaults: () => ({ n: 1 }) });
    expect(await store.load()).toEqual({ n: 1 });
  });

  it('persiste y relee', async () => {
    const path = join(dir, 'x.json');
    const store = new JsonStore({ filePath: path, defaults: () => ({ n: 1 }) });
    await store.load();
    await store.save({ n: 42 });

    const reloaded = new JsonStore({ filePath: path, defaults: () => ({ n: 1 }) });
    expect(await reloaded.load()).toEqual({ n: 42 });
  });

  it('escribe de forma atómica: no deja archivos temporales', async () => {
    const path = join(dir, 'x.json');
    await atomicWriteJson(path, { a: 1 });
    const { readdir } = await import('node:fs/promises');
    const files = await readdir(dir);
    expect(files).toEqual(['x.json']);
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ a: 1 });
  });

  it('aparta un archivo corrupto y arranca por defecto en vez de romperse', async () => {
    const path = join(dir, 'x.json');
    await writeFile(path, '{esto no es json', 'utf8');

    const recoveries: string[] = [];
    const store = new JsonStore({
      filePath: path,
      defaults: () => ({ n: 1 }),
      onRecover: (info) => recoveries.push(info.backupPath),
    });

    expect(await store.load()).toEqual({ n: 1 });
    expect(recoveries).toHaveLength(1);
    expect(await readFile(recoveries[0]!, 'utf8')).toBe('{esto no es json');
  });

  it('serializa las escrituras concurrentes sin corromper el archivo', async () => {
    const path = join(dir, 'x.json');
    const store = new JsonStore<{ n: number }>({ filePath: path, defaults: () => ({ n: 0 }) });
    await store.load();

    await Promise.all(Array.from({ length: 25 }, (_, i) => store.save({ n: i })));
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ n: 24 });
  });

  it('get() falla si no se ha cargado, en vez de devolver algo inventado', () => {
    const store = new JsonStore({ filePath: join(dir, 'x.json'), defaults: () => ({ n: 1 }) });
    expect(() => store.get()).toThrow(/no está cargado/);
  });
});

describe('CatalogStore (FR-011, FR-012, NFR-006)', () => {
  async function newCatalog() {
    const catalog = new CatalogStore(join(dir, 'titles.json'));
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
    const path = join(dir, 'titles.json');
    const first = new CatalogStore(path);
    await first.load();
    await first.upsertMany([makeTitle({ id: 'a', genres: ['Drama'] })]);

    const second = new CatalogStore(path);
    await second.load();
    expect(second.narrow({ genres: ['Drama'] }).map((t) => t.id)).toEqual(['a']);
  });

  it('descarta del disco las entradas que romperían los invariantes', async () => {
    const path = join(dir, 'titles.json');
    await writeFile(
      path,
      JSON.stringify({ schemaVersion: 1, titles: [{ id: 'roto' }, makeTitle({ id: 'bueno' })] }),
      'utf8',
    );
    const catalog = new CatalogStore(path);
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
    const ratings = new RatingsStore(join(dir, 'ratings.json'));
    await ratings.load();
    return ratings;
  }

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
    const path = join(dir, 'ratings.json');
    const first = new RatingsStore(path);
    await first.load();
    await first.setWatched('a', true);

    const second = new RatingsStore(path);
    await second.load();
    expect(second.get('a')?.watched).toBe(true);
  });

  it('no pisa valoraciones existentes al fusionar sin confirmación (FR-038)', async () => {
    const ratings = await newRatings();
    await ratings.setScores('a', { story: 9 });

    const result = await ratings.merge(
      [{ titleId: 'a', watched: true, watchedAt: null, watchedOnPlatform: null,
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
          scores: { story: 10 }, notes: '', createdAt: '', updatedAt: '' },
        { titleId: 'b', watched: true, watchedAt: null, watchedOnPlatform: null,
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
         scores: {}, notes: '', createdAt: '', updatedAt: '' }],
      defaultCriteria(),
    );
    expect(stats.totalWatched).toBe(0);
    expect(stats.averagePersonal).toBeNull();
  });
});

describe('SettingsStore', () => {
  it('arranca con los valores por defecto de la especificación', async () => {
    const settings = new SettingsStore(join(dir, 'settings.json'));
    const loaded = await settings.load();
    expect(loaded.schedule.weekday).toBe(1);
    expect(loaded.schedule.hour).toBe(9);
    expect(loaded.window).toEqual({ lookbackDays: 7, graceDays: 2 });
    expect(loaded.criteria).toHaveLength(7);
    expect(loaded.revalidateTrailerWeeks).toBe(8);
  });

  it('aplica parches parciales sin perder el resto', async () => {
    const settings = new SettingsStore(join(dir, 'settings.json'));
    await settings.load();
    const updated = await settings.update({ revalidateTrailerWeeks: 4 });
    expect(updated.revalidateTrailerWeeks).toBe(4);
    expect(updated.schedule.hour).toBe(9);
  });

  it('lista las plataformas activas (FR-005)', async () => {
    const settings = new SettingsStore(join(dir, 'settings.json'));
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
    const runs = new RunsStore(join(dir, 'runs.json'));
    await runs.load();
    await runs.append(fakeRun('1'));
    await runs.append(fakeRun('2'));
    expect(runs.list().map((r) => r.id)).toEqual(['2', '1']);
    expect(runs.last()?.id).toBe('2');
  });

  it('acota el historial para que el archivo no crezca sin límite', async () => {
    const runs = new RunsStore(join(dir, 'runs.json'));
    await runs.load();
    for (let i = 0; i < MAX_RUNS + 10; i += 1) {
      await runs.append(fakeRun(String(i)));
    }
    expect(runs.list()).toHaveLength(MAX_RUNS);
    expect(runs.last()?.id).toBe(String(MAX_RUNS + 9));
  });
});
