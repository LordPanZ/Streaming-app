/** FR-051 · catálogo de ejemplo */

import { describe, expect, it } from 'vitest';
import {
  buildSampleCatalog,
  isSampleTitle,
  SAMPLE_PREFIX,
} from '../../src/core/domain/sample-catalog';
import { CatalogStore } from '../../src/core/store/catalog';
import { MemoryStorage } from '../../src/core/store/storage';
import { currentWeek } from '../../src/core/domain/weeks';
import { aggregateCritic } from '../../src/core/domain/scoring';
import { makeTitle } from '../helpers/factories';

const NOW = new Date(2026, 8, 10);

describe('buildSampleCatalog', () => {
  const catalog = buildSampleCatalog(NOW);

  it('produce títulos suficientes para probar la interfaz', () => {
    expect(catalog.length).toBeGreaterThanOrEqual(8);
  });

  it('todos van marcados como ejemplo, sin excepción', () => {
    expect(catalog.every((title) => title.sample === true)).toBe(true);
    expect(catalog.every((title) => title.id.startsWith(SAMPLE_PREFIX))).toBe(true);
    expect(catalog.every(isSampleTitle)).toBe(true);
  });

  it('respeta los invariantes del modelo de datos', () => {
    for (const title of catalog) {
      expect(title.genres.length).toBeGreaterThan(0);
      expect(title.platforms.length).toBeGreaterThan(0);
      expect(title.availableFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(title.releaseWeek).toMatch(/^\d{4}-W\d{2}$/);
    }
  });

  it('se sitúa en la semana en curso, para que aparezca en «Esta semana»', () => {
    const week = currentWeek(NOW);
    expect(catalog.some((title) => title.releaseWeek === week)).toBe(true);
  });

  it('mezcla películas y series', () => {
    expect(catalog.some((title) => title.mediaType === 'movie')).toBe(true);
    expect(catalog.some((title) => title.mediaType === 'series')).toBe(true);
  });

  it('incluye un título sin ninguna nota, para enseñar el «sin datos»', () => {
    const without = catalog.find((title) => aggregateCritic(title.ratings).score === null);
    expect(without).toBeDefined();
  });

  it('no apunta a ningún vídeo real: los tráileres quedan sin asignar', () => {
    expect(catalog.every((title) => title.trailer === null)).toBe(true);
  });

  it('las carátulas son autocontenidas, sin depender de la red', () => {
    for (const title of catalog) {
      expect(title.posterUrl).toMatch(/^data:image\/svg\+xml/);
    }
  });

  it('no usa identificadores de IMDb: son títulos inventados', () => {
    expect(catalog.every((title) => title.imdbId === null)).toBe(true);
  });
});

describe('isSampleTitle', () => {
  it('distingue lo inventado de lo real', () => {
    expect(isSampleTitle({ id: 'ejemplo:1', sample: true })).toBe(true);
    expect(isSampleTitle({ id: 'ejemplo:1' })).toBe(true);
    expect(isSampleTitle({ id: 'tmdb:movie:1' })).toBe(false);
  });
});

describe('catálogo: convivencia con lo real', () => {
  async function loaded() {
    const store = new CatalogStore(new MemoryStorage());
    await store.load();
    await store.upsertMany(buildSampleCatalog(NOW));
    return store;
  }

  it('sabe si hay ejemplos cargados', async () => {
    const store = await loaded();
    expect(store.hasSamples()).toBe(true);
  });

  it('los retira sin tocar los títulos reales', async () => {
    const store = await loaded();
    await store.upsertMany([makeTitle({ id: 'tmdb:movie:77' })]);

    const removed = await store.removeSamples();

    expect(removed).toBeGreaterThan(0);
    expect(store.hasSamples()).toBe(false);
    expect(store.get('tmdb:movie:77')).not.toBeNull();
    expect(store.size).toBe(1);
  });

  it('retirarlos limpia también los índices', async () => {
    const store = await loaded();
    const genre = buildSampleCatalog(NOW)[0]!.genres[0]!;

    await store.removeSamples();
    expect(store.narrow({ genres: [genre] })).toHaveLength(0);
  });

  it('sin ejemplos cargados no hace nada', async () => {
    const store = new CatalogStore(new MemoryStorage());
    await store.load();
    await store.upsertMany([makeTitle({ id: 'tmdb:movie:1' })]);

    expect(await store.removeSamples()).toBe(0);
    expect(store.size).toBe(1);
  });
});
