/**
 * Exportación, importación y borrado de datos (FR-037, FR-038, FR-039).
 *
 * El paquete exportado es un único JSON autocontenido, sin claves de API
 * (Art. III.4, NFR-009): se puede compartir, versionar o guardar de copia sin
 * filtrar nada.
 */

import type { AgentRun, Settings, Title, UserRating } from '../../shared/types';
import { isPlausibleTitle } from './catalog';
import type { CatalogStore } from './catalog';
import { isPlausibleRating, type RatingsStore } from './ratings';
import type { RunsStore } from './runs';
import { defaultSettings, sanitizeSettings, type SettingsStore } from './settings';

export const EXPORT_FORMAT = 'estrenos-es/export';
export const EXPORT_VERSION = 1;

export interface ExportBundle {
  format: string;
  version: number;
  exportedAt: string;
  app: { name: string; version: string };
  titles: Title[];
  ratings: UserRating[];
  settings: Settings;
  runs: AgentRun[];
}

export interface ImportOutcome {
  titlesImported: number;
  ratingsImported: number;
  ratingsSkipped: number;
  settingsImported: boolean;
}

export interface TransferStores {
  catalog: CatalogStore;
  ratings: RatingsStore;
  settings: SettingsStore;
  runs: RunsStore;
}

export function buildExportBundle(
  stores: TransferStores,
  appVersion: string,
  now: Date = new Date(),
): ExportBundle {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    app: { name: 'Estrenos ES', version: appVersion },
    titles: stores.catalog.all(),
    ratings: stores.ratings.all(),
    settings: stores.settings.get(),
    runs: stores.runs.list(),
  };
}

export class InvalidBundleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidBundleError';
  }
}

/**
 * Valida un paquete importado. Se rechaza entero si no es del formato
 * esperado; dentro, cada entrada que no cumpla los invariantes se descarta en
 * silencio antes que corromper el almacén.
 */
export function parseBundle(raw: unknown): ExportBundle {
  if (typeof raw !== 'object' || raw === null) {
    throw new InvalidBundleError('El archivo no contiene un objeto JSON.');
  }
  const candidate = raw as Partial<ExportBundle>;
  if (candidate.format !== EXPORT_FORMAT) {
    throw new InvalidBundleError('El archivo no es una exportación de Estrenos ES.');
  }
  if (typeof candidate.version !== 'number' || candidate.version > EXPORT_VERSION) {
    throw new InvalidBundleError(
      `Versión de exportación no compatible: ${String(candidate.version)}.`,
    );
  }

  return {
    format: EXPORT_FORMAT,
    version: candidate.version,
    exportedAt: typeof candidate.exportedAt === 'string' ? candidate.exportedAt : '',
    app: candidate.app ?? { name: 'Estrenos ES', version: 'desconocida' },
    titles: Array.isArray(candidate.titles) ? candidate.titles.filter(isPlausibleTitle) : [],
    ratings: Array.isArray(candidate.ratings) ? candidate.ratings.filter(isPlausibleRating) : [],
    settings: sanitizeSettings(
      (candidate.settings ?? {}) as Partial<Settings>,
      defaultSettings(),
    ),
    runs: Array.isArray(candidate.runs) ? candidate.runs : [],
  };
}

/**
 * Aplica un paquete importado.
 *
 * Los títulos se fusionan (el catálogo es información pública y reemplazable);
 * las valoraciones **no** se pisan salvo confirmación explícita, porque son lo
 * único verdaderamente irrecuperable del usuario (FR-038).
 */
export async function applyBundle(
  stores: TransferStores,
  bundle: ExportBundle,
  overwriteRatings: boolean,
): Promise<ImportOutcome> {
  const upsert = await stores.catalog.upsertMany(bundle.titles);
  const ratings = await stores.ratings.merge(bundle.ratings, overwriteRatings);

  let settingsImported = false;
  if (bundle.settings) {
    await stores.settings.replace(bundle.settings);
    settingsImported = true;
  }

  return {
    titlesImported: upsert.created + upsert.updated,
    ratingsImported: ratings.imported,
    ratingsSkipped: ratings.skipped,
    settingsImported,
  };
}

/** Borra todos los datos personales (FR-039). Los ajustes vuelven a fábrica. */
export async function wipeAll(stores: TransferStores): Promise<void> {
  await stores.catalog.clear();
  await stores.ratings.wipe();
  await stores.runs.wipe();
  await stores.settings.reset();
}
