/**
 * Documento JSON persistido sobre un `KeyValueStorage` (FR-040, ADR-013).
 *
 * La atomicidad de la escritura ya no vive aquí: es responsabilidad de la
 * implementación de almacenamiento de cada plataforma, porque las garantías que
 * puede dar Node y las que puede dar un contenedor de Android no son las
 * mismas. Lo que sí es común, y vive aquí, es que un documento corrupto no
 * puede dejar la aplicación inservible: se aparta con marca de tiempo y se
 * arranca con los valores por defecto.
 */

import { randomHex } from '../domain/ids';
import type { KeyValueStorage } from './storage';

/** Aviso de que un documento corrupto se ha apartado y se ha vuelto a empezar. */
export type RecoverHandler = (info: {
  key: string;
  backupKey: string;
  reason: string;
}) => void;

export interface JsonStoreOptions<T> {
  storage: KeyValueStorage;
  key: string;
  /** Contenido inicial cuando el documento no existe o está corrupto. */
  defaults: () => T;
  /**
   * Adapta y valida lo leído. Debe devolver un valor válido siempre: es el
   * punto donde se aplican las migraciones de esquema.
   */
  revive?: (raw: unknown, defaults: T) => T;
  onRecover?: RecoverHandler;
}

export class JsonStore<T> {
  private data: T | null = null;
  /** Cola de escritura: garantiza un guardado cada vez, y en orden. */
  private writeChain: Promise<unknown> = Promise.resolve();

  constructor(private readonly options: JsonStoreOptions<T>) {}

  get key(): string {
    return this.options.key;
  }

  /** Dónde vive este documento, en términos que el usuario entienda. */
  get location(): string {
    return this.options.storage.describe(this.options.key);
  }

  /** Lee el documento (o crea el estado por defecto). Idempotente. */
  async load(): Promise<T> {
    if (this.data !== null) return this.data;

    const defaults = this.options.defaults();
    const raw = await this.options.storage.read(this.options.key);

    if (raw === null) {
      this.data = defaults;
      return this.data;
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      this.data = this.options.revive ? this.options.revive(parsed, defaults) : (parsed as T);
    } catch (error) {
      const backupKey = await this.quarantine(raw);
      this.options.onRecover?.({
        key: this.options.key,
        backupKey,
        reason: error instanceof Error ? error.message : 'JSON ilegible',
      });
      this.data = defaults;
    }

    return this.data;
  }

  /** Estado en memoria. Exige haber llamado antes a `load()`. */
  get(): T {
    if (this.data === null) {
      throw new Error(`El almacén ${this.options.key} no está cargado`);
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

  /** Descarta el documento y vuelve a los valores por defecto (FR-039). */
  async reset(): Promise<T> {
    const defaults = this.options.defaults();
    this.data = defaults;
    await this.enqueueWrite(defaults);
    return defaults;
  }

  private enqueueWrite(value: T): Promise<void> {
    const payload = `${JSON.stringify(value, null, 2)}\n`;
    const write = () => this.options.storage.write(this.options.key, payload);
    // Se encadena incluso tras un fallo: un guardado roto no puede bloquear
    // para siempre los siguientes.
    const next = this.writeChain.then(write, write);
    this.writeChain = next.catch(() => undefined);
    return next;
  }

  private async quarantine(contents: string): Promise<string> {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupKey = `${this.options.key}.corrupt-${stamp}-${randomHex(2)}`;
    try {
      await this.options.storage.write(backupKey, contents);
    } catch {
      // Si ni siquiera se puede apartar la copia, seguimos: perder el documento
      // corrupto es preferible a no arrancar.
    }
    return backupKey;
  }
}
