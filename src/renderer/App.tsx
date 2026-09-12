/**
 * Raíz de la interfaz: navegación, cabecera con búsqueda y barra del agente
 * (FR-003, FR-028, FR-031, FR-034, FR-042).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CatalogQuery, TitleView } from '../shared/types';
import { api, describeApiError, unwrap } from './api';
import { formatDateTime, STAGE_LABEL } from './format';
import { useAgent } from './hooks/useAgent';
import { useCatalog } from './hooks/useCatalog';
import { useSettings } from './hooks/useSettings';
import { Banner } from './components/EmptyState';
import { TitleDetail } from './components/TitleDetail';
import { Browse } from './views/Browse';
import { Onboarding } from './views/Onboarding';
import { Runs } from './views/Runs';
import { SettingsView } from './views/SettingsView';
import { Watched } from './views/Watched';

type ViewName = 'week' | 'catalog' | 'watched' | 'runs' | 'settings';

const WEEK_QUERY: CatalogQuery = { week: 'current', sort: 'date', order: 'desc', limit: 60 };
const CATALOG_QUERY: CatalogQuery = { week: 'all', sort: 'date', order: 'desc', limit: 60 };

const NAV: Array<{ id: ViewName; label: string; icon: string }> = [
  { id: 'week', label: 'Esta semana', icon: '📅' },
  { id: 'catalog', label: 'Catálogo', icon: '🎞️' },
  { id: 'watched', label: 'Mis vistas', icon: '✓' },
  { id: 'runs', label: 'Ejecuciones', icon: '📋' },
  { id: 'settings', label: 'Ajustes', icon: '⚙️' },
];

export function App() {
  const [view, setView] = useState<ViewName>('week');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<TitleView | null>(null);
  const [searchDraft, setSearchDraft] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [skippedOnboarding, setSkippedOnboarding] = useState(false);

  const catalog = useCatalog(WEEK_QUERY);
  const settings = useSettings();
  const agent = useAgent();

  const hasKeys = agent.status?.hasKeys ?? false;

  /**
   * El primer arranque se enseña mientras no haya ni clave ni catálogo (FR-050).
   * En cuanto exista cualquiera de las dos cosas —o el usuario decida saltarlo—
   * deja de aparecer y no vuelve a molestar.
   */
  const needsOnboarding =
    !skippedOnboarding &&
    !hasKeys &&
    catalog.facets !== null &&
    catalog.facets.totalTitles === 0 &&
    agent.status !== null;

  const loadSamples = useCallback(async () => {
    try {
      await unwrap(api.data.loadSamples());
      setSkippedOnboarding(true);
      await catalog.reload();
    } catch (caught) {
      setActionError(describeApiError(caught));
    }
  }, [catalog]);

  // Cambiar entre «Esta semana» y «Catálogo» solo cambia el filtro de semana:
  // los demás filtros que haya puesto el usuario se respetan.
  const goTo = useCallback(
    (next: ViewName) => {
      setView(next);
      if (next === 'week') catalog.patchQuery({ week: WEEK_QUERY.week });
      if (next === 'catalog') catalog.patchQuery({ week: CATALOG_QUERY.week });
    },
    [catalog],
  );

  // La búsqueda se aplica con retardo para no consultar en cada tecla (FR-031).
  useEffect(() => {
    const timer = setTimeout(() => catalog.patchQuery({ text: searchDraft }), 220);
    return () => clearTimeout(timer);
  }, [searchDraft, catalog.patchQuery]);

  const loadSelected = useCallback(async (id: string) => {
    try {
      setSelected(await unwrap(api.catalog.get(id)));
      setActionError(null);
    } catch (caught) {
      setActionError(describeApiError(caught));
    }
  }, []);

  useEffect(() => {
    if (selectedId) void loadSelected(selectedId);
    else setSelected(null);
  }, [selectedId, loadSelected]);

  // Escape cierra la ficha, que es lo que espera cualquiera.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedId(null);
    };
    globalThis.addEventListener('keydown', onKeyDown);
    return () => globalThis.removeEventListener('keydown', onKeyDown);
  }, []);

  const toggleWatched = useCallback(
    async (id: string, watched: boolean) => {
      try {
        await unwrap(api.ratings.setWatched({ titleId: id, watched }));
        if (selectedId === id) await loadSelected(id);
        setActionError(null);
      } catch (caught) {
        setActionError(describeApiError(caught));
      }
    },
    [selectedId, loadSelected],
  );

  const toggleInterested = useCallback(
    async (id: string, interested: boolean) => {
      try {
        await unwrap(api.ratings.setInterested({ titleId: id, interested }));
        if (selectedId === id) await loadSelected(id);
        setActionError(null);
      } catch (caught) {
        setActionError(describeApiError(caught));
      }
    },
    [selectedId, loadSelected],
  );

  const saveScores = useCallback(
    async (scores: Record<string, number>, notes: string) => {
      if (!selectedId) return;
      try {
        await unwrap(api.ratings.setScores({ titleId: selectedId, scores, notes }));
        await loadSelected(selectedId);
        setActionError(null);
      } catch (caught) {
        setActionError(describeApiError(caught));
      }
    },
    [selectedId, loadSelected],
  );

  const clearRating = useCallback(async () => {
    if (!selectedId) return;
    try {
      await unwrap(api.ratings.clear(selectedId));
      await loadSelected(selectedId);
    } catch (caught) {
      setActionError(describeApiError(caught));
    }
  }, [selectedId, loadSelected]);

  const watchedCount = useMemo(
    () => catalog.page.items.filter((item) => item.rating?.watched).length,
    [catalog.page.items],
  );

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="sidebar__brand sidebar__desktop-only">
          <span className="sidebar__logo" aria-hidden="true">
            🍿
          </span>
          Estrenos ES
        </div>

        {NAV.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`nav-item${view === entry.id ? ' nav-item--active' : ''}`}
            onClick={() => goTo(entry.id)}
          >
            <span aria-hidden="true">{entry.icon}</span>
            {entry.label}
            {entry.id === 'catalog' && catalog.facets && (
              <span className="nav-item__count">{catalog.facets.totalTitles}</span>
            )}
            {entry.id === 'week' && view === 'week' && watchedCount > 0 && (
              <span className="nav-item__count">{watchedCount} ✓</span>
            )}
          </button>
        ))}

        <div className="sidebar__section sidebar__desktop-only">Agente</div>
        <div className="sidebar__agent sidebar__desktop-only">
          <div>Última: {formatDateTime(agent.status?.lastRunAt)}</div>
          <div>Próxima: {formatDateTime(agent.status?.nextRunAt)}</div>
        </div>
      </nav>

      <div className="main">
        <header className="header">
          <div className="search">
            <svg
              className="search__icon"
              viewBox="0 0 16 16"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              aria-hidden="true"
            >
              <circle cx="7" cy="7" r="4.5" />
              <path d="M10.5 10.5 14 14" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              value={searchDraft}
              placeholder="Título, género, plataforma, actor…"
              onChange={(event) => setSearchDraft(event.target.value)}
              aria-label="Buscar por título, género, plataforma, reparto o dirección"
            />
          </div>

          <div className="filters__spacer" />

          <div className="agent-bar">
            {agent.running && agent.progress && (
              <>
                <span className="spinner" aria-hidden="true" />
                <span>
                  {STAGE_LABEL[agent.progress.stage]} · {agent.progress.done}/
                  {agent.progress.total}
                </span>
                <span className="progress">
                  <span
                    className="progress__fill"
                    style={{
                      width: `${
                        agent.progress.total > 0
                          ? Math.round((agent.progress.done / agent.progress.total) * 100)
                          : 0
                      }%`,
                    }}
                  />
                </span>
              </>
            )}
            {agent.running && !agent.progress && (
              <>
                <span className="spinner" aria-hidden="true" />
                <span>Preparando…</span>
              </>
            )}
          </div>

          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void agent.run()}
            disabled={agent.running || !hasKeys}
            title={hasKeys ? 'Recopilar los estrenos ahora' : 'Configura tu clave de TMDB en Ajustes'}
          >
            {agent.running ? 'Recopilando…' : 'Actualizar ahora'}
          </button>
        </header>

        <main className="content">
          {actionError && <Banner tone="error">{actionError}</Banner>}
          {agent.error && <Banner tone="error">{agent.error}</Banner>}
          {agent.running && agent.runs.length === 0 && (
            <Banner tone="info">
              La primera recopilación es la más larga: consulta todas las plataformas activas y
              pide una ficha por título, así que puede tardar unos minutos. Déjala terminar sin
              cerrar la aplicación; en el móvil, además, sin salirte a otra aplicación. Las
              siguientes son mucho más cortas, porque solo miran lo nuevo.
            </Banner>
          )}
          {agent.lastSummary && !agent.running && (
            <Banner tone={agent.lastSummary.status === 'failed' ? 'error' : 'info'}>
              Recopilación {agent.lastSummary.status === 'success' ? 'correcta' : agent.lastSummary.status === 'partial' ? 'con incidencias' : 'fallida'}:{' '}
              {agent.lastSummary.counts.created} títulos nuevos y{' '}
              {agent.lastSummary.counts.updated} actualizados
              {agent.lastSummary.issueCount > 0 && `, ${agent.lastSummary.issueCount} incidencias`}.
            </Banner>
          )}

          {needsOnboarding && view === 'week' ? (
            <Onboarding
              onReady={async () => {
                await agent.refresh();
                await settings.reload();
                setSkippedOnboarding(true);
                void agent.run();
              }}
              onLoadSamples={loadSamples}
              onSkip={() => setSkippedOnboarding(true)}
            />
          ) : null}

          {!needsOnboarding && (view === 'week' || view === 'catalog') && (
            <Browse
              mode={view}
              query={catalog.query}
              page={catalog.page}
              facets={catalog.facets}
              loading={catalog.loading}
              error={catalog.error}
              hasKeys={hasKeys}
              onQueryChange={catalog.patchQuery}
              onReset={() => {
                setSearchDraft('');
                catalog.setQuery(view === 'week' ? WEEK_QUERY : CATALOG_QUERY);
              }}
              onOpen={setSelectedId}
              onToggleWatched={(id, watched) => void toggleWatched(id, watched)}
              onToggleInterested={(id, interested) => void toggleInterested(id, interested)}
              onGoToSettings={() => goTo('settings')}
              onRunAgent={() => void agent.run()}
            />
          )}

          {view === 'watched' && (
            <Watched
              onGoToWeek={() => goTo('week')}
              onGoToInterested={() => {
                goTo('catalog');
                catalog.patchQuery({ week: 'all', status: 'interested' });
              }}
            />
          )}

          {view === 'runs' && <Runs runs={agent.runs} />}

          {view === 'settings' && (
            <SettingsView
              settings={settings.settings}
              secrets={settings.secrets}
              onUpdate={async (patch) => {
                await settings.update(patch);
                await agent.refresh();
                await catalog.reload();
              }}
              onSaveSecrets={async (values) => {
                await settings.saveSecrets(values);
                await agent.refresh();
              }}
              onReload={async () => {
                await settings.reload();
                await catalog.reload();
                await agent.refresh();
              }}
            />
          )}
        </main>
      </div>

      {selected && settings.settings && (
        <TitleDetail
          view={selected}
          criteria={settings.settings.criteria}
          onClose={() => setSelectedId(null)}
          onSaveScores={saveScores}
          onClearRating={clearRating}
          onToggleWatched={(watched) => toggleWatched(selected.title.id, watched)}
          onToggleInterested={(interested) => toggleInterested(selected.title.id, interested)}
        />
      )}
    </div>
  );
}
