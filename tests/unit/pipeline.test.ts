/**
 * FR-003, FR-004, FR-005, FR-007, FR-008, FR-009, FR-019 · tubería completa
 * con proveedores simulados, incluidos los caminos de fallo parcial (ADR-006).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { HttpClient } from '../../src/core/providers/http';
import { TmdbClient, type TmdbDiscoverPage } from '../../src/core/providers/tmdb';
import { OmdbClient } from '../../src/core/providers/omdb';
import { YoutubeVerifier } from '../../src/core/providers/youtube';
import { CatalogStore } from '../../src/core/store/catalog';
import { MemoryStorage } from '../../src/core/store/storage';
import { defaultSettings } from '../../src/core/store/settings';
import { enabledPlatformIds, runWeeklyAgent } from '../../src/core/agent/pipeline';
import { mergeRatings } from '../../src/core/agent/stages/rate';
import { statusFor } from '../../src/core/agent/report';
import type { AgentDeps } from '../../src/core/agent/context';
import type { AgentProgress, Settings } from '../../src/shared/types';
import { createFakeFetch, loadFixture, type FakeResponse } from '../helpers/fake-fetch';
import { makeRatings } from '../helpers/factories';

const NOW = new Date('2026-09-10T09:00:00.000Z');

let storage: MemoryStorage;
let catalog: CatalogStore;

beforeEach(async () => {
  storage = new MemoryStorage();
  catalog = new CatalogStore(storage);
  await catalog.load();
});


/** Un mundo simulado completo: proveedores, un estreno y su tráiler. */
async function buildWorld(overrides: Partial<Record<string, FakeResponse>> = {}) {
  const providers = await loadFixture('tmdb-providers-es.json');
  const discover = await loadFixture<TmdbDiscoverPage>('tmdb-discover-movie.json');
  const details = await loadFixture('tmdb-movie-details.json');
  const omdb = await loadFixture('omdb-full.json');

  const routes: Array<[string, FakeResponse]> = [
    ['/watch/providers/', overrides.providers ?? { body: providers }],
    ['/discover/tv', overrides.discoverTv ?? { body: { page: 1, total_pages: 1, results: [] } }],
    ['/discover/movie', overrides.discoverMovie ?? { body: { ...discover, total_pages: 1 } }],
    ['/videos', overrides.videos ?? { body: { results: [] } }],
    ['/movie/1234', overrides.details1234 ?? { body: details }],
    ['/movie/5678', overrides.details5678 ?? { status: 404, body: { status_message: 'no existe' } }],
    ['omdbapi', overrides.omdb ?? { body: omdb }],
    ['oembed', overrides.oembed ?? { body: { title: 'Tráiler' } }],
  ];

  return createFakeFetch((url) => routes.find(([needle]) => url.includes(needle))?.[1]);
}

function makeDeps(
  fake: ReturnType<typeof createFakeFetch>,
  options: {
    settings?: Partial<Settings>;
    withOmdb?: boolean;
    withTmdb?: boolean;
    onProgress?: (p: AgentProgress) => void;
  } = {},
): AgentDeps {
  const http = new HttpClient({ fetchImpl: fake.fetch, sleep: () => Promise.resolve() });
  const settings: Settings = {
    ...defaultSettings(),
    // Una sola plataforma mantiene el número de peticiones simuladas manejable.
    platforms: { ...defaultSettings().platforms, ...allOff(), netflix: true },
    ...options.settings,
  };

  return {
    tmdb: options.withTmdb === false ? null : new TmdbClient({ apiKey: 'K', http }),
    omdb: options.withOmdb === false ? null : new OmdbClient({ apiKey: 'K2', http }),
    youtube: new YoutubeVerifier(http),
    http,
    catalog,
    settings,
    now: () => NOW,
    ...(options.onProgress ? { onProgress: options.onProgress } : {}),
  };
}

function allOff(): Record<string, boolean> {
  return Object.fromEntries(
    Object.keys(defaultSettings().platforms).map((id) => [id, false]),
  );
}

describe('enabledPlatformIds (FR-005)', () => {
  it('respeta las plataformas desactivadas', () => {
    const platforms = { ...defaultSettings().platforms, 'pluto-tv': false };
    expect(enabledPlatformIds(platforms)).not.toContain('pluto-tv');
  });

  it('la sobrescritura del modo consola manda sobre los ajustes', () => {
    expect(enabledPlatformIds(allOff(), ['netflix', 'filmin'])).toEqual(['netflix', 'filmin']);
  });

  it('descarta identificadores que no existen', () => {
    expect(enabledPlatformIds(allOff(), ['inventada'])).toEqual([]);
  });
});

describe('ejecución completa (FR-008)', () => {
  it('recopila, valora, verifica el tráiler y persiste', async () => {
    const fake = await buildWorld();
    const run = await runWeeklyAgent(makeDeps(fake), { trigger: 'manual' });

    expect(run.counts.created).toBe(1);
    expect(run.window).toEqual({ from: '2026-09-01', to: '2026-09-10' });
    expect(run.platformsQueried).toEqual(['netflix']);
    expect(run.stages.map((s) => s.stage)).toEqual([
      'discover', 'enrich', 'rate', 'trailer', 'persist',
    ]);

    const saved = catalog.get('tmdb:movie:1234')!;
    expect(saved.title).toBe('La hora silenciosa');
    expect(saved.genres).toEqual(['Drama', 'Suspense']);
    expect(saved.ratings.imdb).toBe(7.8);
    expect(saved.ratings.rottenTomatoes).toBe(88);
    expect(saved.ratings.tmdb).toBe(7.4);
    expect(saved.trailer?.youtubeId).toBe('SPANISHKEY1');
    expect(saved.trailer?.liveness).toBe('live');
  });

  it('informa del progreso por etapas (FR-003)', async () => {
    const progress: AgentProgress[] = [];
    const fake = await buildWorld();
    await runWeeklyAgent(makeDeps(fake, { onProgress: (p) => progress.push(p) }), {
      trigger: 'manual',
    });

    expect(new Set(progress.map((p) => p.stage))).toEqual(
      new Set(['discover', 'enrich', 'rate', 'trailer', 'persist']),
    );
    expect(progress.every((p) => p.runId.startsWith('run-'))).toBe(true);
  });

  it('recoge métricas de red y de caché', async () => {
    const fake = await buildWorld();
    const run = await runWeeklyAgent(makeDeps(fake), { trigger: 'manual' });
    expect(run.http.requests).toBeGreaterThan(0);
  });

  it('el modo de prueba no escribe nada', async () => {
    const fake = await buildWorld();
    const run = await runWeeklyAgent(makeDeps(fake), { trigger: 'cli', dryRun: true });

    expect(catalog.size).toBe(0);
    expect(run.counts.created).toBe(0);
  });

  it('la ventana temporal se puede sobrescribir desde la consola (FR-004)', async () => {
    const fake = await buildWorld();
    const run = await runWeeklyAgent(makeDeps(fake), {
      trigger: 'cli',
      lookbackDays: 30,
      graceDays: 0,
    });
    expect(run.window.from).toBe('2026-08-11');
  });
});

describe('degradación ante fallos (FR-009, ADR-006)', () => {
  it('un título que falla no impide guardar los demás', async () => {
    const fake = await buildWorld();
    const run = await runWeeklyAgent(makeDeps(fake), { trigger: 'manual' });

    // El título 5678 devuelve 404 en su ficha.
    expect(run.status).toBe('partial');
    expect(run.issues.some((issue) => issue.stage === 'enrich')).toBe(true);
    expect(catalog.size).toBe(1);
  });

  it('sin clave de OMDb se guarda igualmente con la nota de TMDB', async () => {
    const fake = await buildWorld();
    const run = await runWeeklyAgent(makeDeps(fake, { withOmdb: false }), { trigger: 'manual' });

    expect(catalog.get('tmdb:movie:1234')?.ratings.tmdb).toBe(7.4);
    expect(catalog.get('tmdb:movie:1234')?.ratings.imdb).toBeNull();
    expect(run.issues.some((issue) => issue.source === 'omdb')).toBe(true);
  });

  it('sin clave de TMDB la ejecución falla con un informe claro', async () => {
    const fake = await buildWorld();
    const run = await runWeeklyAgent(makeDeps(fake, { withTmdb: false }), { trigger: 'manual' });

    expect(run.status).toBe('failed');
    expect(run.issues[0]?.message).toContain('TMDB');
    expect(catalog.size).toBe(0);
  });

  it('si falla el descubrimiento de una plataforma, la ejecución continúa', async () => {
    const fake = await buildWorld({ discoverMovie: { status: 500, body: {} } });
    const run = await runWeeklyAgent(makeDeps(fake), { trigger: 'manual' });

    expect(run.status).not.toBe('success');
    expect(run.issues.some((issue) => issue.stage === 'discover')).toBe(true);
  });

  it('si OMDb falla, el título se guarda sin sus notas', async () => {
    const fake = await buildWorld({ omdb: { status: 500, body: {} } });
    await runWeeklyAgent(makeDeps(fake), { trigger: 'manual' });

    const saved = catalog.get('tmdb:movie:1234')!;
    expect(saved).toBeTruthy();
    expect(saved.ratings.imdb).toBeNull();
    expect(saved.ratings.tmdb).toBe(7.4);
  });

  it('si YouTube no responde, el tráiler queda sin verificar, nunca vivo', async () => {
    const fake = await buildWorld({ oembed: { status: 500, body: {} } });
    await runWeeklyAgent(makeDeps(fake), { trigger: 'manual' });

    expect(catalog.get('tmdb:movie:1234')?.trailer?.liveness).toBe('unverified');
  });

  it('un tráiler retirado se marca como muerto y conserva la búsqueda de respaldo', async () => {
    const fake = await buildWorld({ oembed: { status: 404, body: {} } });
    await runWeeklyAgent(makeDeps(fake), { trigger: 'manual' });

    const trailer = catalog.get('tmdb:movie:1234')?.trailer;
    expect(trailer?.liveness).toBe('dead');
    expect(trailer?.searchFallbackUrl).toContain('youtube.com/results');
  });

  it('sin ninguna plataforma activa falla en vez de fingir que no hay estrenos', async () => {
    const fake = await buildWorld();
    const run = await runWeeklyAgent(makeDeps(fake, { settings: { platforms: allOff() } }), {
      trigger: 'manual',
    });

    expect(run.status).toBe('failed');
    expect(run.issues[0]?.message).toContain('plataforma');
  });
});

describe('revalidación de tráileres (FR-019)', () => {
  it('detecta que un tráiler guardado ha dejado de estar disponible', async () => {
    const fake = await buildWorld();
    await runWeeklyAgent(makeDeps(fake), { trigger: 'manual' });
    expect(catalog.get('tmdb:movie:1234')?.trailer?.liveness).toBe('live');

    // Segunda semana: el mismo título ya no se descubre, pero su tráiler murió.
    const deadWorld = await buildWorld({
      discoverMovie: { body: { page: 1, total_pages: 1, results: [] } },
      oembed: { status: 404, body: {} },
    });
    const run = await runWeeklyAgent(makeDeps(deadWorld), { trigger: 'scheduled' });

    expect(catalog.get('tmdb:movie:1234')?.trailer?.liveness).toBe('dead');
    expect(run.issues.some((issue) => issue.message.includes('ya no está disponible'))).toBe(true);
  });

  it('no revalida nada si la ventana de revalidación es cero', async () => {
    const fake = await buildWorld();
    await runWeeklyAgent(makeDeps(fake), { trigger: 'manual' });

    const deadWorld = await buildWorld({
      discoverMovie: { body: { page: 1, total_pages: 1, results: [] } },
      oembed: { status: 404, body: {} },
    });
    await runWeeklyAgent(
      makeDeps(deadWorld, { settings: { revalidateTrailerWeeks: 0 } }),
      { trigger: 'scheduled' },
    );

    expect(catalog.get('tmdb:movie:1234')?.trailer?.liveness).toBe('live');
  });
});

describe('datos de ejemplo y estrenos reales (FR-051)', () => {
  it('la primera recopilación real retira los títulos de ejemplo', async () => {
    const { buildSampleCatalog } = await import('../../src/core/domain/sample-catalog');
    await catalog.upsertMany(buildSampleCatalog(NOW));
    expect(catalog.hasSamples()).toBe(true);

    const run = await runWeeklyAgent(makeDeps(await buildWorld()), { trigger: 'manual' });

    expect(catalog.hasSamples()).toBe(false);
    expect(catalog.get('tmdb:movie:1234')).not.toBeNull();
    expect(run.issues.some((issue) => issue.message.includes('ejemplo'))).toBe(true);
  });

  it('sin ejemplos cargados no anota nada al respecto', async () => {
    const run = await runWeeklyAgent(makeDeps(await buildWorld()), { trigger: 'manual' });
    expect(run.issues.some((issue) => issue.message.includes('ejemplo'))).toBe(false);
  });
});

describe('idempotencia entre semanas', () => {
  it('reejecutar la misma semana actualiza en vez de duplicar', async () => {
    const fake = await buildWorld();
    await runWeeklyAgent(makeDeps(fake), { trigger: 'manual' });

    const second = await runWeeklyAgent(makeDeps(await buildWorld()), { trigger: 'scheduled' });
    expect(second.counts.created).toBe(0);
    expect(second.counts.updated).toBe(1);
    expect(catalog.size).toBe(1);
  });

  it('conserva la primera observación al actualizar', async () => {
    const fake = await buildWorld();
    await runWeeklyAgent(makeDeps(fake), { trigger: 'manual' });
    const first = catalog.get('tmdb:movie:1234')!.firstSeenAt;

    const later: AgentDeps = {
      ...makeDeps(await buildWorld()),
      now: () => new Date('2026-09-17T09:00:00.000Z'),
    };
    await runWeeklyAgent(later, { trigger: 'scheduled' });

    expect(catalog.get('tmdb:movie:1234')?.firstSeenAt).toBe(first);
  });
});

describe('statusFor (ADR-006)', () => {
  it('sin incidencias es éxito', () => {
    expect(statusFor([], 5)).toBe('success');
  });

  it('con incidencias pero algo persistido es parcial', () => {
    expect(statusFor([{ stage: 'rate', source: 'omdb', message: 'x', severity: 'warn' }], 5))
      .toBe('partial');
  });

  it('sin nada persistido y con error grave es fallo', () => {
    expect(statusFor([{ stage: 'discover', source: 'tmdb', message: 'x', severity: 'error' }], 0))
      .toBe('failed');
  });

  it('sin nada persistido pero sin error grave no es fallo: es que no había estrenos', () => {
    expect(statusFor([], 0)).toBe('success');
  });
});

describe('mergeRatings (FR-014)', () => {
  it('conserva la nota de TMDB frente a la de OMDb', () => {
    const merged = mergeRatings(makeRatings({ tmdb: 7.4 }), makeRatings({ tmdb: 1, imdb: 8 }));
    expect(merged.tmdb).toBe(7.4);
    expect(merged.imdb).toBe(8);
  });

  it('un nulo entrante no borra un dato existente', () => {
    const merged = mergeRatings(makeRatings({ imdb: 8 }), makeRatings({ imdb: null }));
    expect(merged.imdb).toBe(8);
  });
});
