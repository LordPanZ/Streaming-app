/**
 * Servicio de consulta del catálogo.
 *
 * Compone catálogo, valoraciones y ajustes en las vistas que consume la
 * interfaz. Es la única capa que sabe que una `TitleView` lleva notas
 * derivadas; ni el almacén ni el dominio las conocen (ADR-008).
 */

import type {
  CatalogFacets,
  CatalogPage,
  CatalogQuery,
  Settings,
  Title,
  TitleView,
  WatchedStats,
} from '../../shared/types';
import {
  buildFacets,
  DEFAULT_PAGE_SIZE,
  filterViews,
  paginate,
  sortViews,
} from '../domain/filters';
import { aggregateCritic, personalScore, personalVsCritic } from '../domain/scoring';
import { currentWeek } from '../domain/weeks';
import type { CatalogStore } from '../store/catalog';
import { buildWatchedStats, type RatingsStore } from '../store/ratings';

export class CatalogService {
  constructor(
    private readonly catalog: CatalogStore,
    private readonly ratings: RatingsStore,
    private readonly getSettings: () => Settings,
  ) {}

  /** Ensambla un título con todo lo derivado ya calculado. */
  buildView(title: Title): TitleView {
    const criteria = this.getSettings().criteria;
    const rating = this.ratings.get(title.id);
    const critic = aggregateCritic(title.ratings);
    const personal = rating ? personalScore(rating, criteria) : null;

    return {
      title,
      critic,
      rating,
      personal,
      delta: personal ? personalVsCritic(personal, critic) : null,
    };
  }

  query(query: CatalogQuery, now: Date = new Date()): CatalogPage {
    const week = resolveWeek(query.week, now);

    // Estrechar por índices antes de filtrar (NFR-006).
    const narrowed = this.catalog.narrow({
      ...(week ? { week } : {}),
      ...(query.platforms?.length ? { platforms: query.platforms } : {}),
      ...(query.genres?.length ? { genres: query.genres } : {}),
    });

    const views = narrowed.map((title) => this.buildView(title));
    const filtered = filterViews(views, query);
    const sorted = sortViews(filtered, query.sort ?? 'date', query.order ?? 'desc');

    const offset = query.offset ?? 0;
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;

    return {
      items: paginate(sorted, offset, limit),
      total: sorted.length,
      offset,
      limit,
    };
  }

  get(id: string): TitleView | null {
    const title = this.catalog.get(id);
    return title ? this.buildView(title) : null;
  }

  facets(now: Date = new Date()): CatalogFacets {
    const views = this.catalog.all().map((title) => this.buildView(title));
    return buildFacets(views, currentWeek(now));
  }

  stats(): WatchedStats {
    return buildWatchedStats(
      this.catalog.all(),
      this.ratings.all(),
      this.getSettings().criteria,
    );
  }
}

/** `current` se traduce a la semana ISO en curso; `all` y lo vacío no filtran. */
export function resolveWeek(week: string | undefined, now: Date): string | undefined {
  if (!week || week === 'all') return undefined;
  if (week === 'current') return currentWeek(now);
  return week;
}
