/**
 * Almacenamiento sobre el sistema de archivos del contenedor de Android
 * (ADR-013).
 *
 * **Honestidad sobre la atomicidad.** El contenedor no expone `rename`, así que
 * no se puede dar la misma garantía que en Node. Lo que se hace es escribir
 * primero una copia de seguridad y, al leer, recurrir a ella si el documento
 * principal no es JSON válido. Mitiga el caso de una escritura interrumpida,
 * pero no es equivalente, y así se declara en lugar de fingir que FR-040 se
 * cumple igual en las dos plataformas.
 */

import type { KeyValueStorage } from '../../core/store/storage';

/** Subconjunto del complemento de archivos que necesitamos. */
export interface FilesystemLike {
  readFile(options: { path: string; directory: string; encoding: string }): Promise<{ data: string | Blob }>;
  writeFile(options: {
    path: string;
    data: string;
    directory: string;
    encoding: string;
    recursive?: boolean;
  }): Promise<unknown>;
  deleteFile(options: { path: string; directory: string }): Promise<unknown>;
  mkdir(options: { path: string; directory: string; recursive: boolean }): Promise<unknown>;
}

const ENCODING = 'utf8';
const FOLDER = 'estrenos-es';

export class CapacitorFileStorage implements KeyValueStorage {
  constructor(
    private readonly filesystem: FilesystemLike,
    /** Directorio del contenedor; en Android, el privado de la aplicación. */
    private readonly directory: string,
  ) {}

  private pathFor(key: string, backup = false): string {
    if (!/^[A-Za-z0-9._-]+$/.test(key)) {
      throw new Error(`Clave de almacenamiento no válida: ${key}`);
    }
    return `${FOLDER}/${key}.json${backup ? '.bak' : ''}`;
  }

  describe(key: string): string {
    return `almacenamiento privado de la aplicación · ${this.pathFor(key)}`;
  }

  async read(key: string): Promise<string | null> {
    const main = await this.readRaw(this.pathFor(key));
    if (main !== null && isParsableJson(main)) return main;

    // El documento principal falta o está a medio escribir: se intenta la copia.
    const backup = await this.readRaw(this.pathFor(key, true));
    if (backup !== null && isParsableJson(backup)) return backup;

    // Se devuelve el principal aunque esté corrupto: `JsonStore` lo apartará y
    // avisará, que es más informativo que hacer como si no existiera.
    return main;
  }

  async write(key: string, value: string): Promise<void> {
    await this.ensureFolder();
    // Primero la copia: si el proceso muere a mitad de la segunda escritura,
    // la copia todavía tiene una versión íntegra.
    await this.writeRaw(this.pathFor(key, true), value);
    await this.writeRaw(this.pathFor(key), value);
  }

  async remove(key: string): Promise<void> {
    for (const path of [this.pathFor(key), this.pathFor(key, true)]) {
      await this.filesystem.deleteFile({ path, directory: this.directory }).catch(() => undefined);
    }
  }

  private async ensureFolder(): Promise<void> {
    await this.filesystem
      .mkdir({ path: FOLDER, directory: this.directory, recursive: true })
      .catch(() => undefined); // Ya existía.
  }

  private async readRaw(path: string): Promise<string | null> {
    try {
      const result = await this.filesystem.readFile({
        path,
        directory: this.directory,
        encoding: ENCODING,
      });
      return typeof result.data === 'string' ? result.data : null;
    } catch {
      return null; // No existe o no se puede leer.
    }
  }

  private async writeRaw(path: string, data: string): Promise<void> {
    await this.filesystem.writeFile({
      path,
      data,
      directory: this.directory,
      encoding: ENCODING,
      recursive: true,
    });
  }
}

function isParsableJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}
