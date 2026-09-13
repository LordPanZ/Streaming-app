/**
 * Clasificación por la media simple de IMDb, Rotten Tomatoes y TMDB (FR-058).
 *
 * **No** es el índice de crítica del catálogo (`aggregateCritic`), y la
 * diferencia es deliberada: aquel pondera cuatro fuentes —IMDb 35 %, Rotten
 * Tomatoes 30 %, Metacritic 20 %, TMDB 15 %— porque responde a «¿qué fiabilidad
 * tiene esta nota?». Esto responde a otra pregunta, «la media de estas tres», y
 * por tanto las trata por igual y deja Metacritic fuera.
 *
 * Tener dos números parecidos con nombres distintos sería una trampa, así que
 * la interfaz y la salida nombran siempre cuál están enseñando.
 */

import type { Title } from '../../shared/types';
import { normalizeCriticValue } from './scoring';

/** Las tres fuentes de esta media, y solo esas. */
export const RANKING_SOURCES = ['imdb', 'rottenTomatoes', 'tmdb'] as const;
export type RankingSource = (typeof RANKING_SOURCES)[number];

export interface RankedScore {
  /** Media 0–10 de las fuentes presentes, o `null` si no hay ninguna. */
  score: number | null;
  /** Cuántas de las tres aportaron nota. Va en la salida: no todas las tienen. */
  sources: number;
  /** Qué fuentes concretas, para poder explicar un empate. */
  present: RankingSource[];
}

/**
 * Media de las notas disponibles entre las tres fuentes.
 *
 * Lo ausente no cuenta como cero (Art. IV.2): un título sin nota de Rotten
 * Tomatoes no es un título con un cero en Rotten Tomatoes. Se promedia sobre
 * las que hay y se dice cuántas eran.
 */
export function rankingScore(title: Title): RankedScore {
  const values: Array<{ source: RankingSource; normalized: number }> = [];

  for (const source of RANKING_SOURCES) {
    const raw = title.ratings[source];
    if (raw === null || raw === undefined || !Number.isFinite(raw)) continue;
    values.push({ source, normalized: normalizeCriticValue(source, raw) });
  }

  if (values.length === 0) return { score: null, sources: 0, present: [] };

  const total = values.reduce((sum, entry) => sum + entry.normalized, 0);
  return {
    score: Math.round((total / values.length) * 10) / 10,
    sources: values.length,
    present: values.map((entry) => entry.source),
  };
}

export interface RankedTitle {
  title: Title;
  score: RankedScore;
}

export interface RankOptions {
  /** Cuántos devolver. */
  limit?: number;
  /**
   * Fuentes mínimas para entrar en la lista. Por defecto 2.
   *
   * Con una sola fuente la media no es una media, y en la práctica suele ser
   * solo la de TMDB, que es la más generosa: sin este mínimo la lista se llena
   * de títulos que nadie más ha puntuado.
   */
  minSources?: number;
}

/**
 * Ordena de mejor a peor. Los empates se rompen por número de fuentes —una
 * media de tres notas vale más que la misma media sacada de dos— y después
 * alfabéticamente, para que dos ejecuciones den el mismo orden (Art. VII).
 */
export function rankTitles(
  titles: readonly Title[],
  options: RankOptions = {},
): RankedTitle[] {
  const limit = Math.max(1, options.limit ?? 10);
  const minSources = Math.max(1, options.minSources ?? 2);

  return titles
    .map((title) => ({ title, score: rankingScore(title) }))
    .filter((entry) => entry.score.score !== null && entry.score.sources >= minSources)
    .sort(
      (a, b) =>
        (b.score.score ?? 0) - (a.score.score ?? 0) ||
        b.score.sources - a.score.sources ||
        a.title.title.localeCompare(b.title.title, 'es'),
    )
    .slice(0, limit);
}
