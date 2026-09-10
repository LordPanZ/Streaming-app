/**
 * Caché de respuestas con expiración (NFR-004).
 *
 * Persistente entre ejecuciones: la gracia de la ventana semanal hace que dos
 * ejecuciones consecutivas pidan muchos títulos idénticos, y repetir esas
 * peticiones sería maltratar a terceros (Art. V.2) y quemar la cuota de OMDb.
 */

import { sanitizeUrl } from './http';

interface CacheEntry {
  /** Valor serializado, para poder guardarlo tal cual en disco. */
  value: unknown;
  expiresAt: number;
}

export interface CacheSnapshot {
  schemaVersion: number;
  entries: Record<string, CacheEntry>;
}

export const CACHE_SCHEMA_VERSION = 1;

export class ResponseCache {
  private entries = new Map<string, CacheEntry>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  get<T>(url: string): T | undefined {
    const key = cacheKey(url);
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set(url: string, value: unknown, ttlMs: number): void {
    if (ttlMs <= 0) return;
    this.entries.set(cacheKey(url), { value, expiresAt: this.now() + ttlMs });
  }

  delete(url: string): void {
    this.entries.delete(cacheKey(url));
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }

  /** Elimina lo caducado. Se llama antes de guardar para no engordar el archivo. */
  prune(): number {
    const now = this.now();
    let removed = 0;
    for (const [url, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(url);
        removed += 1;
      }
    }
    return removed;
  }

  /**
   * Vuelca la caché para persistirla. Las claves ya están saneadas desde que
   * entran, así que el archivo en disco no contiene ninguna clave de API
   * (NFR-009) y una entrada guardada se vuelve a encontrar aunque el usuario
   * haya cambiado de clave entre ejecuciones.
   */
  toSnapshot(): CacheSnapshot {
    this.prune();
    return { schemaVersion: CACHE_SCHEMA_VERSION, entries: Object.fromEntries(this.entries) };
  }

  static fromSnapshot(snapshot: unknown, now: () => number = () => Date.now()): ResponseCache {
    const cache = new ResponseCache(now);
    if (typeof snapshot !== 'object' || snapshot === null) return cache;
    const candidate = snapshot as Partial<CacheSnapshot>;
    if (typeof candidate.entries !== 'object' || candidate.entries === null) return cache;
    for (const [url, entry] of Object.entries(candidate.entries)) {
      if (typeof entry !== 'object' || entry === null) continue;
      const typed = entry as Partial<CacheEntry>;
      if (typeof typed.expiresAt !== 'number') continue;
      if (typed.expiresAt <= now()) continue;
      cache.entries.set(url, { value: typed.value, expiresAt: typed.expiresAt });
    }
    return cache;
  }
}

/**
 * Clave de caché de una URL: la URL con los parámetros sensibles enmascarados.
 * Dos peticiones que solo difieran en la clave de API colapsan en la misma
 * entrada, que es justo lo que queremos.
 */
export function cacheKey(url: string): string {
  return sanitizeUrl(url);
}
