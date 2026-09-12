/** Barra de filtros y ordenación (FR-029, FR-030). */

import type { CatalogFacets, CatalogQuery } from '../../shared/types';
import { formatWeekLabel } from '../../core/domain/weeks';

interface FilterBarProps {
  query: CatalogQuery;
  facets: CatalogFacets | null;
  total: number;
  onChange: (patch: Partial<CatalogQuery>) => void;
  onReset: () => void;
}

const MIN_CRITIC_OPTIONS = [0, 5, 6, 7, 8];

export function FilterBar({ query, facets, total, onChange, onReset }: FilterBarProps) {
  const hasFilters =
    Boolean(query.text) ||
    (query.mediaType && query.mediaType !== 'all') ||
    (query.platforms?.length ?? 0) > 0 ||
    (query.genres?.length ?? 0) > 0 ||
    (query.minCritic ?? 0) > 0 ||
    (query.status && query.status !== 'all');

  return (
    <div className="filters">
      <select
        className="select"
        value={query.week ?? 'current'}
        onChange={(event) => onChange({ week: event.target.value })}
        aria-label="Semana"
      >
        <option value="current">Esta semana</option>
        <option value="all">Todas las semanas</option>
        {facets?.weeks.map((week) => (
          <option key={week.value} value={week.value}>
            {formatWeekLabel(week.value)} ({week.count})
          </option>
        ))}
      </select>

      <select
        className="select"
        value={query.mediaType ?? 'all'}
        onChange={(event) => onChange({ mediaType: event.target.value as CatalogQuery['mediaType'] })}
        aria-label="Tipo"
      >
        <option value="all">Películas y series</option>
        <option value="movie">Solo películas</option>
        <option value="series">Solo series</option>
      </select>

      <select
        className="select"
        value={query.platforms?.[0] ?? ''}
        onChange={(event) =>
          onChange({ platforms: event.target.value ? [event.target.value] : [] })
        }
        aria-label="Plataforma"
      >
        <option value="">Todas las plataformas</option>
        {facets?.platforms.map((platform) => (
          <option key={platform.value} value={platform.value}>
            {platform.name} ({platform.count})
          </option>
        ))}
      </select>

      <select
        className="select"
        value={query.genres?.[0] ?? ''}
        onChange={(event) => onChange({ genres: event.target.value ? [event.target.value] : [] })}
        aria-label="Género"
      >
        <option value="">Todos los géneros</option>
        {facets?.genres.map((genre) => (
          <option key={genre.value} value={genre.value}>
            {genre.value} ({genre.count})
          </option>
        ))}
      </select>

      <select
        className="select"
        value={String(query.minCritic ?? 0)}
        onChange={(event) => onChange({ minCritic: Number(event.target.value) })}
        aria-label="Nota mínima"
      >
        {MIN_CRITIC_OPTIONS.map((value) => (
          <option key={value} value={value}>
            {value === 0 ? 'Cualquier nota' : `Nota ${value}+`}
          </option>
        ))}
      </select>

      <select
        className="select"
        value={query.status ?? 'all'}
        onChange={(event) => onChange({ status: event.target.value as CatalogQuery['status'] })}
        aria-label="Estado"
      >
        <option value="all">Vistas y pendientes</option>
        <option value="interested">★ Solo las que me interesan</option>
        <option value="pending">Solo pendientes</option>
        <option value="watched">Solo vistas</option>
        <option value="rated">Solo valoradas</option>
      </select>

      <div className="filters__spacer" />

      <span className="filters__label">{total} títulos</span>

      <select
        className="select"
        value={`${query.sort ?? 'date'}:${query.order ?? 'desc'}`}
        onChange={(event) => {
          const [sort, order] = event.target.value.split(':');
          onChange({
            sort: sort as CatalogQuery['sort'],
            order: order as CatalogQuery['order'],
          });
        }}
        aria-label="Ordenar por"
      >
        <option value="date:desc">Más recientes primero</option>
        <option value="date:asc">Más antiguos primero</option>
        <option value="critic:desc">Mejor nota de crítica</option>
        <option value="critic:asc">Peor nota de crítica</option>
        <option value="personal:desc">Mi nota más alta</option>
        <option value="personal:asc">Mi nota más baja</option>
        <option value="title:asc">Título (A–Z)</option>
        <option value="title:desc">Título (Z–A)</option>
      </select>

      {hasFilters && (
        <button type="button" className="btn btn--sm btn--ghost" onClick={onReset}>
          Limpiar filtros
        </button>
      )}
    </div>
  );
}
