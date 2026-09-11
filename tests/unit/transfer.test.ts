/** FR-037, FR-038, FR-039 · exportación, importación y borrado */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CatalogStore } from '../../src/core/store/catalog';
import { RatingsStore } from '../../src/core/store/ratings';
import { RunsStore } from '../../src/core/store/runs';
import { SettingsStore } from '../../src/core/store/settings';
import {
  applyBundle,
  buildExportBundle,
  EXPORT_FORMAT,
  InvalidBundleError,
  parseBundle,
  wipeAll,
  type TransferStores,
} from '../../src/core/store/transfer';
import { makeTitle, makeUserRating } from '../helpers/factories';

let dir: string;
let stores: TransferStores;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'estrenos-transfer-'));
  stores = {
    catalog: new CatalogStore(join(dir, 'titles.json')),
    ratings: new RatingsStore(join(dir, 'ratings.json')),
    settings: new SettingsStore(join(dir, 'settings.json')),
    runs: new RunsStore(join(dir, 'runs.json')),
  };
  await Promise.all([
    stores.catalog.load(),
    stores.ratings.load(),
    stores.settings.load(),
    stores.runs.load(),
  ]);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('buildExportBundle (FR-037)', () => {
  it('incluye catálogo, valoraciones, ajustes e historial', async () => {
    await stores.catalog.upsertMany([makeTitle({ id: 'a' })]);
    await stores.ratings.setScores('a', { story: 9 });

    const bundle = buildExportBundle(stores, '1.0.0');

    expect(bundle.format).toBe(EXPORT_FORMAT);
    expect(bundle.titles).toHaveLength(1);
    expect(bundle.ratings).toHaveLength(1);
    expect(bundle.settings.criteria).toHaveLength(7);
    expect(bundle.app.version).toBe('1.0.0');
  });
});

describe('parseBundle (FR-038)', () => {
  it('acepta lo que exporta la propia aplicación', async () => {
    await stores.catalog.upsertMany([makeTitle({ id: 'a' })]);
    const bundle = buildExportBundle(stores, '1.0.0');
    expect(parseBundle(JSON.parse(JSON.stringify(bundle))).titles).toHaveLength(1);
  });

  it('rechaza archivos que no son una exportación nuestra', () => {
    expect(() => parseBundle(null)).toThrow(InvalidBundleError);
    expect(() => parseBundle('texto')).toThrow(InvalidBundleError);
    expect(() => parseBundle({ format: 'otra-cosa' })).toThrow(InvalidBundleError);
  });

  it('rechaza una versión de formato posterior a la que entendemos', () => {
    expect(() => parseBundle({ format: EXPORT_FORMAT, version: 99 })).toThrow(InvalidBundleError);
  });

  it('descarta entradas que romperían los invariantes en vez de importarlas', () => {
    const bundle = parseBundle({
      format: EXPORT_FORMAT,
      version: 1,
      titles: [{ id: 'roto' }, makeTitle({ id: 'bueno' })],
      ratings: [{ nada: true }, makeUserRating({ titleId: 'bueno' })],
    });
    expect(bundle.titles.map((t) => t.id)).toEqual(['bueno']);
    expect(bundle.ratings.map((r) => r.titleId)).toEqual(['bueno']);
  });

  it('sanea unos ajustes manipulados en lugar de aceptarlos', () => {
    const bundle = parseBundle({
      format: EXPORT_FORMAT,
      version: 1,
      settings: { schedule: { enabled: true, weekday: 99, hour: 99 } },
    });
    expect(bundle.settings.schedule.weekday).toBeLessThanOrEqual(6);
    expect(bundle.settings.schedule.hour).toBeLessThanOrEqual(23);
  });
});

describe('applyBundle (FR-038)', () => {
  it('fusiona títulos y respeta las valoraciones existentes', async () => {
    await stores.ratings.setScores('a', { story: 9 });

    const outcome = await applyBundle(
      stores,
      parseBundle({
        format: EXPORT_FORMAT,
        version: 1,
        titles: [makeTitle({ id: 'a' })],
        ratings: [makeUserRating({ titleId: 'a', scores: { story: 1 } })],
      }),
      false,
    );

    expect(outcome.titlesImported).toBe(1);
    expect(outcome.ratingsSkipped).toBe(1);
    expect(stores.ratings.get('a')?.scores.story).toBe(9);
  });

  it('sustituye las valoraciones cuando se confirma explícitamente', async () => {
    await stores.ratings.setScores('a', { story: 9 });

    await applyBundle(
      stores,
      parseBundle({
        format: EXPORT_FORMAT,
        version: 1,
        titles: [makeTitle({ id: 'a' })],
        ratings: [makeUserRating({ titleId: 'a', scores: { story: 1 } })],
      }),
      true,
    );

    expect(stores.ratings.get('a')?.scores.story).toBe(1);
  });

  it('una ida y vuelta completa conserva los datos', async () => {
    await stores.catalog.upsertMany([makeTitle({ id: 'a' }), makeTitle({ id: 'b' })]);
    await stores.ratings.setScores('a', { story: 7, acting: 8 }, 'Correcta');

    const exported = JSON.parse(JSON.stringify(buildExportBundle(stores, '1.0.0')));
    await wipeAll(stores);
    expect(stores.catalog.size).toBe(0);

    await applyBundle(stores, parseBundle(exported), true);

    expect(stores.catalog.size).toBe(2);
    expect(stores.ratings.get('a')?.scores).toEqual({ story: 7, acting: 8 });
    expect(stores.ratings.get('a')?.notes).toBe('Correcta');
  });
});

describe('wipeAll (FR-039)', () => {
  it('borra catálogo, valoraciones e historial y devuelve los ajustes a fábrica', async () => {
    await stores.catalog.upsertMany([makeTitle({ id: 'a' })]);
    await stores.ratings.setWatched('a', true);
    await stores.settings.update({ revalidateTrailerWeeks: 2 });

    await wipeAll(stores);

    expect(stores.catalog.size).toBe(0);
    expect(stores.ratings.size).toBe(0);
    expect(stores.runs.list()).toHaveLength(0);
    expect(stores.settings.get().revalidateTrailerWeeks).toBe(8);
  });
});
