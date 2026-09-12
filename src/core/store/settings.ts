/**
 * Ajustes de la aplicación con valores por defecto y migración de esquema
 * (FR-005, FR-023, FR-026, FR-001).
 */

import type { QualitySettings, Settings } from '../../shared/types';
import { defaultCriteria, mergeCriteria } from '../domain/criteria';
import { defaultPlatformToggles, PLATFORMS } from '../domain/platforms';
import { JsonStore, type RecoverHandler } from './json-store';
import { STORAGE_KEYS, type KeyValueStorage } from './storage';

export const SETTINGS_SCHEMA_VERSION = 1;

export function defaultSettings(): Settings {
  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    schedule: {
      enabled: true,
      weekday: 1, // lunes
      hour: 9,
      nextRunAt: null,
      lastRunAt: null,
    },
    window: { lookbackDays: 7, graceDays: 2 },
    platforms: defaultPlatformToggles(),
    criteria: defaultCriteria(),
    revalidateTrailerWeeks: 8,
    cacheTtlHours: 168,
    // Listón de calidad apagado por defecto (FR-053): la primera vez conviene
    // ver lo que hay antes de decidir dónde ponerlo.
    quality: { minCritic: 0, includeUnrated: true },
  };
}

export class SettingsStore {
  private readonly store: JsonStore<Settings>;

  constructor(storage: KeyValueStorage, onRecover?: RecoverHandler) {
    this.store = new JsonStore<Settings>({
      storage,
      key: STORAGE_KEYS.settings,
      defaults: defaultSettings,
      revive: (raw, defaults) => migrateSettings(raw, defaults),
      ...(onRecover ? { onRecover } : {}),
    });
  }

  async load(): Promise<Settings> {
    return this.store.load();
  }

  get(): Settings {
    return this.store.get();
  }

  /** Aplica un parche superficial validado y persiste (FR-005, FR-023, FR-026). */
  async update(patch: Partial<Settings>): Promise<Settings> {
    return this.store.update((current) => sanitizeSettings({ ...current, ...patch }, current));
  }

  async replace(next: Settings): Promise<Settings> {
    return this.store.save(sanitizeSettings(next, defaultSettings()));
  }

  async reset(): Promise<Settings> {
    return this.store.reset();
  }

  /** Plataformas activas, en el orden del catálogo (FR-005). */
  enabledPlatformIds(): string[] {
    const settings = this.store.get();
    return PLATFORMS.filter((platform) => settings.platforms[platform.id] !== false).map(
      (platform) => platform.id,
    );
  }
}

/**
 * Normaliza un objeto de ajustes venido de disco, de la interfaz o de una
 * importación. Todo lo que no encaje se sustituye por el valor previo válido:
 * un ajuste corrupto degrada, no rompe.
 */
export function sanitizeSettings(candidate: Partial<Settings>, fallback: Settings): Settings {
  const schedule = candidate.schedule ?? fallback.schedule;
  const timeWindow = candidate.window ?? fallback.window;

  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    schedule: {
      enabled: typeof schedule.enabled === 'boolean' ? schedule.enabled : fallback.schedule.enabled,
      weekday: clampInt(schedule.weekday, 0, 6, fallback.schedule.weekday),
      hour: clampInt(schedule.hour, 0, 23, fallback.schedule.hour),
      nextRunAt: isIsoOrNull(schedule.nextRunAt) ? schedule.nextRunAt : fallback.schedule.nextRunAt,
      lastRunAt: isIsoOrNull(schedule.lastRunAt) ? schedule.lastRunAt : fallback.schedule.lastRunAt,
    },
    window: {
      lookbackDays: clampInt(timeWindow.lookbackDays, 1, 90, fallback.window.lookbackDays),
      graceDays: clampInt(timeWindow.graceDays, 0, 30, fallback.window.graceDays),
    },
    platforms: sanitizePlatforms(candidate.platforms ?? fallback.platforms),
    criteria: sanitizeCriteria(candidate.criteria ?? fallback.criteria),
    revalidateTrailerWeeks: clampInt(
      candidate.revalidateTrailerWeeks,
      0,
      52,
      fallback.revalidateTrailerWeeks,
    ),
    cacheTtlHours: clampInt(candidate.cacheTtlHours, 1, 8760, fallback.cacheTtlHours),
    quality: sanitizeQuality(candidate.quality, fallback.quality),
  };
}

/**
 * El listón de calidad se recorta al rango 0–10 con un decimal (FR-053).
 *
 * `includeUnrated` solo se cambia si viene un booleano de verdad: es la
 * decisión que separa «no llega al mínimo» de «todavía no lo sabemos», y no se
 * toca por accidente.
 */
function sanitizeQuality(
  raw: Partial<QualitySettings> | undefined,
  fallback: QualitySettings,
): QualitySettings {
  const source = typeof raw === 'object' && raw !== null ? raw : {};
  const minCritic =
    typeof source.minCritic === 'number' && Number.isFinite(source.minCritic)
      ? Math.round(Math.min(10, Math.max(0, source.minCritic)) * 10) / 10
      : fallback.minCritic;

  return {
    minCritic,
    includeUnrated:
      typeof source.includeUnrated === 'boolean' ? source.includeUnrated : fallback.includeUnrated,
  };
}

function sanitizePlatforms(raw: unknown): Record<string, boolean> {
  const defaults = defaultPlatformToggles();
  if (typeof raw !== 'object' || raw === null) return defaults;
  const source = raw as Record<string, unknown>;
  const result: Record<string, boolean> = {};
  for (const platform of PLATFORMS) {
    const value = source[platform.id];
    result[platform.id] = typeof value === 'boolean' ? value : true;
  }
  return result;
}

function sanitizeCriteria(raw: unknown): Settings['criteria'] {
  if (!Array.isArray(raw)) return defaultCriteria();
  const cleaned = raw
    .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
    .filter((entry) => typeof entry.id === 'string' && entry.id.length > 0)
    .map((entry, index) => ({
      id: String(entry.id),
      label: typeof entry.label === 'string' && entry.label.trim() ? entry.label : String(entry.id),
      description: typeof entry.description === 'string' ? entry.description : '',
      // Invariante 5: peso estrictamente positivo.
      weight:
        typeof entry.weight === 'number' && Number.isFinite(entry.weight) && entry.weight > 0
          ? entry.weight
          : 1,
      enabled: entry.enabled !== false,
      order: typeof entry.order === 'number' && Number.isFinite(entry.order) ? entry.order : index,
    }));
  return mergeCriteria(cleaned.length > 0 ? cleaned : undefined);
}

function migrateSettings(raw: unknown, defaults: Settings): Settings {
  if (typeof raw !== 'object' || raw === null) return defaults;
  // Solo existe el esquema 1. Las migraciones futuras encadenan aquí, versión a
  // versión, antes del saneado final.
  return sanitizeSettings(raw as Partial<Settings>, defaults);
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function isIsoOrNull(value: unknown): value is string | null {
  if (value === null) return true;
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}
