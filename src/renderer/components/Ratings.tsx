/**
 * Presentación de notas (FR-013, FR-014, FR-015).
 *
 * Regla que gobierna estos componentes: una nota ausente se dice, no se
 * disimula. Nunca se pinta un cero ni una barra vacía en lugar de "sin datos".
 */

import type { AggregateCritic, CriticRatings, PersonalScore } from '../../shared/types';
import { CONFIDENCE_LABEL, formatScore } from '../format';

interface BadgeProps {
  source: 'imdb' | 'tomato' | 'meta' | 'tmdb';
  label: string;
  value: number | null;
  suffix?: string;
}

function Badge({ source, label, value, suffix = '' }: BadgeProps) {
  if (value === null) return null;
  return (
    <span className={`rating-badge rating-badge--${source}`} title={`${label}: ${value}${suffix}`}>
      <span className="rating-badge__source">{label}</span>
      {String(value).replace('.', ',')}
      {suffix}
    </span>
  );
}

/** Fila de notas por fuente. Si no hay ninguna, lo dice explícitamente. */
export function CriticBadges({ ratings }: { ratings: CriticRatings }) {
  const hasAny =
    ratings.imdb !== null ||
    ratings.rottenTomatoes !== null ||
    ratings.metacritic !== null ||
    ratings.tmdb !== null;

  if (!hasAny) {
    return <span className="rating-badge rating-badge--none">Sin notas de crítica</span>;
  }

  return (
    <span className="ratings">
      <Badge source="imdb" label="IMDb" value={ratings.imdb} />
      <Badge source="tomato" label="RT" value={ratings.rottenTomatoes} suffix="%" />
      <Badge source="meta" label="MC" value={ratings.metacritic} />
      <Badge source="tmdb" label="TMDB" value={ratings.tmdb} />
    </span>
  );
}

/** Índice agregado con su confianza, que se muestra siempre junto al número. */
export function CriticScore({ critic, showConfidence = false }: {
  critic: AggregateCritic;
  showConfidence?: boolean;
}) {
  if (critic.score === null) {
    return <span className="score-pill score-pill--empty">Sin datos</span>;
  }
  return (
    <span title={CONFIDENCE_LABEL[critic.confidence]}>
      <span className="score-pill">
        {formatScore(critic.score)}
        <small>/10</small>
      </span>
      {showConfidence && (
        <span className="confidence" style={{ marginLeft: 7 }}>
          {CONFIDENCE_LABEL[critic.confidence]}
        </span>
      )}
    </span>
  );
}

/** Nota personal. Distingue "no valorada" de "valorada con un 0". */
export function PersonalScoreBadge({ personal }: { personal: PersonalScore | null }) {
  if (!personal || personal.score === null) {
    return <span className="score-pill score-pill--empty">Sin valorar</span>;
  }
  return (
    <span
      className="score-pill score-pill--personal"
      title={`${personal.scoredCriteria} de ${personal.totalCriteria} criterios puntuados`}
    >
      {formatScore(personal.score)}
      <small>/10</small>
    </span>
  );
}
