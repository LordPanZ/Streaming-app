/** FR-015, FR-027, FR-028 a FR-033 · servicio de consulta del catálogo */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CatalogStore } from '../../src/core/store/catalog';
import { RatingsStore } from '../../src/core/store/ratings';
import { CatalogService, resolveWeek } from '../../src/core/service/catalog-service';
import { defaultSettings } from '../../src/core/store/settings';
import { currentWeek } from '../../src/core/domain/weeks';
import { makeRatings, makeTitle } from '../helpers/factories';

const NOW = new Date(2026, 8, 10); // jueves de la semana 2026-W37

let dir: string;
let catalog: CatalogStore;
let ratings: RatingsStore;
let service: CatalogService;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'estrenos-service-'));
  catalog = new CatalogStore(join(dir, 'titles.json'));
  ratings = new RatingsStore(join(dir, 'ratings.json'));
  await Promise.all([catalog.load(), ratings.load()]);
  service = new CatalogService(catalog, ratings, () => defaultSettings());
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('resolveWeek', () => {
  it('traduce «current» a la semana en curso', () => {
    expect(resolveWeek('current', NOW)).toBe(currentWeek(NOW));
  });

  it('«all» y lo vacío no filtran', () => {
    expect(resolveWeek('all', NOW)).toBeUndefined();
    expect(resolveWeek(undefined, NOW)).toBeUndefined();
  });

  it('una semana concreta pasa tal cual', () => {
    expect(resolveWeek('2026-W20', NOW)).toBe('2026-W20');
  });
});

describe('buildView (FR-015, FR-027)', () => {
  it('calcula el índice de crítica y la nota personal al vuelo', async () => {
    await catalog.upsertMany([makeTitle({ id: 'a', ratings: makeRatings({ imdb: 8 }) })]);
    await ratings.setScores('a', { story: 10 });

    const view = service.get('a')!;
    expect(view.critic.score).toBe(8);
    expect(view.personal?.score).toBe(10);
    expect(view.delta).toBe(2);
  });

  it('sin valoración no inventa nota personal ni diferencia', async () => {
    await catalog.upsertMany([makeTitle({ id: 'a', ratings: makeRatings({ imdb: 8 }) })]);

    const view = service.get('a')!;
    expect(view.personal).toBeNull();
    expect(view.delta).toBeNull();
    expect(view.rating).toBeNull();
  });

  it('devuelve null para un título que no existe', () => {
    expect(service.get('no-existe')).toBeNull();
  });
});

describe('query (FR-028 a FR-031)', () => {
  beforeEach(async () => {
    await catalog.upsertMany([
      makeTitle({
        id: 'esta-semana',
        title: 'Estreno reciente',
        releaseWeek: currentWeek(NOW),
        availableFrom: '2026-09-09',
        ratings: makeRatings({ imdb: 9 }),
      }),
      makeTitle({
        id: 'semana-pasada',
        title: 'Estreno anterior',
        releaseWeek: '2026-W36',
        availableFrom: '2026-09-02',
        genres: ['Comedia'],
      }),
    ]);
  });

  it('«current» acota a la semana en curso', () => {
    const page = service.query({ week: 'current' }, NOW);
    expect(page.items.map((v) => v.title.id)).toEqual(['esta-semana']);
    expect(page.total).toBe(1);
  });

  it('«all» devuelve el catálogo completo, más reciente primero', () => {
    const page = service.query({ week: 'all' }, NOW);
    expect(page.items.map((v) => v.title.id)).toEqual(['esta-semana', 'semana-pasada']);
  });

  it('combina estrechamiento por índice y filtrado por texto', () => {
    const page = service.query({ week: 'all', text: 'anterior' }, NOW);
    expect(page.items.map((v) => v.title.id)).toEqual(['semana-pasada']);
  });

  it('ordena por nota de crítica dejando los títulos sin nota al final', () => {
    const page = service.query({ week: 'all', sort: 'critic', order: 'desc' }, NOW);
    expect(page.items.map((v) => v.title.id)).toEqual(['esta-semana', 'semana-pasada']);
  });

  it('pagina informando del total real', () => {
    const page = service.query({ week: 'all', limit: 1 }, NOW);
    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(2);
    expect(page.limit).toBe(1);
  });

  it('filtra por género usando el índice', () => {
    const page = service.query({ week: 'all', genres: ['Comedia'] }, NOW);
    expect(page.items.map((v) => v.title.id)).toEqual(['semana-pasada']);
  });
});

describe('facets y stats (FR-029, FR-033)', () => {
  it('las facetas cuentan sobre todo el catálogo, no sobre la página', async () => {
    await catalog.upsertMany([
      makeTitle({ id: 'a', genres: ['Drama'] }),
      makeTitle({ id: 'b', genres: ['Drama', 'Terror'] }),
    ]);

    const facets = service.facets(NOW);
    expect(facets.totalTitles).toBe(2);
    expect(facets.genres.find((g) => g.value === 'Drama')?.count).toBe(2);
    expect(facets.currentWeek).toBe(currentWeek(NOW));
  });

  it('las estadísticas solo cuentan lo marcado como visto', async () => {
    await catalog.upsertMany([makeTitle({ id: 'a' }), makeTitle({ id: 'b' })]);
    await ratings.setScores('a', { story: 8 });

    const stats = service.stats();
    expect(stats.totalWatched).toBe(1);
    expect(stats.averagePersonal).toBe(8);
  });
});
