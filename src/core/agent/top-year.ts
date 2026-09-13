/**
 * Recopilación de lo mejor valorado de un año (FR-058).
 *
 * Es un recorrido aparte del agente semanal, no una etapa suya: el semanal
 * pregunta «¿qué se ha estrenado esta semana?» y este pregunta «¿qué fue lo
 * mejor de aquel año?». Comparten los clientes, el limitador de peticiones y
 * el mapeo de fichas; no comparten ni ventana temporal ni catálogo, porque
 * esto no persiste nada: responde y se va.
 */

import type { MediaType, Title } from '../../shared/types';
import { mapTitle, type TmdbClient, type TmdbDiscoverResult } from '../providers/tmdb';
import type { OmdbClient } from '../providers/omdb';
import { rankTitles, type RankedTitle } from '../domain/ranking';
import { isAnimation, TMDB_ANIMATION_GENRE_ID } from '../domain/genres';
import { mergeRatings } from './stages/rate';
import { DEFAULT_STAGE_CONCURRENCY, mapWithConcurrency, progressCounter } from './concurrency';
import { describeError } from './report';

export interface TopYearDeps {
  tmdb: TmdbClient;
  /** Sin OMDb solo hay nota de TMDB, y la media deja de ser una media. */
  omdb: OmdbClient | null;
  now: () => Date;
  concurrency?: number;
  onProgress?: (done: number, total: number, message: string) => void;
}

export interface TopYearOptions {
  year: number;
  mediaType: MediaType;
  /** Identificadores de proveedor de TMDB ya resueltos para la región. */
  providerIds: readonly number[];
  limit?: number;
  /** Votos mínimos en TMDB para considerar un título. */
  minVotes?: number;
  /** Páginas de candidatos a examinar. Cada una son 20 títulos. */
  candidatePages?: number;
  /** Fuentes mínimas de las tres para entrar en la lista. */
  minSources?: number;
  /** Dejar fuera la animación (FR-059). */
  excludeAnimation?: boolean;
}

export interface TopYearResult {
  year: number;
  mediaType: MediaType;
  ranked: RankedTitle[];
  /** Títulos que llegaron a examinarse, antes de exigir notas. */
  considered: number;
  /** Descartados por no tener nota suficiente: se dice, no se esconde. */
  withoutEnoughSources: number;
  issues: string[];
}

const DEFAULT_MIN_VOTES = { movie: 300, series: 150 } as const;

export async function collectTopOfYear(
  deps: TopYearDeps,
  options: TopYearOptions,
): Promise<TopYearResult> {
  const issues: string[] = [];
  const pages = Math.max(1, options.candidatePages ?? 3);
  const minVotes = options.minVotes ?? DEFAULT_MIN_VOTES[options.mediaType];
  const width = deps.concurrency ?? DEFAULT_STAGE_CONCURRENCY;

  // --- Candidatos -----------------------------------------------------------
  const candidates: TmdbDiscoverResult[] = [];
  for (let page = 1; page <= pages; page += 1) {
    try {
      const result = await deps.tmdb.topRated({
        mediaType: options.mediaType,
        year: options.year,
        providerIds: options.providerIds,
        minVotes,
        // Por identificador y no por nombre: el catálogo llega traducido y
        // «Animación» dejaría de acertar con otro idioma (FR-059).
        ...(options.excludeAnimation ? { excludeGenreIds: [TMDB_ANIMATION_GENRE_ID] } : {}),
        page,
      });
      candidates.push(...result.results);
      if (page >= (result.total_pages ?? 1)) break;
    } catch (error) {
      issues.push(`No se pudo leer la página ${page} de candidatos: ${describeError(error)}`);
      break;
    }
  }

  const unique = [...new Map(candidates.map((entry) => [entry.id, entry])).values()];

  // --- Fichas ---------------------------------------------------------------
  const tick = progressCounter();
  const mapped = await mapWithConcurrency(unique, width, async (candidate) => {
    try {
      const details = await deps.tmdb.details(options.mediaType, candidate.id);
      return mapTitle({ mediaType: options.mediaType, details, now: deps.now() });
    } catch (error) {
      issues.push(`Ficha ${candidate.id}: ${describeError(error)}`);
      return null;
    } finally {
      deps.onProgress?.(tick(), unique.length, `fichas de ${options.year}`);
    }
  });

  const titles = mapped
    .filter((title): title is Title => title !== null)
    // Cinturón y tirantes: TMDB ya excluye por género, pero un título con el
    // género mal puesto en la fuente no puede colarse en una lista que el
    // usuario pidió sin animación.
    .filter((title) => !(options.excludeAnimation && isAnimation(title.genres)));

  // --- Notas de crítica -----------------------------------------------------
  if (deps.omdb) {
    const omdb = deps.omdb;
    const withImdb = titles.filter((title) => title.imdbId !== null);
    const rateTick = progressCounter();

    await mapWithConcurrency(withImdb, width, async (title) => {
      try {
        const fetched = await omdb.ratingsFor(title.imdbId as string, deps.now());
        title.ratings = mergeRatings(title.ratings, fetched);
      } catch (error) {
        issues.push(`Notas de «${title.title}»: ${describeError(error)}`);
      } finally {
        deps.onProgress?.(rateTick(), withImdb.length, `notas de ${options.year}`);
      }
    });
  } else {
    issues.push(
      'Sin clave de OMDb no hay notas de IMDb ni de Rotten Tomatoes: ' +
        'la media sería solo la de TMDB.',
    );
  }

  const ranked = rankTitles(titles, {
    ...(options.limit !== undefined ? { limit: options.limit } : {}),
    ...(options.minSources !== undefined ? { minSources: options.minSources } : {}),
  });

  return {
    year: options.year,
    mediaType: options.mediaType,
    ranked,
    considered: titles.length,
    withoutEnoughSources: titles.length - ranked.length,
    issues,
  };
}
