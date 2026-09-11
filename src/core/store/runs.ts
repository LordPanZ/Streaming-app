/**
 * Historial de ejecuciones del agente (FR-008), acotado para que el archivo no
 * crezca sin límite: 50 informes son un año de ejecuciones semanales.
 */

import type { AgentRun, AgentRunSummary } from '../../shared/types';
import { JsonStore, type RecoverHandler } from './json-store';
import { STORAGE_KEYS, type KeyValueStorage } from './storage';

export const MAX_RUNS = 50;
export const RUNS_SCHEMA_VERSION = 1;

export interface RunsData {
  schemaVersion: number;
  runs: AgentRun[];
}

function emptyRuns(): RunsData {
  return { schemaVersion: RUNS_SCHEMA_VERSION, runs: [] };
}

export class RunsStore {
  private readonly store: JsonStore<RunsData>;

  constructor(storage: KeyValueStorage, onRecover?: RecoverHandler) {
    this.store = new JsonStore<RunsData>({
      storage,
      key: STORAGE_KEYS.runs,
      defaults: emptyRuns,
      revive: (raw, defaults) => {
        if (typeof raw !== 'object' || raw === null) return defaults;
        const candidate = raw as Partial<RunsData>;
        if (!Array.isArray(candidate.runs)) return defaults;
        return { schemaVersion: RUNS_SCHEMA_VERSION, runs: candidate.runs.slice(0, MAX_RUNS) };
      },
      ...(onRecover ? { onRecover } : {}),
    });
  }

  async load(): Promise<void> {
    await this.store.load();
  }

  /** Informes, del más reciente al más antiguo. */
  list(limit = MAX_RUNS): AgentRun[] {
    return this.store.get().runs.slice(0, Math.max(1, Math.min(MAX_RUNS, limit)));
  }

  last(): AgentRun | null {
    return this.store.get().runs[0] ?? null;
  }

  async append(run: AgentRun): Promise<void> {
    await this.store.update((current) => ({
      schemaVersion: RUNS_SCHEMA_VERSION,
      runs: [run, ...current.runs].slice(0, MAX_RUNS),
    }));
  }

  async wipe(): Promise<void> {
    await this.store.reset();
  }
}

export function summarize(run: AgentRun): AgentRunSummary {
  return {
    id: run.id,
    trigger: run.trigger,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    durationMs: run.durationMs,
    status: run.status,
    counts: run.counts,
    issueCount: run.issues.length,
  };
}
