/**
 * Implementación de `IpcApi` en el mismo proceso, para Android (ADR-012).
 *
 * En el PC la interfaz habla con el proceso principal por un canal; aquí llama
 * al servicio directamente. La interfaz no nota la diferencia: ve el mismo
 * `window.api` con la misma forma y los mismos errores.
 */

import type { AppEvent, AppService } from '../../core/app/app-service';
import { MissingApiKeyError } from '../../core/app/app-service';
import { AgentBusyError } from '../../core/app/container';
import { InvalidBundleError } from '../../core/store/transfer';
import { sanitizeMessage } from '../../core/providers/http';
import { ValidationError } from '../../shared/validate';
import {
  ipcFail,
  ipcOk,
  type IpcApi,
  type IpcResult,
} from '../../shared/ipc';
import type { AgentProgress, AgentRunSummary } from '../../shared/types';
import type { CatalogChangedEvent } from '../../shared/ipc';

/** Mismo mapeo de errores que el adaptador de Electron, para no divergir. */
function toError(error: unknown): IpcResult<never> {
  if (error instanceof ValidationError) return ipcFail('INVALID_INPUT', error.message);
  if (error instanceof InvalidBundleError) return ipcFail('INVALID_INPUT', error.message);
  if (error instanceof AgentBusyError) return ipcFail('BUSY', error.message);
  if (error instanceof MissingApiKeyError) return ipcFail('NO_API_KEY', error.message);

  const message = error instanceof Error ? sanitizeMessage(error.message) : 'Error inesperado.';
  return ipcFail('INTERNAL', message);
}

async function wrap<T>(run: () => Promise<T> | T): Promise<IpcResult<T>> {
  try {
    return ipcOk(await run());
  } catch (error) {
    return toError(error);
  }
}

/** Reparto de eventos a los oyentes de la interfaz. */
export class LocalEventBus {
  private readonly listeners = new Map<AppEvent['type'], Set<(payload: never) => void>>();

  emit = (event: AppEvent): void => {
    for (const listener of this.listeners.get(event.type) ?? []) {
      (listener as (payload: AppEvent['payload']) => void)(event.payload);
    }
  };

  on<T>(type: AppEvent['type'], callback: (payload: T) => void): () => void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(callback as (payload: never) => void);
    this.listeners.set(type, set);
    return () => {
      set.delete(callback as (payload: never) => void);
    };
  }
}

export interface LocalApiOptions {
  service: AppService;
  events: LocalEventBus;
  /** Abre un enlace fuera de la aplicación (FR-020). */
  openExternal: (url: string) => Promise<void>;
  /** Entrega el paquete de exportación al sistema (FR-037). */
  exportBundle: (contents: string, suggestedName: string) => Promise<string | null>;
  /** Pide al usuario un archivo y devuelve su contenido (FR-038). */
  pickImport: () => Promise<string | null>;
}

export function createLocalApi(options: LocalApiOptions): IpcApi {
  const { service, events } = options;

  return {
    catalog: {
      query: (input) => wrap(() => service.catalogQuery(input)),
      get: (id) => wrap(() => service.catalogGet(id)),
      facets: () => wrap(() => service.catalogFacets()),
    },
    ratings: {
      setWatched: (input) => wrap(() => service.ratingsSetWatched(input)),
      setScores: (input) => wrap(() => service.ratingsSetScores(input)),
      clear: (titleId) => wrap(() => service.ratingsClear(titleId)),
      stats: () => wrap(() => service.ratingsStats()),
    },
    agent: {
      run: () => wrap(() => service.agentRun()),
      status: () => wrap(() => service.agentStatus()),
      runs: (limit) => wrap(() => service.agentRuns(limit)),
    },
    settings: {
      get: () => wrap(() => service.settingsGet()),
      update: (patch) => wrap(() => service.settingsUpdate(patch)),
    },
    secrets: {
      set: (input) => wrap(() => service.secretsSet(input)),
      status: () => wrap(() => service.secretsStatus()),
      verify: (input) => wrap(() => service.secretsVerify(input)),
    },
    data: {
      export: () =>
        wrap(async () => {
          const stamp = new Date().toISOString().slice(0, 10);
          const contents = `${JSON.stringify(service.buildExport(), null, 2)}\n`;
          return { path: await options.exportBundle(contents, `estrenos-es-${stamp}.json`) };
        }),
      import: (input) =>
        wrap(async () => {
          const raw = await options.pickImport();
          if (raw === null) {
            return {
              titlesImported: 0,
              ratingsImported: 0,
              ratingsSkipped: 0,
              settingsImported: false,
            };
          }
          return service.applyImport(JSON.parse(raw), input);
        }),
      wipe: () => wrap(() => service.dataWipe()),
      loadSamples: () => wrap(() => service.loadSamples()),
      clearSamples: () => wrap(() => service.clearSamples()),
    },
    shell: {
      openExternal: (url) =>
        wrap(async () => {
          await options.openExternal(service.resolveExternalUrl(url));
          return { opened: true };
        }),
    },
    on: {
      agentProgress: (cb) => events.on<AgentProgress>('agent:progress', cb),
      agentDone: (cb) => events.on<AgentRunSummary>('agent:done', cb),
      catalogChanged: (cb) => events.on<CatalogChangedEvent>('catalog:changed', cb),
    },
  };
}
