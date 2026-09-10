/**
 * Almacén documental en JSON con escritura atómica (FR-040, ADR-005).
 *
 * La escritura es: archivo temporal → `fsync` → `rename`. `rename` dentro del
 * mismo sistema de archivos es atómico en Windows, macOS y Linux, así que un
 * corte de corriente deja el archivo anterior intacto o el nuevo completo, pero
 * nunca medio archivo.
 *
 * Un JSON corrupto no puede dejar la aplicación inservible: se aparta con
 * marca de tiempo y se arranca con los valores por defecto.
 */

import { randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { access, mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** Aviso de que un archivo corrupto se ha apartado y se ha vuelto a los valores por defecto. */
export type RecoverHandler = (info: {
  filePath: string;
  backupPath: string;
  reason: string;
}) => void;

export interface JsonStoreOptions<T> {
  filePath: string;
  /** Contenido inicial cuando el archivo no existe o está corrupto. */
  defaults: () => T;
  /**
   * Adapta y valida lo leído del disco. Debe devolver un valor válido siempre:
   * es el punto donde se aplican las migraciones de esquema.
   */
  revive?: (raw: unknown, defaults: T) => T;
  /** Aviso de recuperación, para poder registrarlo sin acoplar el almacén a un logger. */
  onRecover?: RecoverHandler;
}

export class JsonStore<T> {
  private data: T | null = null;
  /** Cola de escritura: garantiza un `rename` cada vez, en orden. */
  private writeChain: Promise<unknown> = Promise.resolve();

  constructor(private readonly options: JsonStoreOptions<T>) {}

  get filePath(): string {
    return this.options.filePath;
  }

  /** Lee el archivo (o crea el estado por defecto). Idempotente. */
  async load(): Promise<T> {
    if (this.data !== null) return this.data;

    const defaults = this.options.defaults();
    let raw: string;
    try {
      raw = await readFile(this.options.filePath, 'utf8');
    } catch (error) {
      if (isMissingFile(error)) {
        this.data = defaults;
        return this.data;
      }
      throw error;
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      this.data = this.options.revive ? this.options.revive(parsed, defaults) : (parsed as T);
    } catch (error) {
      const backupPath = await this.quarantine(raw);
      this.options.onRecover?.({
        filePath: this.options.filePath,
        backupPath,
        reason: error instanceof Error ? error.message : 'JSON ilegible',
      });
      this.data = defaults;
    }

    return this.data;
  }

  /** Estado en memoria. Exige haber llamado antes a `load()`. */
  get(): T {
    if (this.data === null) {
      throw new Error(`El almacén ${this.options.filePath} no está cargado`);
    }
    return this.data;
  }

  /** Reemplaza el estado y lo persiste. */
  async save(next: T): Promise<T> {
    this.data = next;
    await this.enqueueWrite(next);
    return next;
  }

  /** Modifica el estado con una función y lo persiste. */
  async update(mutate: (current: T) => T): Promise<T> {
    const current = await this.load();
    return this.save(mutate(current));
  }

  /** Descarta el archivo y vuelve a los valores por defecto (FR-039). */
  async reset(): Promise<T> {
    const defaults = this.options.defaults();
    this.data = defaults;
    await this.enqueueWrite(defaults);
    return defaults;
  }

  private enqueueWrite(value: T): Promise<void> {
    const next = this.writeChain.then(
      () => atomicWriteJson(this.options.filePath, value),
      () => atomicWriteJson(this.options.filePath, value),
    );
    this.writeChain = next.catch(() => undefined);
    return next;
  }

  private async quarantine(contents: string): Promise<string> {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${this.options.filePath}.corrupt-${stamp}`;
    try {
      await mkdir(dirname(backupPath), { recursive: true });
      await writeFile(backupPath, contents, 'utf8');
    } catch {
      // Si ni siquiera se puede apartar la copia, seguimos: perder el archivo
      // corrupto es preferible a no arrancar.
    }
    return backupPath;
  }
}

/** Escritura atómica de un valor serializable a JSON. */
export async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
  const directory = dirname(filePath);
  await mkdir(directory, { recursive: true });

  const tempPath = join(
    directory,
    `.${randomBytes(8).toString('hex')}.tmp`,
  );
  const payload = `${JSON.stringify(value, null, 2)}\n`;

  const handle = await open(tempPath, 'w');
  try {
    await handle.writeFile(payload, 'utf8');
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

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}
