/**
 * ADR-016, NFR-014 · el paralelismo de las etapas no cambia el resultado.
 *
 * La prueba monta un mundo donde las respuestas llegan justo al revés de como
 * se pidieron: el primer título es el más lento y el último el más rápido. Si
 * algo dependiera del orden de llegada, aquí se vería.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { HttpClient, type FetchLike } from '../../src/core/providers/http';
import { TmdbClient } from '../../src/core/providers/tmdb';
import { OmdbClient } from '../../src/core/providers/omdb';
import { YoutubeVerifier } from '../../src/core/providers/youtube';
import { CatalogStore } from '../../src/core/store/catalog';
import { MemoryStorage } from '../../src/core/store/storage';
import { defaultSettings } from '../../src/core/store/settings';
import { runWeeklyAgent } from '../../src/core/agent/pipeline';
import type { AgentDeps } from '../../src/core/agent/context';
import type { AgentRun, RunIssue, Settings } from '../../src/shared/types';
import { loadFixture } from '../helpers/fake-fetch';

const NOW = new Date('2026-09-10T09:00:00.000Z');

/** Ocho estrenos: suficientes para que cuatro trabajos a la vez se noten. */
const IDS = [101, 102, 103, 104, 105, 106, 107, 108];
/**
 * Fichas que TMDB no encuentra: generan incidencia en la etapa de fichas.
 *
 * Las dos caen en la primera tanda de cuatro, donde la latencia decreciente
 * hace que terminen al revés (antes la 103 que la 101). Elegirlas así es lo que
 * convierte la comprobación del orden en una prueba de verdad.
 */
const MISSING_DETAILS = new Set([101, 103]);
/** Títulos sin notas en OMDb: generan incidencia en la etapa de notas. */
const NO_RATINGS = new Set([102, 104]);
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface LatentWorld {
  fetch: FetchLike;
  /** Máximo de peticiones que llegaron a coincidir en el tiempo. */
  peak: () => number;
  requests: number;
}

/**
 * `fetch` simulado con latencia decreciente y contador de simultaneidad.
 *
 * La latencia es lo que hace la prueba: el título 101 tarda ocho veces más que
 * el 108, así que en paralelo termina el último.
 */
async function buildLatentWorld(): Promise<LatentWorld> {
  const providers = await loadFixture<Record<string, unknown>>('tmdb-providers-es.json');
  const details = await loadFixture<Record<string, unknown>>('tmdb-movie-details.json');
  const omdbFull = await loadFixture<Record<string, unknown>>('omdb-full.json');
  const omdbMissing = await loadFixture<Record<string, unknown>>('omdb-not-found.json');

  const state = { active: 0, peak: 0, requests: 0 };

  function detailsFor(id: number): Record<string, unknown> {
    return {
      ...details,
      id,
      title: `Estreno ${id}`,
      external_ids: { imdb_id: `tt000${id}` },
    };
  }

  function latencyFor(id: number): number {
    // Posición 0 → la más lenta; última posición → la más rápida.
    return (IDS.length - IDS.indexOf(id)) * 2;
  }

  function idIn(url: string): number | null {
    const match = /(?:movie\/|tt000)(\d{3})/.exec(url);
    return match ? Number(match[1]) : null;
  }

  const fetchImpl: FetchLike = async (url) => {
    state.requests += 1;
    state.active += 1;
    state.peak = Math.max(state.peak, state.active);

    try {
      const id = idIn(url);
      await sleep(id === null ? 1 : latencyFor(id));

      if (url.includes('/watch/providers/')) return json(providers);
      if (url.includes('/discover/tv')) return json({ page: 1, total_pages: 1, results: [] });
      if (url.includes('/discover/movie')) {
        return json({
          page: 1,
          total_pages: 1,
          results: IDS.map((entry) => ({
            id: entry,
            title: `Estreno ${entry}`,
            vote_average: 7,
            vote_count: 100,
          })),
        });
      }
      if (url.includes('/videos')) return json({ results: [] });
      if (url.includes('omdbapi')) {
        return json(id !== null && NO_RATINGS.has(id) ? omdbMissing : omdbFull);
      }
      if (url.includes('oembed')) return json({ title: 'Tráiler' });
      if (id !== null && MISSING_DETAILS.has(id)) {
        return json({ status_message: 'no existe' }, 404);
      }
      if (id !== null) return json(detailsFor(id));
      return json({ error: 'sin ruta' }, 404);
    } finally {
      state.active -= 1;
    }
  };

  return {
    fetch: fetchImpl,
    peak: () => state.peak,
    get requests() {
      return state.requests;
    },
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function allOff(): Record<string, boolean> {
  return Object.fromEntries(Object.keys(defaultSettings().platforms).map((id) => [id, false]));
}

async function runWith(concurrency: number): Promise<{
  run: AgentRun;
  catalogIds: string[];
  peak: number;
}> {
  const storage = new MemoryStorage();
  const catalog = new CatalogStore(storage);
  await catalog.load();

  const world = await buildLatentWorld();
  const http = new HttpClient({
    fetchImpl: world.fetch,
    sleep: () => Promise.resolve(),
    // Sin caché, para que las ocho fichas se pidan de verdad.
    cache: null,
  });
  const settings: Settings = {
    ...defaultSettings(),
    platforms: { ...allOff(), netflix: true },
  };

  const deps: AgentDeps = {
    tmdb: new TmdbClient({ apiKey: 'K', http }),
    omdb: new OmdbClient({ apiKey: 'K2', http }),
    youtube: new YoutubeVerifier(http),
    http,
    catalog,
    settings,
    now: () => NOW,
    concurrency,
  };

  const run = await runWeeklyAgent(deps, { trigger: 'manual' });
  return { run, catalogIds: catalog.all().map((title) => title.id), peak: world.peak() };
}

/** Huella comparable de una incidencia: lo que el usuario acabaría leyendo. */
function fingerprint(issues: readonly RunIssue[]): string[] {
  return issues.map(
    (issue) => `${issue.stage}|${issue.source}|${issue.titleId ?? '-'}|${issue.message}`,
  );
}

/** Solo los títulos señalados, que es donde se ve el orden. */
function issueTitleIds(issues: readonly RunIssue[]): string[] {
  return issues.map((issue) => issue.titleId ?? '-');
}

describe('la tubería en paralelo (ADR-016)', () => {
  let serial: Awaited<ReturnType<typeof runWith>>;
  let parallel: Awaited<ReturnType<typeof runWith>>;

  beforeEach(async () => {
    serial = await runWith(1);
    parallel = await runWith(4);
  });

  it('llega al mismo catálogo que el recorrido secuencial', () => {
    expect(parallel.catalogIds).toEqual(serial.catalogIds);
    expect(parallel.catalogIds.length).toBe(IDS.length - MISSING_DETAILS.size);
  });

  it('produce las mismas cuentas', () => {
    expect(parallel.run.counts).toEqual(serial.run.counts);
    expect(parallel.run.status).toBe(serial.run.status);
  });

  it('informa de las incidencias en el orden del catálogo, no en el de respuesta', () => {
    // El orden esperado se escribe entero, no solo se compara con el del
    // recorrido secuencial: así la prueba no puede dar por bueno que las dos
    // ejecuciones se equivoquen igual.
    const expected = [
      'tmdb:movie:101', // ficha que no existe
      'tmdb:movie:103', // ficha que no existe, pero contesta antes que la 101
      'tmdb:movie:102', // sin notas en OMDb
      'tmdb:movie:104', // sin notas en OMDb
    ];

    expect(issueTitleIds(serial.run.issues)).toEqual(expected);
    expect(issueTitleIds(parallel.run.issues)).toEqual(expected);
  });

  it('produce exactamente las mismas incidencias que el recorrido secuencial', () => {
    expect(fingerprint(parallel.run.issues)).toEqual(fingerprint(serial.run.issues));
    expect(parallel.run.issues.length).toBeGreaterThan(0);
  });

  it('cuenta lo mismo por etapa', () => {
    const byStage = (run: AgentRun) =>
      run.stages.map((stage) => `${stage.stage}:${stage.processed}/${stage.failed}`);
    expect(byStage(parallel.run)).toEqual(byStage(serial.run));
  });

  it('solapa peticiones de verdad, y sin pasarse del límite del cliente HTTP', () => {
    expect(serial.peak).toBe(1);
    expect(parallel.peak).toBeGreaterThan(1);
    expect(parallel.peak).toBeLessThanOrEqual(4);
  });

  it('no gasta más peticiones que el recorrido secuencial', () => {
    expect(parallel.run.http.requests).toBe(serial.run.http.requests);
  });
});
