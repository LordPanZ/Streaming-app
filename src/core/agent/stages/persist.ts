/**
 * Etapa 5: persistencia (FR-011).
 *
 * Una sola escritura atómica al final: si el proceso muere a mitad de la
 * ejecución, el catálogo anterior queda intacto (FR-040).
 */

import type { AgentDeps, PipelineContext } from '../context';
import { describeError } from '../report';

export async function stagePersist(ctx: PipelineContext, deps: AgentDeps): Promise<void> {
  await ctx.recorder.stage('persist', async (counters) => {
    if (ctx.titles.length === 0) {
      return;
    }

    deps.onProgress?.({
      runId: ctx.runId,
      stage: 'persist',
      done: 0,
      total: ctx.titles.length,
      message: `Guardando ${ctx.titles.length} títulos`,
    });

    try {
      const outcome = await deps.catalog.upsertMany(ctx.titles);
      ctx.recorder.counts.created += outcome.created;
      ctx.recorder.counts.updated += outcome.updated;
      ctx.recorder.counts.skipped += outcome.skipped;
      counters.processed = outcome.created + outcome.updated;
      counters.failed = outcome.skipped;
    } catch (error) {
      counters.failed = ctx.titles.length;
      ctx.recorder.error('persist', 'store', describeError(error));
    }
  });
}
