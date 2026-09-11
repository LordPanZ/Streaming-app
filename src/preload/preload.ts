/**
 * Puente entre el renderizador y el proceso principal (Art. VI.2).
 *
 * Superficie mínima: el renderizador ve exactamente los canales del contrato y
 * nada más. Ni `ipcRenderer`, ni `require`, ni `process`, ni el sistema de
 * archivos.
 */

import { contextBridge, ipcRenderer } from 'electron';
import type {
  AgentProgress,
  AgentRunSummary,
  CatalogQuery,
  Settings,
} from '../shared/types';
import {
  IPC,
  IPC_EVENTS,
  type CatalogChangedEvent,
  type ImportInput,
  type IpcApi,
  type RunAgentInput,
  type SetScoresInput,
  type SetSecretsInput,
  type SetWatchedInput,
  type VerifySecretInput,
} from '../shared/ipc';

function invoke<T>(channel: string, payload?: unknown): Promise<T> {
  return ipcRenderer.invoke(channel, payload) as Promise<T>;
}

/** Suscripción que devuelve su propia función de baja, para no filtrar oyentes. */
function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: unknown, payload: T) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

const api: IpcApi = {
  catalog: {
    query: (input: CatalogQuery) => invoke(IPC.catalogQuery, input),
    get: (id: string) => invoke(IPC.catalogGet, id),
    facets: () => invoke(IPC.catalogFacets),
  },
  ratings: {
    setWatched: (input: SetWatchedInput) => invoke(IPC.ratingsSetWatched, input),
    setScores: (input: SetScoresInput) => invoke(IPC.ratingsSetScores, input),
    clear: (titleId: string) => invoke(IPC.ratingsClear, titleId),
    stats: () => invoke(IPC.ratingsStats),
  },
  agent: {
    run: (input: RunAgentInput) => invoke(IPC.agentRun, input),
    status: () => invoke(IPC.agentStatus),
    runs: (limit?: number) => invoke(IPC.agentRuns, limit),
  },
  settings: {
    get: () => invoke(IPC.settingsGet),
    update: (patch: Partial<Settings>) => invoke(IPC.settingsUpdate, patch),
  },
  secrets: {
    set: (input: SetSecretsInput) => invoke(IPC.secretsSet, input),
    status: () => invoke(IPC.secretsStatus),
    verify: (input: VerifySecretInput) => invoke(IPC.secretsVerify, input),
  },
  data: {
    export: () => invoke(IPC.dataExport),
    import: (input: ImportInput) => invoke(IPC.dataImport, input),
    wipe: () => invoke(IPC.dataWipe),
  },
  shell: {
    openExternal: (url: string) => invoke(IPC.shellOpenExternal, { url }),
  },
  on: {
    agentProgress: (cb: (p: AgentProgress) => void) =>
      subscribe<AgentProgress>(IPC_EVENTS.agentProgress, cb),
    agentDone: (cb: (s: AgentRunSummary) => void) =>
      subscribe<AgentRunSummary>(IPC_EVENTS.agentDone, cb),
    catalogChanged: (cb: (e: CatalogChangedEvent) => void) =>
      subscribe<CatalogChangedEvent>(IPC_EVENTS.catalogChanged, cb),
  },
};

contextBridge.exposeInMainWorld('api', api);
