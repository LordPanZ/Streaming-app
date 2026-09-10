/**
 * Cliente HTTP del núcleo (T040).
 *
 * Concentra en un solo sitio las cuatro promesas que la especificación hace
 * sobre la red:
 *  - solo se contacta con los destinos del inventario cerrado (NFR-010, ADR-010);
 *  - se respetan los límites de tasa con reintentos y espera exponencial (NFR-003);
 *  - las respuestas se cachean entre ejecuciones (NFR-004);
 *  - ninguna clave de API sobrevive a un mensaje de error (NFR-009).
 *
 * `fetch` se inyecta (Art. II.2), así que las pruebas no tocan la red.
 */

import type { HttpMetrics } from '../../shared/types';
import type { ResponseCache } from './cache';

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** Inventario cerrado de destinos permitidos (ADR-010). */
export const ALLOWED_HOSTS: readonly string[] = [
  'api.themoviedb.org',
  'image.tmdb.org',
  'www.omdbapi.com',
  'www.youtube.com',
];

/** Nombres de parámetro que jamás deben aparecer en un mensaje de error. */
const SECRET_PARAMS = ['api_key', 'apikey', 'api-key', 'key', 'token'];

export interface HttpClientOptions {
  fetchImpl?: FetchLike;
  allowedHosts?: readonly string[];
  maxConcurrency?: number;
  maxRetries?: number;
  baseBackoffMs?: number;
  timeoutMs?: number;
  cache?: ResponseCache | null;
  sleep?: (ms: number) => Promise<void>;
  /** Dispersión aleatoria de la espera. Inyectable para hacer las pruebas deterministas. */
  jitter?: () => number;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly safeUrl: string,
    message?: string,
  ) {
    super(message ?? `HTTP ${status} en ${safeUrl}`);
    this.name = 'HttpError';
  }
}

export class BlockedHostError extends Error {
  constructor(readonly host: string) {
    super(
      `Destino no permitido: ${host}. El inventario de destinos está cerrado (ADR-010).`,
    );
    this.name = 'BlockedHostError';
  }
}

/**
 * Sustituye el valor de cualquier parámetro sensible por `***` (NFR-009).
 *
 * Se aplica tanto a URL como a texto libre: los mensajes de error de las APIs
 * a veces citan la petición entera y a veces solo el parámetro suelto, y los
 * dos casos filtran igual.
 *
 * La comprobación previa impide que `key` enmascare el interior de `api_key`
 * (que ya ha enmascarado su propia iteración) y que se destroce cualquier
 * palabra que acabe en uno de estos nombres.
 */
export function sanitizeUrl(url: string): string {
  let safe = url;
  for (const param of SECRET_PARAMS) {
    safe = safe.replace(new RegExp(`(?<![\\w-])(${param}=)[^&\\s"']*`, 'gi'), '$1***');
  }
  return safe;
}

export function sanitizeMessage(message: string): string {
  return sanitizeUrl(message);
}

interface RequestOptions {
  /** Milisegundos de validez en caché. `0` o ausente desactiva la caché. */
  cacheTtlMs?: number;
  /** Etiqueta legible para los mensajes de error. */
  label?: string;
  signal?: AbortSignal;
}

export class HttpClient {
  readonly metrics: HttpMetrics = { requests: 0, cacheHits: 0, retries: 0, rateLimited: 0 };

  private readonly fetchImpl: FetchLike;
  private readonly allowedHosts: Set<string>;
  private readonly maxConcurrency: number;
  private readonly maxRetries: number;
  private readonly baseBackoffMs: number;
  private readonly timeoutMs: number;
  private readonly cache: ResponseCache | null;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly jitter: () => number;

  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(options: HttpClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? ((url, init) => globalThis.fetch(url, init));
    this.allowedHosts = new Set(options.allowedHosts ?? ALLOWED_HOSTS);
    this.maxConcurrency = Math.max(1, options.maxConcurrency ?? 4);
    this.maxRetries = Math.max(0, options.maxRetries ?? 3);
    this.baseBackoffMs = Math.max(1, options.baseBackoffMs ?? 500);
    this.timeoutMs = Math.max(1, options.timeoutMs ?? 15_000);
    this.cache = options.cache ?? null;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.jitter = options.jitter ?? Math.random;
  }

  resetMetrics(): void {
    this.metrics.requests = 0;
    this.metrics.cacheHits = 0;
    this.metrics.retries = 0;
    this.metrics.rateLimited = 0;
  }

  /** GET que devuelve JSON, con caché opcional y reintentos. */
  async getJson<T>(url: string, options: RequestOptions = {}): Promise<T> {
    this.assertAllowed(url);

    const ttl = options.cacheTtlMs ?? 0;
    if (this.cache && ttl > 0) {
      const hit = this.cache.get<T>(url);
      if (hit !== undefined) {
        this.metrics.cacheHits += 1;
        return hit;
      }
    }

    const body = await this.withSlot(() => this.fetchWithRetries(url, options));
    const parsed = JSON.parse(body) as T;

    if (this.cache && ttl > 0) {
      this.cache.set(url, parsed, ttl);
    }
    return parsed;
  }

  /**
   * GET que solo interesa por el código de estado y nunca lanza por un 4xx.
   * Es lo que necesita la verificación de tráileres (FR-017): un 404 es un
   * resultado válido, no un fallo.
   */
  async probeStatus(url: string, options: RequestOptions = {}): Promise<number> {
    this.assertAllowed(url);
    return this.withSlot(async () => {
      try {
        const response = await this.fetchOnce(url, options.signal);
        this.metrics.requests += 1;
        return response.status;
      } catch {
        // Error de red: quien llama lo traducirá a `unverified`.
        this.metrics.requests += 1;
        return 0;
      }
    });
  }

  private assertAllowed(url: string): void {
    let host: string;
    try {
      host = new URL(url).host;
    } catch {
      throw new BlockedHostError(sanitizeUrl(url));
    }
    if (!this.allowedHosts.has(host)) {
      throw new BlockedHostError(host);
    }
  }

  private async fetchWithRetries(url: string, options: RequestOptions): Promise<string> {
    const safeUrl = sanitizeUrl(url);
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      if (attempt > 0) this.metrics.retries += 1;

      try {
        const response = await this.fetchOnce(url, options.signal);
        this.metrics.requests += 1;

        if (response.status === 429) {
          this.metrics.rateLimited += 1;
          if (attempt === this.maxRetries) {
            throw new HttpError(429, safeUrl, `Límite de tasa alcanzado en ${options.label ?? safeUrl}`);
          }
          await this.sleep(this.backoffFor(attempt, response.headers.get('retry-after')));
          continue;
        }

        if (response.status >= 500) {
          if (attempt === this.maxRetries) {
            throw new HttpError(response.status, safeUrl);
          }
          await this.sleep(this.backoffFor(attempt, null));
          continue;
        }

        if (!response.ok) {
          // 4xx distinto de 429: reintentar no arregla nada.
          throw new HttpError(response.status, safeUrl);
        }

        return await response.text();
      } catch (error) {
        if (error instanceof HttpError && error.status !== 429 && error.status < 500) {
          throw error;
        }
        lastError = error;
        if (attempt === this.maxRetries) break;
        await this.sleep(this.backoffFor(attempt, null));
      }
    }

    if (lastError instanceof HttpError) throw lastError;
    const detail = lastError instanceof Error ? sanitizeMessage(lastError.message) : 'desconocido';
    throw new Error(`Fallo de red en ${options.label ?? safeUrl}: ${detail}`);
  }

  private async fetchOnce(url: string, signal?: AbortSignal): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const onExternalAbort = () => controller.abort();
    signal?.addEventListener('abort', onExternalAbort);
    try {
      return await this.fetchImpl(url, {
        signal: controller.signal,
        headers: { accept: 'application/json' },
      });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onExternalAbort);
    }
  }

  /** 500 ms × 2ⁿ más dispersión, o lo que diga `Retry-After` si es mayor. */
  private backoffFor(attempt: number, retryAfter: string | null): number {
    const exponential = this.baseBackoffMs * 2 ** attempt;
    const spread = Math.floor(this.jitter() * this.baseBackoffMs);
    const computed = exponential + spread;
    if (!retryAfter) return computed;
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.max(computed, seconds * 1000);
    }
    return computed;
  }

  /** Semáforo de concurrencia (Art. V.1). */
  private async withSlot<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.maxConcurrency) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active += 1;
    try {
      return await task();
    } finally {
      this.active -= 1;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}
