/** Ficha de detalle de un título (FR-032, FR-027). */

import type { RatingCriterion, TitleView } from '../../shared/types';
import {
  CONFIDENCE_LABEL,
  formatDate,
  formatDelta,
  formatRuntime,
  formatScore,
  formatSeasons,
  mediaLabel,
} from '../format';
import { PlatformBadges } from './PlatformBadge';
import { api } from '../api';
import { CriticBadges, CriticScore } from './Ratings';
import { RatingPanel } from './RatingPanel';
import { TrailerDetail } from './TrailerButton';

interface TitleDetailProps {
  view: TitleView;
  criteria: RatingCriterion[];
  onClose: () => void;
  onSaveScores: (scores: Record<string, number>, notes: string) => Promise<void>;
  onClearRating: () => Promise<void>;
  onToggleWatched: (watched: boolean) => Promise<void>;
  onToggleInterested: (interested: boolean) => Promise<void>;
}

export function TitleDetail({
  view,
  criteria,
  onClose,
  onSaveScores,
  onClearRating,
  onToggleWatched,
  onToggleInterested,
}: TitleDetailProps) {
  const { title, critic, personal, delta } = view;
  const duration = formatRuntime(title.runtimeMinutes) ?? formatSeasons(title.seasons);
  // Solo las plataformas que traen enlace: un botón que no lleva a ningún sitio
  // es peor que no tener botón (FR-049).
  const watchLinks = title.platforms.filter((platform) => Boolean(platform.link));

  return (
    <div
      className="overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <aside className="drawer" role="dialog" aria-label={`Ficha de ${title.title}`}>
        <div className="drawer__hero">
          {(title.backdropUrl ?? title.posterUrl) && (
            <img src={title.backdropUrl ?? title.posterUrl ?? ''} alt="" />
          )}
          <button type="button" className="drawer__close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="drawer__body">
          {title.sample && (
            <div className="banner banner--warn" style={{ margin: 0 }}>
              Título de ejemplo: no es un estreno real. Sirve para probar la aplicación y
              desaparecerá en cuanto llegue la primera recopilación.
            </div>
          )}

          <header>
            <h2 className="drawer__title">{title.title}</h2>
            {title.originalTitle !== title.title && (
              <p className="drawer__original">Título original: {title.originalTitle}</p>
            )}
          </header>

          <div className="ratings">
            <CriticScore critic={critic} showConfidence />
          </div>

          <div className="card__genres">
            {title.genres.map((genre) => (
              <span key={genre} className="genre-tag">
                {genre}
              </span>
            ))}
          </div>

          {title.overview ? (
            <p className="drawer__overview">{title.overview}</p>
          ) : (
            <p className="drawer__overview" style={{ fontStyle: 'italic' }}>
              La fuente no ofrece sinopsis en castellano para este título.
            </p>
          )}

          <section className="section">
            <h4 className="section__title">Tráiler en castellano</h4>
            <TrailerDetail title={title} />
          </section>

          <section className="section">
            <h4 className="section__title">Ficha</h4>
            <div className="detail-row">
              <span className="detail-row__label">Tipo</span>
              <span>{mediaLabel(title.mediaType)}</span>
            </div>
            <div className="detail-row">
              <span className="detail-row__label">Disponible desde</span>
              <span>{formatDate(title.availableFrom)}</span>
            </div>
            <div className="detail-row">
              <span className="detail-row__label">Semana de estreno</span>
              <span>{title.releaseWeek}</span>
            </div>
            {duration && (
              <div className="detail-row">
                <span className="detail-row__label">Duración</span>
                <span>{duration}</span>
              </div>
            )}
            {title.year && (
              <div className="detail-row">
                <span className="detail-row__label">Año</span>
                <span>{title.year}</span>
              </div>
            )}
            <div className="detail-row">
              <span className="detail-row__label">Plataformas</span>
              <span className="ratings">
                <PlatformBadges platforms={title.platforms} />
              </span>
            </div>
          </section>

          {(title.directors.length > 0 || title.cast.length > 0) && (
            <section className="section">
              <h4 className="section__title">Quién está detrás</h4>
              {title.directors.length > 0 && (
                <div className="detail-row">
                  <span className="detail-row__label">
                    {title.mediaType === 'series' ? 'Creación' : 'Dirección'}
                  </span>
                  <span>{title.directors.join(', ')}</span>
                </div>
              )}
              {title.cast.length > 0 && (
                <div className="detail-row">
                  <span className="detail-row__label">Reparto</span>
                  <span style={{ textAlign: 'right' }}>{title.cast.join(', ')}</span>
                </div>
              )}
            </section>
          )}

          {watchLinks.length > 0 && (
            <section className="section">
              <h4 className="section__title">Dónde verla</h4>
              <div className="trailer">
                {watchLinks.map((platform) => (
                  <button
                    key={platform.id}
                    type="button"
                    className="btn"
                    onClick={() => void api.shell.openExternal(platform.link!)}
                  >
                    Ver en {platform.name} ↗
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="section">
            <h4 className="section__title">Notas de la crítica</h4>
            <div className="detail-row">
              <span className="detail-row__label">IMDb</span>
              <span>
                {title.ratings.imdb === null
                  ? 'Sin datos'
                  : `${formatScore(title.ratings.imdb)} / 10${
                      title.ratings.imdbVotes
                        ? ` · ${title.ratings.imdbVotes.toLocaleString('es-ES')} votos`
                        : ''
                    }`}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-row__label">Rotten Tomatoes</span>
              <span>
                {title.ratings.rottenTomatoes === null
                  ? 'Sin datos'
                  : `${title.ratings.rottenTomatoes} % (crítica)`}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-row__label">Metacritic</span>
              <span>
                {title.ratings.metacritic === null ? 'Sin datos' : `${title.ratings.metacritic} / 100`}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-row__label">TMDB</span>
              <span>
                {title.ratings.tmdb === null ? 'Sin datos' : `${formatScore(title.ratings.tmdb)} / 10`}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-row__label">Índice agregado</span>
              <span>
                {critic.score === null
                  ? 'Sin datos'
                  : `${formatScore(critic.score)} / 10 · ${CONFIDENCE_LABEL[critic.confidence]}`}
              </span>
            </div>
            {personal?.score !== null && personal && delta !== null && (
              <div className="detail-row">
                <span className="detail-row__label">Tu nota frente a la crítica</span>
                <span style={{ color: delta >= 0 ? 'var(--positive)' : 'var(--negative)' }}>
                  {formatDelta(delta)}
                </span>
              </div>
            )}
            <div style={{ marginTop: 10 }}>
              <CriticBadges ratings={title.ratings} />
            </div>
          </section>

          <RatingPanel
            view={view}
            criteria={criteria}
            onSave={onSaveScores}
            onClear={onClearRating}
            onToggleWatched={onToggleWatched}
            onToggleInterested={onToggleInterested}
          />
        </div>
      </aside>
    </div>
  );
}
