/** FR-004, FR-011 · semanas ISO y ventanas de recopilación */

import { describe, expect, it } from 'vitest';
import {
  collectionWindow,
  currentWeek,
  formatWeekLabel,
  isWithinWindow,
  isoWeek,
  isoWeekOfDate,
  previousWeeks,
  startOfIsoWeek,
  toISODate,
} from '../../src/core/domain/weeks';

describe('isoWeek', () => {
  it('numera según ISO 8601 (semana 1 = la del primer jueves)', () => {
    expect(isoWeek(new Date(2026, 0, 1))).toBe('2026-W01');
    expect(isoWeek(new Date(2026, 8, 10))).toBe('2026-W37');
  });

  it('asigna el 1 de enero a la última semana del año anterior cuando toca', () => {
    // 2022-01-01 fue sábado: pertenece a la semana 52 de 2021.
    expect(isoWeek(new Date(2022, 0, 1))).toBe('2021-W52');
  });

  it('asigna el 31 de diciembre a la semana 1 del año siguiente cuando toca', () => {
    // 2024-12-31 fue martes: pertenece a la semana 1 de 2025.
    expect(isoWeek(new Date(2024, 11, 31))).toBe('2025-W01');
  });

  it('la semana empieza en lunes y termina en domingo', () => {
    const monday = new Date(2026, 8, 7);
    const sunday = new Date(2026, 8, 13);
    expect(isoWeek(monday)).toBe(isoWeek(sunday));
    expect(isoWeek(new Date(2026, 8, 14))).not.toBe(isoWeek(monday));
  });
});

describe('startOfIsoWeek', () => {
  it('devuelve el lunes de la semana indicada', () => {
    expect(toISODate(startOfIsoWeek('2026-W37'))).toBe('2026-09-07');
    expect(startOfIsoWeek('2026-W37').getDay()).toBe(1);
  });

  it('es inverso de isoWeek para cualquier semana', () => {
    for (const week of ['2024-W01', '2025-W01', '2021-W52', '2026-W53']) {
      expect(isoWeek(startOfIsoWeek(week))).toBe(week);
    }
  });

  it('rechaza una semana mal formada', () => {
    expect(() => startOfIsoWeek('2026-37')).toThrow();
  });
});

describe('previousWeeks', () => {
  it('devuelve las N semanas anteriores incluida la de partida', () => {
    expect(previousWeeks('2026-W37', 3)).toEqual(['2026-W37', '2026-W36', '2026-W35']);
  });

  it('cruza el cambio de año sin romperse', () => {
    expect(previousWeeks('2025-W01', 2)).toEqual(['2025-W01', '2024-W52']);
  });
});

describe('collectionWindow (FR-004)', () => {
  const now = new Date(2026, 8, 10);

  it('mira hacia atrás la ventana más la gracia', () => {
    expect(collectionWindow(now, 7, 2)).toEqual({ from: '2026-09-01', to: '2026-09-10' });
  });

  it('la gracia nunca adelanta la fecha final al futuro', () => {
    expect(collectionWindow(now, 7, 30).to).toBe('2026-09-10');
  });

  it('protege contra valores absurdos', () => {
    expect(collectionWindow(now, 0, -5)).toEqual({ from: '2026-09-09', to: '2026-09-10' });
  });
});

describe('isWithinWindow', () => {
  const window = { from: '2026-09-01', to: '2026-09-10' };

  it('incluye ambos extremos', () => {
    expect(isWithinWindow('2026-09-01', window)).toBe(true);
    expect(isWithinWindow('2026-09-10', window)).toBe(true);
  });

  it('excluye lo de fuera', () => {
    expect(isWithinWindow('2026-08-31', window)).toBe(false);
    expect(isWithinWindow('2026-09-11', window)).toBe(false);
  });
});

describe('utilidades de presentación', () => {
  it('isoWeekOfDate acepta una fecha en texto', () => {
    expect(isoWeekOfDate('2026-09-10')).toBe('2026-W37');
  });

  it('currentWeek usa la fecha indicada', () => {
    expect(currentWeek(new Date(2026, 8, 10))).toBe('2026-W37');
  });

  it('formatWeekLabel resume el rango de días', () => {
    expect(formatWeekLabel('2026-W37')).toBe('7–13 sep 2026');
  });

  it('formatWeekLabel muestra ambos meses cuando la semana los cruza', () => {
    expect(formatWeekLabel('2026-W40')).toBe('28 sep–4 oct 2026');
  });
});
