/**
 * Etapa 4: verificación de tráileres (FR-017) y revalidación de los recientes
 * (FR-019).
 *
 * Un enlace solo se marca como vivo si YouTube lo confirma. Cuando no se puede
 * comprobar queda `unverified`, que la interfaz muestra distinto de `live`:
 * decir "vivo" sin haberlo mirado está prohibido (Art. IV.3).
 */

import type { Title } from '../../../shared/types';
import { buildSearchFallbackUrl } from '../../domain/trailer';
import { currentWeek, previousWeeks } from '../../domain/weeks';
import type { AgentDeps, PipelineContext } from '../context';
import { describeError } from '../report';

export const DEFAULT_MAX_REVALIDATIONS = 200;

export async function stageTrailer(ctx: PipelineContext, deps: AgentDeps): Promise<void> {
  await ctx.recorder.stage('trailer', async (counters) => {
    const withTrailer = ctx.titles.filter((title) => title.trailer !== null);
    let done = 0;

    // --- Títulos nuevos de esta ejecución ---------------------------------
    for (const title of ctx.titles) {
      if (!title.trailer) {
        // Sin tráiler seleccionable, el usuario tiene igualmente la búsqueda
        // de respaldo (FR-018); no es una incidencia digna de informe.
        continue;
      }

      done += 1;
      deps.onProgress?.({
        runId: ctx.runId,
        stage: 'trailer',
        done,
        total: withTrailer.length,
        message: title.title,
      });

      try {
        title.trailer = await deps.youtube.verify(title.trailer, deps.now());
        counters.processed += 1;
      } catch (error) {
        counters.failed += 1;
        ctx.recorder.warn('trailer', 'youtube', describeError(error), {
          titleId: title.id,
          titleName: title.title,
        });
      }
    }

    // --- Revalidación de las últimas semanas (FR-019) ---------------------
    await revalidateRecent(ctx, deps, counters);
  });
}

async function revalidateRecent(
  ctx: PipelineContext,
  deps: AgentDeps,
  counters: { processed: number; failed: number },
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

  for (const title of candidates) {
    if (!title.trailer) continue;
    try {
      const verified = await deps.youtube.verify(title.trailer, deps.now());
      if (verified.liveness === title.trailer.liveness) continue;

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
        ctx.recorder.warn('trailer', 'youtube', 'El tráiler ya no está disponible en YouTube.', {
          titleId: title.id,
          titleName: title.title,
        });
      }
      counters.processed += 1;
    } catch (error) {
      counters.failed += 1;
      ctx.recorder.warn('trailer', 'youtube', describeError(error), {
        titleId: title.id,
        titleName: title.title,
      });
    }
  }
}
