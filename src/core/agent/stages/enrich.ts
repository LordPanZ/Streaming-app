/**
 * Etapa 2: enriquecimiento de la ficha (FR-011, FR-012).
 *
 * Una petición por título gracias a `append_to_response`. Solo se gasta una
 * segunda cuando la lista de vídeos en castellano no da un tráiler en
 * castellano y merece la pena mirar los vídeos sin filtrar (FR-016).
 */

import type { MediaType } from '../../../shared/types';
import { mapTitle, type TmdbClient, type TmdbDetails } from '../../providers/tmdb';
import type { VideoCandidate } from '../../domain/trailer';
import { isWithinWindow } from '../../domain/weeks';
import type { AgentDeps, PipelineContext } from '../context';
import { describeError } from '../report';

export async function stageEnrich(ctx: PipelineContext, deps: AgentDeps): Promise<void> {
  const { tmdb } = deps;
  if (!tmdb) return;

  await ctx.recorder.stage('enrich', async (counters) => {
    const items = [...ctx.discovered.values()];
    let done = 0;

    for (const item of items) {
      done += 1;
      deps.onProgress?.({
        runId: ctx.runId,
        stage: 'enrich',
        done,
        total: items.length,
        message: `Ficha ${done} de ${items.length}`,
      });

      try {
        const details: TmdbDetails = await tmdb.details(item.mediaType, item.tmdbId);

        let title = mapTitle({
          mediaType: item.mediaType,
          details,
          fallbackPlatforms: item.platforms,
          now: deps.now(),
        });

        if (!title) {
          counters.failed += 1;
          ctx.recorder.warn(
            'enrich',
            'tmdb',
            'Ficha sin fecha de disponibilidad o sin plataforma en España; se descarta.',
            { titleId: `tmdb:${item.mediaType}:${item.tmdbId}` },
          );
          continue;
        }

        // Sin tráiler en castellano, merece la pena mirar los vídeos sin filtro
        // de idioma antes de rendirse (FR-016).
        if (!title.trailer || title.trailer.language !== 'es') {
          const extraVideos = await safeVideos(tmdb, item.mediaType, item.tmdbId, ctx, title.title);
          if (extraVideos.length > 0) {
            const remapped = mapTitle({
              mediaType: item.mediaType,
              details,
              fallbackPlatforms: item.platforms,
              extraVideos,
              now: deps.now(),
            });
            if (remapped) title = remapped;
          }
        }

        if (!isWithinWindow(title.availableFrom, ctx.window)) {
          // La ficha puede traer una fecha distinta de la del descubrimiento.
          counters.processed += 1;
          ctx.recorder.counts.skipped += 1;
          continue;
        }

        ctx.titles.push(title);
        counters.processed += 1;
      } catch (error) {
        counters.failed += 1;
        ctx.recorder.warn('enrich', 'tmdb', describeError(error), {
          titleId: `tmdb:${item.mediaType}:${item.tmdbId}`,
        });
      }
    }
  });
}

/** Los vídeos son un extra: que fallen no puede costar el título entero. */
async function safeVideos(
  tmdb: TmdbClient,
  mediaType: MediaType,
  tmdbId: number,
  ctx: PipelineContext,
  titleName: string,
): Promise<VideoCandidate[]> {
  try {
    return await tmdb.videos(mediaType, tmdbId);
  } catch (error) {
    ctx.recorder.warn('enrich', 'tmdb', `Sin vídeos alternativos: ${describeError(error)}`, {
      titleName,
    });
    return [];
  }
}
