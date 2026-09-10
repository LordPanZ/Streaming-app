/**
 * Planificación semanal por vencimiento persistido (FR-001, FR-002, ADR-007).
 *
 * No hay temporizador que "recuerde" nada: se guarda el instante de la próxima
 * ejecución y se pregunta si ya venció. Así sobrevive a cerrar la aplicación,
 * a suspender el equipo y a cambiar de huso horario, y varias semanas perdidas
 * colapsan en una sola ejecución en vez de acumularse.
 */

import type { ScheduleSettings } from '../../shared/types';

/** Cada cuánto se pregunta si toca ejecutar. */
export const CHECK_INTERVAL_MS = 15 * 60 * 1000;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Siguiente instante programado **estrictamente posterior** a `from`.
 *
 * `weekday` sigue la convención de `Date.getDay()`: 0 = domingo … 6 = sábado.
 */
export function nextOccurrence(from: Date, weekday: number, hour: number): Date {
  const safeWeekday = ((Math.round(weekday) % 7) + 7) % 7;
  const safeHour = Math.min(23, Math.max(0, Math.round(hour)));

  const candidate = new Date(from.getFullYear(), from.getMonth(), from.getDate(), safeHour, 0, 0, 0);
  const dayDelta = (safeWeekday - candidate.getDay() + 7) % 7;
  candidate.setDate(candidate.getDate() + dayDelta);

  if (candidate.getTime() <= from.getTime()) {
    candidate.setDate(candidate.getDate() + 7);
  }
  return candidate;
}

export type DueReason = 'scheduled' | 'catchup' | null;

/**
 * ¿Toca ejecutar ahora?
 *
 * - `null`: no toca.
 * - `'scheduled'`: ha vencido el instante programado con normalidad.
 * - `'catchup'`: venció hace más de una semana, o sea que la aplicación estuvo
 *   cerrada y hay que recuperar la ejecución perdida (FR-002).
 */
export function dueReason(schedule: ScheduleSettings, now: Date): DueReason {
  if (!schedule.enabled) return null;
  if (!schedule.nextRunAt) {
    // Primera vez: no se dispara de golpe nada más instalar; se programa.
    return null;
  }

  const due = Date.parse(schedule.nextRunAt);
  if (Number.isNaN(due) || due > now.getTime()) return null;

  return now.getTime() - due >= WEEK_MS ? 'catchup' : 'scheduled';
}

/**
 * Recalcula el calendario tras una ejecución (o al cambiar los ajustes).
 *
 * `nextRunAt` apunta siempre a un instante **futuro**, lo que impide que varias
 * semanas vencidas provoquen varias ejecuciones seguidas (FR-002).
 */
export function advanceSchedule(
  schedule: ScheduleSettings,
  now: Date,
  ran: boolean,
): ScheduleSettings {
  return {
    ...schedule,
    lastRunAt: ran ? now.toISOString() : schedule.lastRunAt,
    nextRunAt: nextOccurrence(now, schedule.weekday, schedule.hour).toISOString(),
  };
}

/** Programa la primera ejecución si el calendario aún no tiene ninguna. */
export function ensureScheduled(schedule: ScheduleSettings, now: Date): ScheduleSettings {
  if (!schedule.enabled) return { ...schedule, nextRunAt: null };
  if (schedule.nextRunAt && !Number.isNaN(Date.parse(schedule.nextRunAt))) return schedule;
  return { ...schedule, nextRunAt: nextOccurrence(now, schedule.weekday, schedule.hour).toISOString() };
}

/** Milisegundos que faltan para la próxima ejecución; `null` si no hay ninguna. */
export function millisUntilNext(schedule: ScheduleSettings, now: Date): number | null {
  if (!schedule.enabled || !schedule.nextRunAt) return null;
  const due = Date.parse(schedule.nextRunAt);
  if (Number.isNaN(due)) return null;
  return Math.max(0, due - now.getTime());
}
