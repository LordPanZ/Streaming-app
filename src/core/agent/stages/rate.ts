/**
 * Etapa 3: notas de crítica (FR-013, FR-014).
 *
 * Sin clave de OMDb la ejecución continúa: se conserva la nota de TMDB y las
 * demás quedan ausentes. Degradar es preferible a abortar (Art. IV.1).
 */

import type { CriticRatings } from '../../../shared/types';
import { hasRatings } from '../../providers/omdb';
import type { AgentDeps, PipelineContext } from '../context';
import { describeError } from '../report';

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

    const pending = ctx.titles.filter((title) => title.imdbId !== null);
    let done = 0;

    for (const title of ctx.titles) {
      if (!title.imdbId) {
        // Habitual en estrenos muy recientes: no es una incidencia, es que
        // todavía no existe la ficha en IMDb.
        continue;
      }

      done += 1;
      deps.onProgress?.({
        runId: ctx.runId,
        stage: 'rate',
        done,
        total: pending.length,
        message: title.title,
      });

      try {
        const fetched = await omdb.ratingsFor(title.imdbId, deps.now());
        title.ratings = mergeRatings(title.ratings, fetched);
        if (!hasRatings(fetched)) {
          ctx.recorder.warn('rate', 'omdb', 'OMDb no tiene notas para este título.', {
            titleId: title.id,
            titleName: title.title,
          });
        }
        counters.processed += 1;
      } catch (error) {
        counters.failed += 1;
        ctx.recorder.warn('rate', 'omdb', describeError(error), {
          titleId: title.id,
          titleName: title.title,
        });
      }
    }
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
