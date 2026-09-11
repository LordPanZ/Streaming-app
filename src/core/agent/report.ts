/**
 * Construcción del informe de ejecución (FR-008) y saneado de claves (NFR-009).
 *
 * Todo lo que sale de una etapa pasa por aquí antes de persistirse, para que
 * ninguna URL con `api_key` acabe en `runs.json`.
 */

import type {
  AgentRun,
  HttpMetrics,
  RunIssue,
  RunStatus,
  RunTrigger,
  StageName,
  StageReport,
} from '../../shared/types';
import { randomHex } from '../domain/ids';
import type { DateWindow } from '../domain/weeks';
import { sanitizeMessage } from '../providers/http';

export function newRunId(now: Date): string {
  return `run-${now.toISOString().replace(/[:.]/g, '-')}-${randomHex(3)}`;
}

/** Copia de la incidencia con el mensaje libre de claves de API. */
export function sanitizeIssue(issue: RunIssue): RunIssue {
  return { ...issue, message: sanitizeMessage(issue.message) };
}

/** Texto de error legible y saneado a partir de cualquier excepción. */
export function describeError(error: unknown): string {
  if (error instanceof Error) return sanitizeMessage(error.message);
  return sanitizeMessage(String(error));
}

/**
 * Estado global de la ejecución (ADR-006).
 *
 * La distinción importa para el usuario: "no hay estrenos esta semana" y "la
 * recopilación se cayó" son cosas muy distintas y no pueden verse igual.
 */
export function statusFor(issues: readonly RunIssue[], persisted: number): RunStatus {
  const hasFatal = issues.some((issue) => issue.severity === 'error');
  if (persisted === 0 && hasFatal) return 'failed';
  if (issues.length === 0) return 'success';
  return 'partial';
}

/** Acumulador de una ejecución. Lo comparten todas las etapas. */
export class RunRecorder {
  readonly issues: RunIssue[] = [];
  readonly stages: StageReport[] = [];
  readonly perPlatform: Record<string, number> = {};
  readonly counts = { discovered: 0, created: 0, updated: 0, skipped: 0 };

  constructor(
    readonly runId: string,
    readonly trigger: RunTrigger,
    readonly startedAt: Date,
    readonly window: DateWindow,
    readonly platformsQueried: string[],
  ) {}

  issue(issue: RunIssue): void {
    this.issues.push(sanitizeIssue(issue));
  }

  warn(stage: StageName, source: string, message: string, extra: Partial<RunIssue> = {}): void {
    this.issue({ stage, source, message, severity: 'warn', ...extra });
  }

  error(stage: StageName, source: string, message: string, extra: Partial<RunIssue> = {}): void {
    this.issue({ stage, source, message, severity: 'error', ...extra });
  }

  /** Cronometra una etapa y registra su informe pase lo que pase. */
  async stage<T>(
    stage: StageName,
    run: (report: { processed: number; failed: number }) => Promise<T>,
  ): Promise<T> {
    const startedAt = new Date();
    const counters = { processed: 0, failed: 0 };
    try {
      return await run(counters);
    } finally {
      this.stages.push({
        stage,
        startedAt: startedAt.toISOString(),
        durationMs: Date.now() - startedAt.getTime(),
        processed: counters.processed,
        failed: counters.failed,
      });
    }
  }

  build(finishedAt: Date, http: HttpMetrics): AgentRun {
    const persisted = this.counts.created + this.counts.updated;
    return {
      id: this.runId,
      trigger: this.trigger,
      startedAt: this.startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - this.startedAt.getTime(),
      status: statusFor(this.issues, persisted),
      window: this.window,
      platformsQueried: this.platformsQueried,
      counts: { ...this.counts },
      perPlatform: { ...this.perPlatform },
      http: { ...http },
      stages: [...this.stages],
      issues: this.issues.map(sanitizeIssue),
    };
  }
}
