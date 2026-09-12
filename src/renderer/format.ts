/** Formato de fechas, duraciones y notas para la interfaz. En castellano. */

import type { Confidence, MediaType, StageName } from '../shared/types';

const DATE_FORMAT = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const DATE_TIME_FORMAT = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : DATE_FORMAT.format(date);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : DATE_TIME_FORMAT.format(date);
}

export function formatRuntime(minutes: number | null): string | null {
  if (!minutes || minutes <= 0) return null;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours} h ${rest} min` : `${rest} min`;
}

export function formatSeasons(seasons: number | null): string | null {
  if (!seasons || seasons <= 0) return null;
  return seasons === 1 ? '1 temporada' : `${seasons} temporadas`;
}

export function mediaLabel(mediaType: MediaType): string {
  return mediaType === 'movie' ? 'Película' : 'Serie';
}

export function formatScore(score: number | null): string {
  return score === null ? '—' : score.toFixed(1).replace('.', ',');
}

export function formatDelta(delta: number | null): string {
  if (delta === null) return '—';
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(1).replace('.', ',')}`;
}

/**
 * Nombre de cada etapa del agente en castellano.
 *
 * El identificador interno es inglés porque así se escribe el código, pero el
 * usuario mira esta barra durante toda la recopilación: merece leer lo que
 * está pasando, no el nombre de una función.
 */
export const STAGE_LABEL: Record<StageName, string> = {
  discover: 'Buscando estrenos',
  enrich: 'Leyendo fichas',
  rate: 'Pidiendo notas',
  trailer: 'Comprobando tráileres',
  persist: 'Guardando',
};

/** Versión corta, para el detalle de una ejecución. */
export const STAGE_SHORT: Record<StageName, string> = {
  discover: 'estrenos',
  enrich: 'fichas',
  rate: 'notas',
  trailer: 'tráileres',
  persist: 'guardado',
};

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  none: 'sin fuentes',
  low: 'confianza baja · 1 fuente',
  medium: 'confianza media · 2 fuentes',
  high: 'confianza alta · 3 o más fuentes',
};

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  return `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} s`;
}

export function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
