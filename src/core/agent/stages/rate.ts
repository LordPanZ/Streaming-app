/**
 * Etapa 3: notas de crítica (FR-013, FR-014).
 *
 * Sin clave de OMDb la ejecución continúa: se conserva la nota de TMDB y las
 * demás quedan ausentes. Degradar es preferible a abortar (Art. IV.1).
 *
 * Las consultas van en paralelo acotado (ADR-016); las incidencias se vuelcan
 * después en el orden del catálogo, no en el de respuesta.
 */

import type { CriticRatings, Title } from '../../../shared/types';
import { hasRatings } from '../../providers/omdb';
import { DEFAULT_STAGE_CONCURRENCY, mapWithConcurrency, progressCounter } from '../concurrency';
import type { AgentDeps, PipelineContext } from '../context';
import { describeError, IssueBag } from '../report';

export async function stageRate(ctx: PipelineContext, deps: AgentDeps): Promise<void> {
  await ctx.recorder.stage('rate', async (counters) => {
    const { omdb } = deps;

    if (!omdb) {
      ctx.recorder.warn(
        'rate',
        'omdb',
        'Sin clave de OMDb: los títulos se guardan solo con la nota de TMDB.',
      );
      return;
    }

    // Un estreno muy reciente suele no tener ficha en IMDb todavía: eso no es
    // una incidencia, es un título que no hay dónde consultar.
    const pending = ctx.titles.filter((title): title is Title => title.imdbId !== null);
    const tick = progressCounter();

    const outcomes = await mapWithConcurrency(
      pending,
      deps.concurrency ?? DEFAULT_STAGE_CONCURRENCY,
      async (title) => {
        const bag = new IssueBag();
        const imdbId = title.imdbId as string;
        let failed = false;

        try {
          const fetched = await omdb.ratingsFor(imdbId, deps.now());
          title.ratings = mergeRatings(title.ratings, fetched);
          if (!hasRatings(fetched)) {
            bag.warn('omdb', 'OMDb no tiene notas para este título.', {
              titleId: title.id,
              titleName: title.title,
            });
          }
        } catch (error) {
          failed = true;
          bag.warn('omdb', describeError(error), { titleId: title.id, titleName: title.title });
        } finally {
          deps.onProgress?.({
            runId: ctx.runId,
            stage: 'rate',
            done: tick(),
            total: pending.length,
            message: title.title,
          });
        }

        return { bag, failed };
      },
    );

    for (const outcome of outcomes) {
      if (outcome.failed) counters.failed += 1;
      else counters.processed += 1;
    }
    ctx.recorder.drain(
      'rate',
      outcomes.map((outcome) => outcome.bag),
    );
  });
}

/**
 * Combina las notas de OMDb con la de TMDB que ya traía el título.
 * Ninguna fuente pisa a otra con un `null`: lo ausente se queda ausente, y lo
 * que ya había se conserva (FR-014).
 */
export function mergeRatings(existing: CriticRatings, incoming: CriticRatings): CriticRatings {
  return {
    imdb: incoming.imdb ?? existing.imdb,
    rottenTomatoes: incoming.rottenTomatoes ?? existing.rottenTomatoes,
    metacritic: incoming.metacritic ?? existing.metacritic,
    tmdb: existing.tmdb ?? incoming.tmdb,
    imdbVotes: incoming.imdbVotes ?? existing.imdbVotes,
    fetchedAt: incoming.fetchedAt ?? existing.fetchedAt,
  };
}
