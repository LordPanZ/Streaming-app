/**
 * Etapa 1: descubrimiento de estrenos (FR-004, FR-005, FR-007).
 *
 * Resuelve los identificadores de plataforma contra el catálogo de la región
 * antes de consultar nada (FR-006) y recorre cada plataforma para películas y
 * series. El fallo de una plataforma no arrastra a las demás (FR-009).
 */

import type { MediaType, PlatformRef } from '../../../shared/types';
import { platformName, resolvePlatforms } from '../../domain/platforms';
import type { TmdbProviderEntry } from '../../providers/tmdb';
import type { AgentDeps, PipelineContext } from '../context';
import { discoveryKey } from '../context';
import { describeError } from '../report';

const MEDIA_TYPES: readonly MediaType[] = ['movie', 'series'];

function mediaLabel(mediaType: MediaType): string {
  return mediaType === 'movie' ? 'películas' : 'series';
}

export async function stageDiscover(
  ctx: PipelineContext,
  deps: AgentDeps,
  enabledPlatformIds: readonly string[],
): Promise<void> {
  const { tmdb } = deps;
  if (!tmdb) {
    ctx.recorder.error('discover', 'tmdb', 'Falta la clave de API de TMDB.');
    return;
  }

  await ctx.recorder.stage('discover', async (counters) => {
    // --- Resolución de plataformas (FR-006) -------------------------------
    const catalog: TmdbProviderEntry[] = [];
    for (const mediaType of MEDIA_TYPES) {
      try {
        catalog.push(...(await tmdb.providerCatalog(mediaType)));
      } catch (error) {
        ctx.recorder.warn(
          'discover',
          'tmdb',
          `No se pudo leer el catálogo de proveedores (${mediaLabel(mediaType)}): ${describeError(error)}`,
        );
      }
    }

    const resolution = resolvePlatforms(enabledPlatformIds, catalog);
    ctx.platforms = resolution.resolved;
    for (const message of resolution.drift) {
      ctx.recorder.warn('discover', 'tmdb', message);
    }
    for (const id of resolution.unresolved) {
      ctx.recorder.warn('discover', 'tmdb', `Plataforma desconocida en los ajustes: ${id}.`);
    }

    if (ctx.platforms.length === 0) {
      ctx.recorder.error('discover', 'tmdb', 'No hay ninguna plataforma activa que consultar.');
      return;
    }

    // --- Descubrimiento por plataforma y tipo (FR-005, FR-007) ------------
    const total = ctx.platforms.length * MEDIA_TYPES.length;
    let done = 0;

    for (const platform of ctx.platforms) {
      for (const mediaType of MEDIA_TYPES) {
        done += 1;
        deps.onProgress?.({
          runId: ctx.runId,
          stage: 'discover',
          done,
          total,
          message: `${platform.name} · ${mediaLabel(mediaType)}`,
        });

        try {
          const results = await tmdb.discoverAll({
            mediaType,
            providerId: platform.providerId,
            from: ctx.window.from,
            to: ctx.window.to,
          });

          const platformRef: PlatformRef = {
            id: platform.id,
            name: platformName(platform.id),
            providerId: platform.providerId,
            logoUrl: platform.logoPath
              ? `https://image.tmdb.org/t/p/w92${platform.logoPath}`
              : null,
            link: null,
          };

          for (const result of results) {
            const key = discoveryKey(mediaType, result.id);
            const existing = ctx.discovered.get(key);

            if (existing) {
              // El mismo título puede estar en varias plataformas a la vez.
              if (!existing.platforms.some((p) => p.id === platform.id)) {
                existing.platforms.push(platformRef);
              }
              continue;
            }

            ctx.discovered.set(key, {
              key,
              mediaType,
              tmdbId: result.id,
              platforms: [platformRef],
              voteAverage: typeof result.vote_average === 'number' ? result.vote_average : null,
              voteCount: typeof result.vote_count === 'number' ? result.vote_count : null,
            });
          }

          ctx.recorder.perPlatform[platform.id] =
            (ctx.recorder.perPlatform[platform.id] ?? 0) + results.length;
          counters.processed += 1;
        } catch (error) {
          counters.failed += 1;
          ctx.recorder.warn(
            'discover',
            'tmdb',
            `Fallo al descubrir ${mediaLabel(mediaType)} de ${platform.name}: ${describeError(error)}`,
          );
        }
      }
    }

    ctx.recorder.counts.discovered = ctx.discovered.size;
  });
}
