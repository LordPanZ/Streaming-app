/**
 * Catálogo de plataformas de streaming en España (FR-005) y resolución dinámica
 * de sus identificadores de proveedor (FR-006, ADR-002).
 *
 * Los `providerIdHint` son **solo una pista de arranque**: el identificador
 * bueno es el que devuelve el catálogo de proveedores de la región ES en cada
 * ejecución. Si difieren, manda el resuelto y la discrepancia va al informe.
 */

import { normalizeSlug } from './text';

export interface PlatformDefinition {
  /** Identificador interno estable. Nunca cambia: es la clave de los ajustes. */
  id: string;
  /** Nombre visible en la interfaz. */
  name: string;
  /** Pista de identificador de proveedor de TMDB para la región ES. */
  providerIdHint: number;
  /**
   * Nombres con los que la fuente puede referirse a esta plataforma.
   * Se comparan normalizados (sin tildes, sin signos, sin mayúsculas).
   */
  aliases: string[];
  /** Color de acento de la marca, para las etiquetas de la interfaz. */
  accent: string;
}

/** Plataformas cubiertas por defecto (FR-005). */
export const PLATFORMS: readonly PlatformDefinition[] = [
  {
    id: 'netflix',
    name: 'Netflix',
    providerIdHint: 8,
    aliases: ['Netflix', 'Netflix basic with Ads', 'Netflix Standard with Ads'],
    accent: '#e50914',
  },
  {
    id: 'prime-video',
    name: 'Prime Video',
    providerIdHint: 119,
    aliases: ['Amazon Prime Video', 'Prime Video', 'Amazon Video'],
    accent: '#00a8e1',
  },
  {
    id: 'disney-plus',
    name: 'Disney+',
    providerIdHint: 337,
    aliases: ['Disney Plus', 'Disney+'],
    accent: '#113ccf',
  },
  {
    id: 'hbo-max',
    name: 'HBO Max',
    providerIdHint: 1899,
    aliases: ['HBO Max', 'Max', 'HBO España', 'HBO Espana'],
    accent: '#8b5cf6',
  },
  {
    id: 'movistar-plus',
    name: 'Movistar Plus+',
    providerIdHint: 149,
    aliases: ['Movistar Plus+', 'Movistar Plus', 'Movistar+'],
    accent: '#00b8d4',
  },
  {
    id: 'apple-tv-plus',
    name: 'Apple TV+',
    providerIdHint: 350,
    aliases: ['Apple TV Plus', 'Apple TV+'],
    accent: '#a1a1a6',
  },
  {
    id: 'skyshowtime',
    name: 'SkyShowtime',
    providerIdHint: 1773,
    aliases: ['SkyShowtime'],
    accent: '#0c1c3c',
  },
  {
    id: 'filmin',
    name: 'Filmin',
    providerIdHint: 63,
    aliases: ['Filmin'],
    accent: '#f5a623',
  },
  {
    id: 'crunchyroll',
    name: 'Crunchyroll',
    providerIdHint: 283,
    aliases: ['Crunchyroll'],
    accent: '#f47521',
  },
  {
    id: 'atresplayer',
    name: 'atresplayer',
    providerIdHint: 62,
    aliases: ['atresplayer', 'Atresplayer', 'Atresplayer Premium'],
    accent: '#ff6b00',
  },
  {
    id: 'rakuten-tv',
    name: 'Rakuten TV',
    providerIdHint: 35,
    aliases: ['Rakuten TV'],
    accent: '#e6003c',
  },
  {
    id: 'pluto-tv',
    name: 'Pluto TV',
    providerIdHint: 300,
    aliases: ['Pluto TV'],
    accent: '#ffe000',
  },
] as const;

const BY_ID = new Map(PLATFORMS.map((p) => [p.id, p]));

export function getPlatform(id: string): PlatformDefinition | undefined {
  return BY_ID.get(id);
}

export function platformName(id: string): string {
  return BY_ID.get(id)?.name ?? id;
}

/**
 * Normaliza un nombre de plataforma para poder compararlo: minúsculas, sin
 * diacríticos y sin nada que no sea letra o número. Así "Disney+" y
 * "Disney Plus" no coinciden por accidente, pero "HBO Max" y "hbo  max" sí.
 */
export function normalizeName(name: string): string {
  return normalizeSlug(name);
}

const ALIAS_INDEX: Map<string, string> = (() => {
  const index = new Map<string, string>();
  for (const platform of PLATFORMS) {
    index.set(normalizeName(platform.name), platform.id);
    for (const alias of platform.aliases) {
      index.set(normalizeName(alias), platform.id);
    }
  }
  return index;
})();

/** Devuelve el identificador interno de plataforma para un nombre de la fuente. */
export function platformIdForProviderName(providerName: string): string | null {
  return ALIAS_INDEX.get(normalizeName(providerName)) ?? null;
}

// ---------------------------------------------------------------------------
// Resolución dinámica (FR-006)
// ---------------------------------------------------------------------------

export interface ProviderCatalogEntry {
  provider_id: number;
  provider_name: string;
  logo_path?: string | null;
}

export interface ResolvedPlatform {
  id: string;
  name: string;
  providerId: number;
  logoPath: string | null;
  /** `true` si el identificador resuelto no coincide con la pista del repositorio. */
  driftedFromHint: boolean;
}

export interface PlatformResolution {
  resolved: ResolvedPlatform[];
  /** Plataformas pedidas que la fuente no ofrece en la región consultada. */
  unresolved: string[];
  /** Mensajes de discrepancia, para el informe de ejecución (FR-006). */
  drift: string[];
}

/**
 * Cruza las plataformas solicitadas con el catálogo de proveedores de la región.
 * Si una plataforma no aparece en el catálogo, se cae a su pista y se anota; así
 * un cambio de nombre en el proveedor degrada en vez de vaciar la plataforma.
 */
export function resolvePlatforms(
  requestedIds: readonly string[],
  catalog: readonly ProviderCatalogEntry[],
): PlatformResolution {
  const catalogByName = new Map<string, ProviderCatalogEntry>();
  for (const entry of catalog) {
    catalogByName.set(normalizeName(entry.provider_name), entry);
  }

  const resolved: ResolvedPlatform[] = [];
  const unresolved: string[] = [];
  const drift: string[] = [];

  for (const id of requestedIds) {
    const definition = BY_ID.get(id);
    if (!definition) {
      unresolved.push(id);
      continue;
    }

    const candidates = [definition.name, ...definition.aliases];
    let match: ProviderCatalogEntry | undefined;
    for (const candidate of candidates) {
      match = catalogByName.get(normalizeName(candidate));
      if (match) break;
    }

    if (!match) {
      // El catálogo no la ofrece con ninguno de sus nombres conocidos: usamos la
      // pista para no perder la plataforma, pero lo dejamos por escrito.
      resolved.push({
        id: definition.id,
        name: definition.name,
        providerId: definition.providerIdHint,
        logoPath: null,
        driftedFromHint: false,
      });
      drift.push(
        `«${definition.name}» no aparece en el catálogo de proveedores de ES; se usa el identificador de respaldo ${definition.providerIdHint}.`,
      );
      continue;
    }

    const driftedFromHint = match.provider_id !== definition.providerIdHint;
    if (driftedFromHint) {
      drift.push(
        `«${definition.name}» ha cambiado de identificador: ${definition.providerIdHint} → ${match.provider_id}. Se usa el resuelto.`,
      );
    }

    resolved.push({
      id: definition.id,
      name: definition.name,
      providerId: match.provider_id,
      logoPath: match.logo_path ?? null,
      driftedFromHint,
    });
  }

  return { resolved, unresolved, drift };
}

/** Todas las plataformas activas por defecto (FR-005). */
export function defaultPlatformToggles(): Record<string, boolean> {
  return Object.fromEntries(PLATFORMS.map((p) => [p.id, true]));
}
