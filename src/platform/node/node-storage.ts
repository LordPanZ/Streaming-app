/**
 * Almacenamiento sobre el sistema de archivos, con escritura atómica
 * (FR-040, ADR-013). Lo usan Electron y el ejecutor de consola.
 *
 * La escritura es: archivo temporal → `fsync` → `rename`. `rename` dentro del
 * mismo sistema de archivos es atómico en Windows, macOS y Linux, así que un
 * corte de corriente deja el archivo anterior intacto o el nuevo completo, pero
 * nunca medio archivo.
 */

import { randomBytes } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { KeyValueStorage } from '../../core/store/storage';

export class NodeFileStorage implements KeyValueStorage {
  constructor(private readonly directory: string) {}

  private pathFor(key: string): string {
    // Las claves son constantes del propio programa, no entrada del usuario;
    // aun así se restringe el juego de caracteres para que una clave nueva mal
    // elegida no pueda salirse del directorio.
    if (!/^[A-Za-z0-9._-]+$/.test(key)) {
      throw new Error(`Clave de almacenamiento no válida: ${key}`);
    }
    return join(this.directory, `${key}.json`);
  }

  describe(key: string): string {
    return this.pathFor(key);
  }

  async read(key: string): Promise<string | null> {
    try {
      return await readFile(this.pathFor(key), 'utf8');
    } catch (error) {
      if (isMissingFile(error)) return null;
      throw error;
    }
  }

  async write(key: string, value: string): Promise<void> {
    await atomicWriteFile(this.pathFor(key), value, this.directory);
  }

  async remove(key: string): Promise<void> {
    await unlink(this.pathFor(key)).catch(() => undefined);
  }
}

/** Escritura atómica de texto: temporal + `fsync` + `rename`. */
export async function atomicWriteFile(
  filePath: string,
  contents: string,
  directory: string,
): Promise<void> {
  await mkdir(directory, { recursive: true });
  const tempPath = join(directory, `.${randomBytes(8).toString('hex')}.tmp`);

  const handle = await open(tempPath, 'w');
  try {
    await handle.writeFile(contents, 'utf8');
    // Sin `sync` el `rename` puede adelantar a los datos y dejar un archivo
    // válido pero vacío tras un corte de corriente.
    await handle.sync();
  } finally {
    await handle.close();
  }

  try {
    await rename(tempPath, filePath);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}
