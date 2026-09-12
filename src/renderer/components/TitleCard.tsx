/**
 * Tarjeta de un título en la rejilla (FR-012, FR-013, FR-016, FR-020, FR-021).
 *
 * Cabe lo que se mira de un vistazo: carátula, título, plataformas, géneros,
 * notas y acceso directo al tráiler. Lo demás vive en la ficha de detalle.
 */

import type { TitleView } from '../../shared/types';
import { mediaLabel } from '../format';
import { CriticBadges, CriticScore, PersonalScoreBadge } from './Ratings';
import { PlatformBadges } from './PlatformBadge';
import { TrailerButton } from './TrailerButton';

interface TitleCardProps {
  view: TitleView;
  onOpen: (id: string) => void;
  onToggleWatched: (id: string, watched: boolean) => void;
  onToggleInterested: (id: string, interested: boolean) => void;
}

export function TitleCard({
  view,
  onOpen,
  onToggleWatched,
  onToggleInterested,
}: TitleCardProps) {
  const { title, critic, rating, personal } = view;
  const watched = rating?.watched === true;
  const interested = rating?.interested === true;

  return (
    <article className="card">
      <div
        className="card__poster"
        onClick={() => onOpen(title.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onOpen(title.id);
          }
        }}
        aria-label={`Abrir la ficha de ${title.title}`}
      >
        {title.posterUrl ? (
          <img src={title.posterUrl} alt="" loading="lazy" />
        ) : (
          <div className="card__poster-empty" aria-hidden="true">
            {title.mediaType === 'movie' ? '🎬' : '📺'}
          </div>
        )}
        <span className="card__type">{mediaLabel(title.mediaType)}</span>
        {title.sample && (
          <span className="card__sample" title="Título de ejemplo, no es un estreno real">
            Ejemplo
          </span>
        )}
        {watched && (
          <span className="card__watched" title="Visto">
            ✓
          </span>
        )}
        {!watched && interested && (
          <span className="card__interested" title="En mi lista de pendientes">
            ★
          </span>
        )}
      </div>

      <div className="card__body">
        <div className="card__title" title={title.title}>
          {title.title}
        </div>

        <div className="card__meta">
          {[title.year, title.availableFrom.slice(8, 10) + '/' + title.availableFrom.slice(5, 7)]
            .filter(Boolean)
            .join(' · ')}
        </div>

        <div className="card__genres">
          {title.genres.slice(0, 3).map((genre) => (
            <span key={genre} className="genre-tag">
              {genre}
            </span>
          ))}
        </div>

        <div className="ratings">
          <CriticScore critic={critic} />
          {personal?.score !== null && personal !== null && (
            <PersonalScoreBadge personal={personal} />
          )}
        </div>

        <CriticBadges ratings={title.ratings} />

        <div className="card__footer">
          <PlatformBadges platforms={title.platforms.slice(0, 2)} />
          {title.platforms.length > 2 && (
            <span className="chip">+{title.platforms.length - 2}</span>
          )}
        </div>

        <div className="card__footer">
          <TrailerButton title={title} compact />
          {/*
            El botón de interés desaparece en lo ya visto: una lista de
            pendientes no admite algo que ya se ha visto (FR-054).
          */}
          {!watched && (
            <button
              type="button"
              className={`btn btn--sm${interested ? '' : ' btn--ghost'}`}
              aria-pressed={interested}
              onClick={() => onToggleInterested(title.id, !interested)}
              title={interested ? 'Quitar de mi lista' : 'Añadir a mi lista de pendientes'}
            >
              {interested ? '★ Me interesa' : '☆ Me interesa'}
            </button>
          )}
          <button
            type="button"
            className={`btn btn--sm${watched ? '' : ' btn--ghost'}`}
            aria-pressed={watched}
            onClick={() => onToggleWatched(title.id, !watched)}
            title={watched ? 'Marcar como pendiente' : 'Marcar como vista'}
          >
            {watched ? '✓ Vista' : 'Marcar vista'}
          </button>
        </div>
      </div>
    </article>
  );
}
