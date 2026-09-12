/** Vista principal: estrenos de la semana y catálogo completo (FR-028 a FR-031). */

import type { CatalogFacets, CatalogPage, CatalogQuery } from '../../shared/types';
import { formatWeekLabel } from '../../core/domain/weeks';
import { FilterBar } from '../components/FilterBar';
import { TitleCard } from '../components/TitleCard';
import { Banner, EmptyState } from '../components/EmptyState';

interface BrowseProps {
  mode: 'week' | 'catalog';
  query: CatalogQuery;
  page: CatalogPage;
  facets: CatalogFacets | null;
  loading: boolean;
  error: string | null;
  hasKeys: boolean;
  onQueryChange: (patch: Partial<CatalogQuery>) => void;
  onReset: () => void;
  onOpen: (id: string) => void;
  onToggleWatched: (id: string, watched: boolean) => void;
  onToggleInterested: (id: string, interested: boolean) => void;
  onGoToSettings: () => void;
  onRunAgent: () => void;
}

export function Browse(props: BrowseProps) {
  const {
    mode,
    query,
    page,
    facets,
    loading,
    error,
    hasKeys,
    onQueryChange,
    onReset,
    onOpen,
    onToggleWatched,
    onToggleInterested,
    onGoToSettings,
    onRunAgent,
  } = props;

  const currentWeek = facets?.currentWeek;
  const isEmptyCatalog = (facets?.totalTitles ?? 0) === 0;

  return (
    <>
      <h1 className="page-title">
        {mode === 'week' ? 'Estrenos de esta semana' : 'Catálogo completo'}
      </h1>
      <p className="page-subtitle">
        {mode === 'week' && currentWeek
          ? `Semana ${currentWeek} · ${formatWeekLabel(currentWeek)}`
          : 'Todo lo que ha recopilado el agente hasta ahora.'}
      </p>

      {error && <Banner tone="error">{error}</Banner>}

      {!hasKeys && (
        <Banner tone="warn" actionLabel="Ir a Ajustes" onAction={onGoToSettings}>
          Falta la clave de API de TMDB. Puedes navegar por la aplicación, pero la recopilación
          semanal está desactivada.
        </Banner>
      )}

      {/*
        El listón de calidad esconde títulos que sí están guardados (FR-053).
        Decirlo aquí evita la pregunta «¿por qué salen tan pocos?», y el botón
        deja verlos sin tener que ir a Ajustes a desactivar nada.
      */}
      {(facets?.belowFloor ?? 0) > 0 && query.minCritic === undefined && (
        <Banner tone="info" actionLabel="Ver también esos" onAction={() => onQueryChange({ minCritic: 0 })}>
          {facets?.belowFloor === 1
            ? '1 título recopilado no llega a tu nota mínima y no se está mostrando.'
            : `${facets?.belowFloor} títulos recopilados no llegan a tu nota mínima y no se están mostrando.`}
        </Banner>
      )}

      <FilterBar
        query={query}
        facets={facets}
        total={page.total}
        onChange={onQueryChange}
        onReset={onReset}
      />

      {loading && page.items.length === 0 ? (
        <EmptyState icon="⏳" title="Cargando…" text="Consultando el catálogo local." />
      ) : page.items.length === 0 ? (
        isEmptyCatalog ? (
          <EmptyState
            icon="🍿"
            title="Todavía no hay nada recopilado"
            text={
              hasKeys
                ? 'Lanza la primera recopilación para traer los estrenos de la semana en las plataformas que tengas activadas.'
                : 'Configura tu clave de TMDB en Ajustes y después lanza la primera recopilación.'
            }
            actionLabel={hasKeys ? 'Recopilar ahora' : 'Ir a Ajustes'}
            onAction={hasKeys ? onRunAgent : onGoToSettings}
          />
        ) : (
          <EmptyState
            icon="🔍"
            title="Ningún título coincide"
            text="Prueba a ampliar la semana, quitar la nota mínima o limpiar los filtros."
            actionLabel="Limpiar filtros"
            onAction={onReset}
          />
        )
      ) : (
        <div className="grid">
          {page.items.map((view) => (
            <TitleCard
              key={view.title.id}
              view={view}
              onOpen={onOpen}
              onToggleWatched={onToggleWatched}
              onToggleInterested={onToggleInterested}
            />
          ))}
        </div>
      )}

      {page.total > page.items.length + page.offset && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24 }}>
          <button
            type="button"
            className="btn"
            onClick={() => onQueryChange({ limit: Math.min(200, (query.limit ?? 60) + 60) })}
          >
            Mostrar más ({page.total - page.items.length} restantes)
          </button>
        </div>
      )}
    </>
  );
}
