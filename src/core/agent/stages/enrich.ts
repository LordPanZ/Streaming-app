/**
 * Etapa 2: enriquecimiento de la ficha (FR-011, FR-012).
 *
 * Una petición por título gracias a `append_to_response`. Solo se gasta una
 * segunda cuando la lista de vídeos en castellano no da un tráiler en
 * castellano y merece la pena mirar los vídeos sin filtrar (FR-016).
 *
 * Las fichas se piden en paralelo acotado (ADR-016). El orden de `ctx.titles`
 * no depende de cuál conteste antes: es el del descubrimiento, igual que
 * cuando la etapa iba de una en una.
 */

import type { MediaType, Title } from '../../../shared/types';
import { mapTitle, type TmdbClient, type TmdbDetails } from '../../providers/tmdb';
import type { VideoCandidate } from '../../domain/trailer';
import { isWithinWindow } from '../../domain/weeks';
import { DEFAULT_STAGE_CONCURRENCY, mapWithConcurrency, progressCounter } from '../concurrency';
import type { AgentDeps, PipelineContext } from '../context';
import { describeError, IssueBag } from '../report';

/** Resultado del trabajo de un título, para consolidarlo después en orden. */
interface EnrichOutcome {
  title: Title | null;
  bag: IssueBag;
  processed: boolean;
  failed: boolean;
  outOfWindow: boolean;
}

export async function stageEnrich(ctx: PipelineContext, deps: AgentDeps): Promise<void> {
  const { tmdb } = deps;
  if (!tmdb) return;

  await ctx.recorder.stage('enrich', async (counters) => {
    const items = [...ctx.discovered.values()];
    const tick = progressCounter();

    const outcomes = await mapWithConcurrency(
      items,
      deps.concurrency ?? DEFAULT_STAGE_CONCURRENCY,
      async (item): Promise<EnrichOutcome> => {
        const bag = new IssueBag();
        const titleId = `tmdb:${item.mediaType}:${item.tmdbId}`;
        const base: EnrichOutcome = {
          title: null,
          bag,
          processed: false,
          failed: false,
          outOfWindow: false,
        };

        try {
          const details: TmdbDetails = await tmdb.details(item.mediaType, item.tmdbId);

          let title = mapTitle({
            mediaType: item.mediaType,
            details,
            fallbackPlatforms: item.platforms,
            now: deps.now(),
          });

          if (!title) {
            bag.warn(
              'tmdb',
              'Ficha sin fecha de disponibilidad o sin plataforma en España; se descarta.',
              { titleId },
            );
            return { ...base, failed: true };
          }

          // Sin tráiler en castellano, merece la pena mirar los vídeos sin
          // filtro de idioma antes de rendirse (FR-016).
          if (!title.trailer || title.trailer.language !== 'es') {
            const extra = await safeVideos(tmdb, item.mediaType, item.tmdbId, bag, title.title);
            if (extra.length > 0) {
              const remapped = mapTitle({
                mediaType: item.mediaType,
                details,
                fallbackPlatforms: item.platforms,
                extraVideos: extra,
                now: deps.now(),
              });
              if (remapped) title = remapped;
            }
          }

          if (!isWithinWindow(title.availableFrom, ctx.window)) {
            // La ficha puede traer una fecha distinta de la del descubrimiento.
            return { ...base, processed: true, outOfWindow: true };
          }

          return { ...base, title, processed: true };
        } catch (error) {
          bag.warn('tmdb', describeError(error), { titleId });
          return { ...base, failed: true };
        } finally {
          const done = tick();
          deps.onProgress?.({
            runId: ctx.runId,
            stage: 'enrich',
            done,
            total: items.length,
            message: `Ficha ${done} de ${items.length}`,
          });
        }
      },
    );

    // Consolidación en el orden de entrada: el paralelismo no puede cambiar ni
    // el catálogo resultante ni el informe (Art. VII).
    for (const outcome of outcomes) {
      if (outcome.processed) counters.processed += 1;
      if (outcome.failed) counters.failed += 1;
      if (outcome.outOfWindow) ctx.recorder.counts.skipped += 1;
      if (outcome.title) ctx.titles.push(outcome.title);
    }
    ctx.recorder.drain(
      'enrich',
      outcomes.map((outcome) => outcome.bag),
    );
  });
}

/** Los vídeos son un extra: que fallen no puede costar el título entero. */
async function safeVideos(
  tmdb: TmdbClient,
  mediaType: MediaType,
  tmdbId: number,
  bag: IssueBag,
  titleName: string,
): Promise<VideoCandidate[]> {
  try {
    return await tmdb.videos(mediaType, tmdbId);
  } catch (error) {
    bag.warn('tmdb', `Sin vídeos alternativos: ${describeError(error)}`, { titleName });
    return [];
  }
}
