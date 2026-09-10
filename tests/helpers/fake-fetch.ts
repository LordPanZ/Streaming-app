/**
 * `fetch` simulado para las pruebas de contrato. Ninguna prueba toca la red
 * (NFR-002): las respuestas salen de `tests/fixtures/`.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { FetchLike } from '../../src/core/providers/http';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

export async function loadFixture<T = unknown>(name: string): Promise<T> {
  return JSON.parse(await readFile(join(FIXTURES_DIR, name), 'utf8')) as T;
}

export interface RecordedRequest {
  url: string;
  init?: RequestInit;
}

export interface FakeResponse {
  status?: number;
  body?: unknown;
  /** Texto crudo, para probar respuestas mal formadas. */
  raw?: string;
  headers?: Record<string, string>;
  /** Lanza un error de red en vez de responder. */
  networkError?: string;
}

export interface FakeFetch {
  fetch: FetchLike;
  requests: RecordedRequest[];
  /** URL de la última petición, sin la clave de API. */
  lastUrl(): string | undefined;
}

/**
 * Crea un `fetch` que responde según una función de resolución. Registra todas
 * las peticiones para poder afirmar sobre ellas.
 */
export function createFakeFetch(
  resolve: (url: string, callIndex: number) => FakeResponse | undefined,
): FakeFetch {
  const requests: RecordedRequest[] = [];

  const fetchImpl: FetchLike = async (url, init) => {
    const index = requests.length;
    requests.push(init ? { url, init } : { url });

    const response = resolve(url, index) ?? { status: 404, body: { error: 'sin fixture' } };
    if (response.networkError) {
      throw new Error(response.networkError);
    }

    const body = response.raw ?? JSON.stringify(response.body ?? {});
    return new Response(body, {
      status: response.status ?? 200,
      headers: { 'content-type': 'application/json', ...(response.headers ?? {}) },
    });
  };

  return {
    fetch: fetchImpl,
    requests,
    lastUrl: () => requests.at(-1)?.url,
  };
}

/** Atajo: una tabla de URL (por subcadena) a respuesta. */
export function fetchFromTable(table: Array<[string, FakeResponse]>): FakeFetch {
  return createFakeFetch((url) => table.find(([needle]) => url.includes(needle))?.[1]);
}
