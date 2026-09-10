/** FR-001, FR-002 · planificación semanal por vencimiento (ADR-007) */

import { describe, expect, it } from 'vitest';
import {
  advanceSchedule,
  dueReason,
  ensureScheduled,
  millisUntilNext,
  nextOccurrence,
} from '../../src/core/agent/scheduler';
import { defaultSettings } from '../../src/core/store/settings';
import type { ScheduleSettings } from '../../src/shared/types';

const base = defaultSettings().schedule;

describe('nextOccurrence', () => {
  it('encuentra el próximo lunes a las 9', () => {
    // 2026-09-10 es jueves.
    const next = nextOccurrence(new Date(2026, 8, 10, 12, 0), 1, 9);
    expect(next.getDay()).toBe(1);
    expect(next.getHours()).toBe(9);
    expect(next.getDate()).toBe(14);
  });

  it('el mismo día antes de la hora programa hoy', () => {
    const next = nextOccurrence(new Date(2026, 8, 14, 7, 0), 1, 9);
    expect(next.getDate()).toBe(14);
  });

  it('el mismo día pasada la hora salta a la semana siguiente', () => {
    const next = nextOccurrence(new Date(2026, 8, 14, 10, 0), 1, 9);
    expect(next.getDate()).toBe(21);
  });

  it('justo a la hora en punto programa la semana siguiente, no ahora mismo', () => {
    const next = nextOccurrence(new Date(2026, 8, 14, 9, 0, 0), 1, 9);
    expect(next.getDate()).toBe(21);
  });

  it('normaliza días y horas fuera de rango en vez de fallar', () => {
    expect(nextOccurrence(new Date(2026, 8, 10), 8, 99).getHours()).toBe(23);
    expect(nextOccurrence(new Date(2026, 8, 10), -1, 9).getDay()).toBe(6);
  });
});

describe('dueReason (FR-001, FR-002)', () => {
  const now = new Date('2026-09-14T10:00:00.000Z');

  it('no dispara si el calendario está desactivado', () => {
    expect(dueReason({ ...base, enabled: false, nextRunAt: '2020-01-01T00:00:00.000Z' }, now)).toBeNull();
  });

  it('no dispara nada más instalar: primero programa', () => {
    expect(dueReason({ ...base, nextRunAt: null }, now)).toBeNull();
  });

  it('no dispara si aún no ha vencido', () => {
    expect(dueReason({ ...base, nextRunAt: '2026-09-20T00:00:00.000Z' }, now)).toBeNull();
  });

  it('dispara con normalidad cuando acaba de vencer', () => {
    expect(dueReason({ ...base, nextRunAt: '2026-09-14T09:00:00.000Z' }, now)).toBe('scheduled');
  });

  it('marca como recuperación lo vencido hace más de una semana (FR-002)', () => {
    expect(dueReason({ ...base, nextRunAt: '2026-08-24T09:00:00.000Z' }, now)).toBe('catchup');
  });

  it('ignora una fecha corrupta en vez de disparar sin control', () => {
    expect(dueReason({ ...base, nextRunAt: 'el lunes' }, now)).toBeNull();
  });
});

describe('advanceSchedule (FR-002)', () => {
  it('deja nextRunAt siempre en el futuro, colapsando las semanas perdidas', () => {
    const now = new Date(2026, 8, 14, 10, 0);
    const advanced = advanceSchedule({ ...base, nextRunAt: '2026-08-01T09:00:00.000Z' }, now, true);

    const next = new Date(advanced.nextRunAt!);
    expect(next.getTime()).toBeGreaterThan(now.getTime());
    expect(next.getDay()).toBe(1);
    expect(dueReason(advanced, now)).toBeNull();
  });

  it('registra la última ejecución solo si de verdad se ejecutó', () => {
    const now = new Date(2026, 8, 14, 10, 0);
    expect(advanceSchedule(base, now, true).lastRunAt).toBe(now.toISOString());
    expect(advanceSchedule(base, now, false).lastRunAt).toBe(base.lastRunAt);
  });

  it('tres semanas vencidas producen una sola ejecución, no tres', () => {
    const now = new Date(2026, 8, 14, 10, 0);
    let schedule: ScheduleSettings = { ...base, nextRunAt: '2026-08-24T09:00:00.000Z' };
    let runs = 0;

    for (let i = 0; i < 5; i += 1) {
      if (dueReason(schedule, now)) {
        runs += 1;
        schedule = advanceSchedule(schedule, now, true);
      }
    }
    expect(runs).toBe(1);
  });
});

describe('ensureScheduled', () => {
  it('programa la primera ejecución cuando no hay ninguna', () => {
    const scheduled = ensureScheduled({ ...base, nextRunAt: null }, new Date(2026, 8, 10));
    expect(scheduled.nextRunAt).not.toBeNull();
  });

  it('no toca un calendario ya programado', () => {
    const existing = { ...base, nextRunAt: '2026-09-21T09:00:00.000Z' };
    expect(ensureScheduled(existing, new Date(2026, 8, 10)).nextRunAt).toBe(existing.nextRunAt);
  });

  it('reprograma si la fecha guardada es basura', () => {
    const scheduled = ensureScheduled({ ...base, nextRunAt: 'basura' }, new Date(2026, 8, 10));
    expect(Number.isNaN(Date.parse(scheduled.nextRunAt!))).toBe(false);
  });

  it('desactivado deja el calendario vacío', () => {
    expect(ensureScheduled({ ...base, enabled: false }, new Date()).nextRunAt).toBeNull();
  });
});

describe('millisUntilNext', () => {
  it('cuenta lo que falta', () => {
    const now = new Date('2026-09-14T09:00:00.000Z');
    const schedule = { ...base, nextRunAt: '2026-09-14T10:00:00.000Z' };
    expect(millisUntilNext(schedule, now)).toBe(3_600_000);
  });

  it('nunca devuelve negativo', () => {
    const now = new Date('2026-09-14T11:00:00.000Z');
    expect(millisUntilNext({ ...base, nextRunAt: '2026-09-14T10:00:00.000Z' }, now)).toBe(0);
  });

  it('devuelve null si no hay nada programado', () => {
    expect(millisUntilNext({ ...base, nextRunAt: null }, new Date())).toBeNull();
    expect(millisUntilNext({ ...base, enabled: false, nextRunAt: '2026-01-01T00:00:00.000Z' }, new Date())).toBeNull();
  });
});
