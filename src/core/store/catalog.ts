/**
 * Catálogo de títulos con índices en memoria (FR-011, FR-012, NFR-006).
 *
 * El filtrado de la interfaz es intersección de conjuntos, no recorrido lineal:
 * con 8 000 títulos la diferencia se nota, y el modelo de datos ya prometía
 * estos índices.
 */

import type { Title } from '../../shared/types';
import { JsonStore, type RecoverHandler } from './json-store';

export interface CatalogData {
  schemaVersion: number;
  titles: Title[];
}

export const CATALOG_SCHEMA_VERSION = 1;

function emptyCatalog(): CatalogData {
  return { schemaVersion: CATALOG_SCHEMA_VERSION, titles: [] };
}

/** Estrecha el catálogo antes de aplicar los filtros no indexables. */
export interface NarrowCriteria {
  week?: string;
  platforms?: readonly string[];
  genres?: readonly string[];
}

export interface UpsertOutcome {
  created: number;
  updated: number;
  skipped: number;
}

export class CatalogStore {
  private readonly store: JsonStore<CatalogData>;

  private byId = new Map<string, Title>();
  private byWeek = new Map<string, Set<string>>();
  private byPlatform = new Map<string, Set<string>>();
  private byGenre = new Map<string, Set<string>>();
  /** Identificadores ordenados por fecha de disponibilidad, de más nueva a más vieja. */
  private sortedIds: string[] = [];

  constructor(filePath: string, onRecover?: RecoverHandler) {
    this.store = new JsonStore<CatalogData>({
      filePath,
      defaults: emptyCatalog,
      revive: (raw, defaults) => reviveCatalog(raw, defaults),
      ...(onRecover ? { onRecover } : {}),
    });
  }

  async load(): Promise<void> {
    const data = await this.store.load();
    this.rebuildIndexes(data.titles);
  }

  get size(): number {
    return this.byId.size;
  }

  all(): Title[] {
    return this.sortedIds
      .map((id) => this.byId.get(id))
      .filter((title): title is Title => title !== undefined);
  }

  get(id: string): Title | null {
    return this.byId.get(id) ?? null;
  }

  weeks(): string[] {
    return [...this.byWeek.keys()].sort((a, b) => b.localeCompare(a));
  }

  /**
   * Devuelve los títulos que cumplen los criterios indexables, ya ordenados por
   * fecha descendente. Sin criterios devuelve el catálogo entero.
   */
  narrow(criteria: NarrowCriteria = {}): Title[] {
    const sets: Array<Set<string>> = [];

    if (criteria.week && criteria.week !== 'all') {
      sets.push(this.byWeek.get(criteria.week) ?? new Set());
    }
    if (criteria.platforms?.length) {
      sets.push(unionOf(criteria.platforms.map((p) => this.byPlatform.get(p))));
    }
    if (criteria.genres?.length) {
      sets.push(unionOf(criteria.genres.map((g) => this.byGenre.get(g))));
    }

    if (sets.length === 0) return this.all();

    // Intersecar empezando por el conjunto más pequeño acota el trabajo cuanto antes.
    sets.sort((a, b) => a.size - b.size);
    const [smallest, ...rest] = sets;
    const result: Title[] = [];
    for (const id of this.sortedIds) {
      if (!smallest?.has(id)) continue;
      if (rest.every((set) => set.has(id))) {
        const title = this.byId.get(id);
        if (title) result.push(title);
      }
    }
    return result;
  }

  /**
   * Inserta o fusiona títulos y persiste una sola vez.
   *
   * La fusión conserva `firstSeenAt`, une las plataformas y **no** borra datos
   * buenos con nulos: si esta semana OMDb no respondió, la nota de la semana
   * pasada sigue ahí en vez de desaparecer.
   */
  async upsertMany(incoming: readonly Title[]): Promise<UpsertOutcome> {
    const outcome: UpsertOutcome = { created: 0, updated: 0, skipped: 0 };

    for (const title of incoming) {
      if (title.platforms.length === 0) {
        // Invariante 2 del modelo de datos.
        outcome.skipped += 1;
        continue;
      }
      const existing = this.byId.get(title.id);
      if (!existing) {
        this.indexTitle(title);
        outcome.created += 1;
        continue;
      }
      const merged = mergeTitle(existing, title);
      this.unindexTitle(existing);
      this.indexTitle(merged);
      outcome.updated += 1;
    }

    if (outcome.created > 0 || outcome.updated > 0) {
      this.resort();
      await this.persist();
    }
    return outcome;
  }

  /** Reemplaza un título completo (usado por la revalidación de tráileres). */
  async replace(title: Title): Promise<void> {
    const existing = this.byId.get(title.id);
    if (existing) this.unindexTitle(existing);
    this.indexTitle(title);
    this.resort();
    await this.persist();
  }

  /** Sustituye el catálogo entero (importación, FR-038). */
  async replaceAll(titles: readonly Title[]): Promise<void> {
    this.rebuildIndexes([...titles]);
    await this.persist();
  }

  /** Borra el catálogo (FR-039). */
  async clear(): Promise<void> {
    this.rebuildIndexes([]);
    await this.store.reset();
  }

  private async persist(): Promise<void> {
    await this.store.save({ schemaVersion: CATALOG_SCHEMA_VERSION, titles: this.all() });
  }

  private rebuildIndexes(titles: Title[]): void {
    this.byId = new Map();
    this.byWeek = new Map();
    this.byPlatform = new Map();
    this.byGenre = new Map();
    for (const title of titles) {
      this.indexTitle(title);
    }
    this.resort();
  }

  private indexTitle(title: Title): void {
    this.byId.set(title.id, title);
    addTo(this.byWeek, title.releaseWeek, title.id);
    for (const platform of title.platforms) addTo(this.byPlatform, platform.id, title.id);
    for (const genre of title.genres) addTo(this.byGenre, genre, title.id);
  }

  private unindexTitle(title: Title): void {
    removeFrom(this.byWeek, title.releaseWeek, title.id);
    for (const platform of title.platforms) removeFrom(this.byPlatform, platform.id, title.id);
    for (const genre of title.genres) removeFrom(this.byGenre, genre, title.id);
  }

  private resort(): void {
    this.sortedIds = [...this.byId.values()]
      .sort(
        (a, b) =>
          b.availableFrom.localeCompare(a.availableFrom) ||
          a.title.localeCompare(b.title, 'es'),
      )
      .map((title) => title.id);
  }
}

// ---------------------------------------------------------------------------
// Fusión
// ---------------------------------------------------------------------------

/** Une plataformas sin duplicar y conservando el enlace más informativo. */
function mergePlatforms(existing: Title['platforms'], incoming: Title['platforms']) {
  const byId = new Map(existing.map((p) => [p.id, p]));
  for (const platform of incoming) {
    const previous = byId.get(platform.id);
    byId.set(platform.id, {
      ...platform,
      link: platform.link ?? previous?.link ?? null,
      logoUrl: platform.logoUrl ?? previous?.logoUrl ?? null,
    });
  }
  return [...byId.values()];
}

export function mergeTitle(existing: Title, incoming: Title): Title {
  return {
    ...existing,
    ...incoming,
    // Nunca se pierde el momento en que el agente lo vio por primera vez.
    firstSeenAt: existing.firstSeenAt,
    // Un estreno no cambia de fecha: la primera observación manda.
    availableFrom: existing.availableFrom,
    releaseWeek: existing.releaseWeek,
    platforms: mergePlatforms(existing.platforms, incoming.platforms),
    genres: incoming.genres.length > 0 ? incoming.genres : existing.genres,
    overview: incoming.overview || existing.overview,
    posterUrl: incoming.posterUrl ?? existing.posterUrl,
    backdropUrl: incoming.backdropUrl ?? existing.backdropUrl,
    imdbId: incoming.imdbId ?? existing.imdbId,
    ratings: {
      imdb: incoming.ratings.imdb ?? existing.ratings.imdb,
      rottenTomatoes: incoming.ratings.rottenTomatoes ?? existing.ratings.rottenTomatoes,
      metacritic: incoming.ratings.metacritic ?? existing.ratings.metacritic,
      tmdb: incoming.ratings.tmdb ?? existing.ratings.tmdb,
      imdbVotes: incoming.ratings.imdbVotes ?? existing.ratings.imdbVotes,
      fetchedAt: incoming.ratings.fetchedAt ?? existing.ratings.fetchedAt,
    },
    trailer: incoming.trailer ?? existing.trailer,
    updatedAt: incoming.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Utilidades de índice
// ---------------------------------------------------------------------------

function addTo(index: Map<string, Set<string>>, key: string, id: string): void {
  const set = index.get(key);
  if (set) set.add(id);
  else index.set(key, new Set([id]));
}

function removeFrom(index: Map<string, Set<string>>, key: string, id: string): void {
  const set = index.get(key);
  if (!set) return;
  set.delete(id);
  if (set.size === 0) index.delete(key);
}

function unionOf(sets: Array<Set<string> | undefined>): Set<string> {
  const union = new Set<string>();
  for (const set of sets) {
    if (!set) continue;
    for (const id of set) union.add(id);
  }
  return union;
}

function reviveCatalog(raw: unknown, defaults: CatalogData): CatalogData {
  if (typeof raw !== 'object' || raw === null) return defaults;
  const candidate = raw as Partial<CatalogData>;
  if (!Array.isArray(candidate.titles)) return defaults;
  const titles = candidate.titles.filter(isPlausibleTitle);
  return { schemaVersion: CATALOG_SCHEMA_VERSION, titles };
}

/** Descarta entradas que romperían los invariantes del modelo de datos. */
export function isPlausibleTitle(value: unknown): value is Title {
  if (typeof value !== 'object' || value === null) return false;
  const title = value as Partial<Title>;
  return (
    typeof title.id === 'string' &&
    (title.mediaType === 'movie' || title.mediaType === 'series') &&
    typeof title.title === 'string' &&
    typeof title.availableFrom === 'string' &&
    typeof title.releaseWeek === 'string' &&
    Array.isArray(title.genres) &&
    Array.isArray(title.platforms) &&
    title.platforms.length > 0
  );
}
