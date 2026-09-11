/**
 * Envoltura tipada de `window.api`.
 *
 * Desenvuelve `IpcResult` para que los componentes trabajen con datos o con
 * excepciones, no con uniones discriminadas por todas partes. El error del
 * contrato se conserva íntegro para poder distinguir "falta la clave" de
 * "algo se ha roto".
 */

import type { IpcApi, IpcError, IpcResult } from '../shared/ipc';

declare global {
  interface Window {
    api: IpcApi;
  }
}

export class ApiError extends Error {
  constructor(readonly detail: IpcError) {
    super(detail.message);
    this.name = 'ApiError';
  }

  get code(): IpcError['code'] {
    return this.detail.code;
  }
}

export async function unwrap<T>(promise: Promise<IpcResult<T>>): Promise<T> {
  const result = await promise;
  if (!result.ok) throw new ApiError(result.error);
  return result.data;
}

export const api = window.api;

export function describeApiError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Ha ocurrido un error inesperado.';
}
