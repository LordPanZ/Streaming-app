/**
 * Etapa 4: verificación de tráileres (FR-017) y revalidación de los recientes
 * (FR-019).
 *
 * Un enlace solo se marca como vivo si YouTube lo confirma. Cuando no se puede
 * comprobar queda `unverified`, que la interfaz muestra distinto de `live`:
 * decir "vivo" sin haberlo mirado está prohibido (Art. IV.3).
 *
 * Las comprobaciones van en paralelo acotado (ADR-016). Las escrituras del
 * catálogo, en cambio, se hacen después y en orden: la red admite desorden, el
 * almacén no tiene por qué sufrirlo.
 */

import type { Title, Trailer } from '../../../shared/types';
import { buildSearchFallbackUrl } from '../../domain/trailer';
import { currentWeek, previousWeeks } from '../../domain/weeks';
import { DEFAULT_STAGE_CONCURRENCY, mapWithConcurrency, progressCounter } from '../concurrency';
import type { AgentDeps, PipelineContext } from '../context';
import { describeError, IssueBag } from '../report';

export const DEFAULT_MAX_REVALIDATIONS = 200;

type Counters = { processed: number; failed: number };

export async function stageTrailer(ctx: PipelineContext, deps: AgentDeps): Promise<void> {
  await ctx.recorder.stage('trailer', async (counters) => {
    // --- Títulos nuevos de esta ejecución ---------------------------------
    // Los que no traen tráiler seleccionable no se comprueban: al usuario le
    // queda la búsqueda de respaldo (FR-018) y eso no es una incidencia.
    const withTrailer = ctx.titles.filter((title) => title.trailer !== null);
    const tick = progressCounter();

    const outcomes = await mapWithConcurrency(
      withTrailer,
      deps.concurrency ?? DEFAULT_STAGE_CONCURRENCY,
      async (title) => {
        const bag = new IssueBag();
        let verified: Trailer | null = null;

        try {
          verified = await deps.youtube.verify(title.trailer as Trailer, deps.now());
        } catch (error) {
          bag.warn('youtube', describeError(error), {
            titleId: title.id,
            titleName: title.title,
          });
        } finally {
          deps.onProgress?.({
            runId: ctx.runId,
            stage: 'trailer',
            done: tick(),
            total: withTrailer.length,
            message: title.title,
          });
        }

        return { title, verified, bag };
      },
    );

    for (const outcome of outcomes) {
      if (outcome.verified) {
        outcome.title.trailer = outcome.verified;
        counters.processed += 1;
      } else {
        counters.failed += 1;
      }
    }
    ctx.recorder.drain(
      'trailer',
      outcomes.map((outcome) => outcome.bag),
    );

    // --- Revalidación de las últimas semanas (FR-019) ---------------------
    await revalidateRecent(ctx, deps, counters);
  });
}

async function revalidateRecent(
  ctx: PipelineContext,
  deps: AgentDeps,
  counters: Counters,
): Promise<void> {
  const weeksBack = deps.settings.revalidateTrailerWeeks;
  if (weeksBack <= 0) return;

  const recentWeeks = new Set(previousWeeks(currentWeek(deps.now()), weeksBack));
  const budget = deps.maxRevalidations ?? DEFAULT_MAX_REVALIDATIONS;
  const freshIds = new Set(ctx.titles.map((title) => title.id));

  const candidates = deps.catalog
    .all()
    .filter(
      (title): title is Title =>
        title.trailer !== null && recentWeeks.has(title.releaseWeek) && !freshIds.has(title.id),
    )
    .slice(0, budget);

  const outcomes = await mapWithConcurrency(
    candidates,
    deps.concurrency ?? DEFAULT_STAGE_CONCURRENCY,
    async (title) => {
      const bag = new IssueBag();
      let verified: Trailer | null = null;

      try {
        verified = await deps.youtube.verify(title.trailer as Trailer, deps.now());
      } catch (error) {
        bag.warn('youtube', describeError(error), { titleId: title.id, titleName: title.title });
      }

      return { title, verified, bag };
    },
  );

  for (const outcome of outcomes) {
    const { title, verified } = outcome;
    if (!verified) {
      counters.failed += 1;
      continue;
    }
    if (verified.liveness === title.trailer?.liveness) continue;

    await deps.catalog.replace({
      ...title,
      trailer: {
        ...verified,
        // Si ha muerto, el respaldo de búsqueda es lo único que le queda al
        // usuario: nos aseguramos de que esté presente y actualizado (FR-018).
        searchFallbackUrl:
          verified.liveness === 'dead'
            ? buildSearchFallbackUrl(title.title, title.year)
            : verified.searchFallbackUrl,
      },
      updatedAt: deps.now().toISOString(),
    });

    if (verified.liveness === 'dead') {
      outcome.bag.warn('youtube', 'El tráiler ya no está disponible en YouTube.', {
        titleId: title.id,
        titleName: title.title,
      });
    }
    counters.processed += 1;
  }

  ctx.recorder.drain(
    'trailer',
    outcomes.map((outcome) => outcome.bag),
  );
}
