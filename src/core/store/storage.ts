/**
 * Almacenamiento por clave (ADR-013).
 *
 * El dominio no conoce rutas (Art. II.3) ni sabe si detrás hay un sistema de
 * archivos, el almacenamiento de un contenedor de Android o un mapa en memoria.
 * Cada plataforma aporta su implementación en `src/platform/`.
 */

export interface KeyValueStorage {
  /** Contenido del documento, o `null` si no existe. */
  read(key: string): Promise<string | null>;
  /** Escribe el documento entero, creando lo que haga falta. */
  write(key: string, value: string): Promise<void>;
  /** Borra el documento. No falla si no existía. */
  remove(key: string): Promise<void>;
  /**
   * Nombre legible del sitio donde vive un documento, solo para mensajes de
   * error y para poder decirle al usuario dónde están sus datos.
   */
  describe(key: string): string;
}

/** Implementación en memoria. La usan las pruebas y nada más. */
export class MemoryStorage implements KeyValueStorage {
  private readonly documents = new Map<string, string>();

  async read(key: string): Promise<string | null> {
    return this.documents.get(key) ?? null;
  }

  async write(key: string, value: string): Promise<void> {
    this.documents.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.documents.delete(key);
  }

  describe(key: string): string {
    return `memoria:${key}`;
  }

  /** Solo para las pruebas: qué claves hay escritas. */
  keys(): string[] {
    return [...this.documents.keys()];
  }
}

/** Claves de los documentos que guarda la aplicación (modelo de datos, §1). */
export const STORAGE_KEYS = {
  titles: 'titles',
  ratings: 'ratings',
  runs: 'runs',
  settings: 'settings',
  cache: 'cache',
  secrets: 'secrets',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
