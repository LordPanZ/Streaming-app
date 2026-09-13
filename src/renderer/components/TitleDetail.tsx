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
import { platformLink, type PlatformLink } from '../../core/domain/platform-links';
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
  /*
    TMDB da **un solo** enlace por región —una página suya que lista dónde ver
    el título— y lo repite en todas las plataformas. Hasta ahora se pintaba un
    botón «Ver en Netflix» por plataforma, y todos llevaban al mismo sitio, que
    además no era Netflix. Ahora se enseña una vez y con su nombre (FR-049).
  */
  const tmdbWatchUrl = title.platforms.find((platform) => platform.link)?.link ?? null;

  // Un enlace por plataforma, diciendo lo que cada uno hace de verdad (FR-056).
  const platformLinks = title.platforms
    .map((platform) => ({ platform, link: platformLink(platform.id, platform.name, title.title) }))
    .filter((entry): entry is { platform: typeof entry.platform; link: PlatformLink } =>
      entry.link !== null,
    );

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

          {(platformLinks.length > 0 || tmdbWatchUrl) && (
            <section className="section">
              <h4 className="section__title">Dónde verla</h4>
              <div className="trailer">
                {platformLinks.map(({ platform, link }) => (
                  <button
                    key={platform.id}
                    type="button"
                    className="btn"
                    onClick={() => void api.shell.openExternal(link.url)}
                    title={
                      link.kind === 'search'
                        ? `Abre la búsqueda de ${platform.name} con «${title.title}»`
                        : `Abre ${platform.name}; su buscador no admite el término en la dirección`
                    }
                  >
                    {link.kind === 'search' ? '🔎 ' : ''}
                    {link.label} ↗
                  </button>
                ))}
                {tmdbWatchUrl && (
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => void api.shell.openExternal(tmdbWatchUrl)}
                    title="Página de TMDB con todas las formas de verla en España"
                  >
                    Ver opciones en TMDB ↗
                  </button>
                )}
              </div>
              <p className="field__hint" style={{ marginTop: 8 }}>
                Las plataformas no publican la dirección exacta de cada título, así que estos
                botones abren su buscador con el nombre ya escrito. Es un clic más, pero no te
                deja en una página que no existe.
              </p>
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
