/**
 * Formato de la clasificación en texto (FR-058).
 *
 * Una lista, la nota, y entre paréntesis **solo** la plataforma. Vive aparte
 * del cálculo para que se pueda probar la redacción sin tocar la red.
 */

import type { RankedTitle } from './ranking';

/** Nota con coma decimal, que es como se escribe en castellano. */
export function formatRankingScore(score: number): string {
  return score.toFixed(1).replace('.', ',');
}

/**
 * Una línea de la lista: «1. Título — 8,4 (Netflix, Filmin)».
 *
 * El asterisco marca las medias sacadas de menos de tres fuentes. No se explica
 * aquí sino al pie de la lista: meterlo en el paréntesis sería mezclarlo con la
 * plataforma, que es lo único que va ahí.
 */
export function formatRankingLine(entry: RankedTitle, position: number): string {
  const platforms = entry.title.platforms
    .map((platform) => platform.name)
    .join(', ');
  const score = entry.score.score === null ? '—' : formatRankingScore(entry.score.score);
  const partial = entry.score.sources < 3 ? ' *' : '';
  const where = platforms || 'sin plataforma';
  return `${position}. ${entry.title.title} — ${score}${partial} (${where})`;
}

export interface RankingListOptions {
  heading: string;
  entries: readonly RankedTitle[];
  /** Aviso al pie cuando alguna media no sale de las tres fuentes. */
  footnote?: boolean;
}

export function formatRankingList(options: RankingListOptions): string {
  const lines = [options.heading, ''];

  if (options.entries.length === 0) {
    lines.push('  (ningún título reúne notas suficientes)');
    return lines.join('\n');
  }

  options.entries.forEach((entry, index) => {
    lines.push(formatRankingLine(entry, index + 1));
  });

  if (options.footnote !== false && options.entries.some((entry) => entry.score.sources < 3)) {
    lines.push('');
    lines.push('* Media de dos fuentes: a este título le falta una de las tres.');
  }

  return lines.join('\n');
}
