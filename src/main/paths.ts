/**
 * Rutas de los archivos de datos (modelo de datos, §1).
 *
 * La resolución es una función pura sobre un directorio base para que el modo
 * desatendido pueda apuntar a otro sitio sin tocar nada más (ADR-011).
 */

import { join } from 'node:path';

export interface AppPaths {
  dataDir: string;
  titles: string;
  ratings: string;
  runs: string;
  settings: string;
  cache: string;
  secrets: string;
}

export function resolvePaths(baseDir: string): AppPaths {
  return {
    dataDir: baseDir,
    titles: join(baseDir, 'titles.json'),
    ratings: join(baseDir, 'ratings.json'),
    runs: join(baseDir, 'runs.json'),
    settings: join(baseDir, 'settings.json'),
    cache: join(baseDir, 'cache.json'),
    secrets: join(baseDir, 'secrets.bin'),
  };
}

/** Subcarpeta dentro del directorio de datos de la aplicación. */
export const DATA_FOLDER = 'estrenos-es';
