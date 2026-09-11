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

/**
 * Acceso diferido al puente.
 *
 * **No** se puede hacer `const api = window.api` al cargar el módulo. En el PC
 * funcionaría, porque el precargador de Electron define `window.api` antes de
 * que se ejecute nada de la interfaz; pero en Android lo define el arranque del
 * móvil de forma asíncrona, y para entonces este módulo ya habría capturado
 * `undefined`. El resultado era una pantalla negra: el primer efecto que
 * tocaba `api.on` lanzaba y React no llegaba a pintar.
 *
 * Con un proxy, cada acceso resuelve el puente en ese momento.
 */
function bridge(): IpcApi {
  const current = window.api;
  if (!current) {
    throw new Error('La aplicación todavía no ha terminado de iniciarse.');
  }
  return current;
}

export const api: IpcApi = new Proxy({} as IpcApi, {
  get(_target, property) {
    return bridge()[property as keyof IpcApi];
  },
  has(_target, property) {
    return property in bridge();
  },
});

/** ¿Está ya disponible el puente? Útil para no renderizar antes de tiempo. */
export function isApiReady(): boolean {
  return Boolean(window.api);
}

export function describeApiError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Ha ocurrido un error inesperado.';
}
