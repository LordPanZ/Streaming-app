/** Vista «Mis vistas» con estadísticas (FR-033). */

import { formatScore, pluralize } from '../format';
import { useStats } from '../hooks/useStats';
import { Banner, EmptyState } from '../components/EmptyState';

export function Watched({
  onGoToWeek,
  onGoToInterested,
}: {
  onGoToWeek: () => void;
  onGoToInterested: () => void;
}) {
  const { stats, error } = useStats();

  if (error) return <Banner tone="error">{error}</Banner>;
  if (!stats) return <EmptyState icon="⏳" title="Cargando…" text="Calculando tus estadísticas." />;

  /*
    La lista de pendientes vive aquí aunque la vista se llame «Mis vistas»:
    es la sección de lo personal, y es donde se busca «lo que tenía apuntado»
    (FR-054). El filtro del catálogo sigue siendo el mismo, solo se llega antes.
  */
  const pendingBanner = stats.totalInterested > 0 && (
    <Banner tone="info" actionLabel="Ver mi lista" onAction={onGoToInterested}>
      Tienes {pluralize(stats.totalInterested, 'título apuntado', 'títulos apuntados')} como «me
      interesa» y todavía sin ver.
    </Banner>
  );

  if (stats.totalWatched === 0) {
    return (
      <>
        <h1 className="page-title">Mis vistas</h1>
        {pendingBanner}
        <EmptyState
          icon="📼"
          title="Aún no has marcado nada como visto"
          text="Marca una película o serie como vista desde su tarjeta o su ficha, y aquí aparecerán tus estadísticas y tus notas."
          actionLabel="Ver los estrenos de la semana"
          onAction={onGoToWeek}
        />
      </>
    );
  }

  const maxGenre = Math.max(...stats.byGenre.map((genre) => genre.watched), 1);
  const maxPlatform = Math.max(...stats.byPlatform.map((platform) => platform.watched), 1);

  return (
    <>
      <h1 className="page-title">Mis vistas</h1>
      <p className="page-subtitle">
        {pluralize(stats.totalWatched, 'título visto', 'títulos vistos')} ·{' '}
        {pluralize(stats.totalRated, 'valorado', 'valorados')}
      </p>

      {pendingBanner}

      <div className="stats-grid">
        <div className="stat">
          <div className="stat__value">{stats.totalWatched}</div>
          <div className="stat__label">Títulos vistos</div>
        </div>
        <div className="stat">
          <div className="stat__value">{stats.totalRated}</div>
          <div className="stat__label">Valorados con criterios</div>
        </div>
        <div className="stat">
          <div className="stat__value">{formatScore(stats.averagePersonal)}</div>
          <div className="stat__label">Tu nota media</div>
        </div>
        <div className="stat">
          <div className="stat__value">{formatScore(stats.averageCritic)}</div>
          <div className="stat__label">Media de la crítica</div>
        </div>
      </div>

      {stats.topRated.length > 0 && (
        <section className="section" style={{ marginBottom: 18 }}>
          <h4 className="section__title">Tus mejor valoradas</h4>
          {stats.topRated.map((entry) => (
            <div className="detail-row" key={entry.titleId}>
              <span>{entry.title}</span>
              <span className="score-pill score-pill--personal">
                {formatScore(entry.score)}
                <small>/10</small>
              </span>
            </div>
          ))}
        </section>
      )}

      <section className="section" style={{ marginBottom: 18 }}>
        <h4 className="section__title">Por género</h4>
        {stats.byGenre.slice(0, 12).map((genre) => (
          <div className="bar-row" key={genre.genre}>
            <span>{genre.genre}</span>
            <span className="bar-track">
              <span
                className="bar-fill"
                style={{ width: `${(genre.watched / maxGenre) * 100}%` }}
              />
            </span>
            <span className="bar-value">
              {genre.watched}
              {genre.averagePersonal !== null && ` · ${formatScore(genre.averagePersonal)}`}
            </span>
          </div>
        ))}
      </section>

      <section className="section">
        <h4 className="section__title">Por plataforma</h4>
        {stats.byPlatform.map((platform) => (
          <div className="bar-row" key={platform.platform}>
            <span>{platform.name}</span>
            <span className="bar-track">
              <span
                className="bar-fill"
                style={{ width: `${(platform.watched / maxPlatform) * 100}%` }}
              />
            </span>
            <span className="bar-value">{platform.watched}</span>
          </div>
        ))}
      </section>
    </>
  );
}
