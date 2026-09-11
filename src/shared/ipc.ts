/**
 * Definición ejecutable del contrato IPC
 * (`specs/001-estrenos-streaming-es/contracts/ipc.contract.md`).
 *
 * El proceso principal implementa `IpcApi`; el precargador la expone en
 * `window.api`; la interfaz la consume. Un cambio aquí rompe la compilación de
 * las tres capas a la vez, que es exactamente lo que queremos de un contrato.
 */

import type {
  AgentProgress,
  AgentRun,
  AgentRunSummary,
  AgentStatus,
  CatalogFacets,
  CatalogPage,
  CatalogQuery,
  ImportResult,
  SecretsStatus,
  Settings,
  TitleView,
  UserRating,
  WatchedStats,
} from './types';

export const IPC = {
  catalogQuery: 'catalog:query',
  catalogGet: 'catalog:get',
  catalogFacets: 'catalog:facets',
  ratingsSetWatched: 'ratings:set-watched',
  ratingsSetScores: 'ratings:set-scores',
  ratingsClear: 'ratings:clear',
  ratingsStats: 'ratings:stats',
  agentRun: 'agent:run',
  agentStatus: 'agent:status',
  agentRuns: 'agent:runs',
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  secretsSet: 'secrets:set',
  secretsStatus: 'secrets:status',
  secretsVerify: 'secrets:verify',
  dataSamplesLoad: 'data:samples-load',
  dataSamplesClear: 'data:samples-clear',
  dataExport: 'data:export',
  dataImport: 'data:import',
  dataWipe: 'data:wipe',
  shellOpenExternal: 'shell:open-external',
} as const;

export const IPC_EVENTS = {
  agentProgress: 'agent:progress',
  agentDone: 'agent:done',
  catalogChanged: 'catalog:changed',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];

// ---------------------------------------------------------------------------
// Envoltura de resultado
// ---------------------------------------------------------------------------

export type IpcErrorCode =
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'BUSY'
  | 'NO_API_KEY'
  | 'INTERNAL';

export interface IpcError {
  code: IpcErrorCode;
  message: string;
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcError };

export function ipcOk<T>(data: T): IpcResult<T> {
  return { ok: true, data };
}

export function ipcFail(code: IpcErrorCode, message: string): IpcResult<never> {
  return { ok: false, error: { code, message } };
}

// ---------------------------------------------------------------------------
// Cargas útiles
// ---------------------------------------------------------------------------

export interface SetWatchedInput {
  titleId: string;
  watched: boolean;
  watchedAt?: string | null;
  platform?: string | null;
}

export interface SetScoresInput {
  titleId: string;
  scores: Record<string, number>;
  notes?: string;
}

export interface RunAgentInput {
  trigger: 'manual';
}

export interface VerifySecretInput {
  which: 'tmdb' | 'omdb';
}

export interface SetSecretsInput {
  tmdb?: string;
  omdb?: string;
}

export interface ImportInput {
  overwriteRatings: boolean;
}

export interface CatalogChangedEvent {
  reason: 'agent' | 'import' | 'wipe' | 'rating';
}

// ---------------------------------------------------------------------------
// Superficie expuesta al renderizador
// ---------------------------------------------------------------------------

export interface IpcApi {
  catalog: {
    query(input: CatalogQuery): Promise<IpcResult<CatalogPage>>;
    get(id: string): Promise<IpcResult<TitleView | null>>;
    facets(): Promise<IpcResult<CatalogFacets>>;
  };
  ratings: {
    setWatched(input: SetWatchedInput): Promise<IpcResult<UserRating>>;
    setScores(input: SetScoresInput): Promise<IpcResult<UserRating>>;
    clear(titleId: string): Promise<IpcResult<{ ok: true }>>;
    stats(): Promise<IpcResult<WatchedStats>>;
  };
  agent: {
    run(input: RunAgentInput): Promise<IpcResult<AgentRunSummary>>;
    status(): Promise<IpcResult<AgentStatus>>;
    runs(limit?: number): Promise<IpcResult<AgentRun[]>>;
  };
  settings: {
    get(): Promise<IpcResult<Settings>>;
    update(patch: Partial<Settings>): Promise<IpcResult<Settings>>;
  };
  secrets: {
    set(input: SetSecretsInput): Promise<IpcResult<SecretsStatus>>;
    status(): Promise<IpcResult<SecretsStatus>>;
    verify(input: VerifySecretInput): Promise<IpcResult<{ ok: boolean; message: string }>>;
  };
  data: {
    export(): Promise<IpcResult<{ path: string | null }>>;
    import(input: ImportInput): Promise<IpcResult<ImportResult>>;
    wipe(): Promise<IpcResult<{ ok: true }>>;
    /** Carga el catálogo de ejemplo (FR-051). */
    loadSamples(): Promise<IpcResult<{ loaded: number }>>;
    /** Retira los títulos de ejemplo (FR-051). */
    clearSamples(): Promise<IpcResult<{ removed: number }>>;
  };
  shell: {
    openExternal(url: string): Promise<IpcResult<{ opened: boolean }>>;
  };
  on: {
    agentProgress(cb: (p: AgentProgress) => void): () => void;
    agentDone(cb: (s: AgentRunSummary) => void): () => void;
    catalogChanged(cb: (e: CatalogChangedEvent) => void): () => void;
  };
}
