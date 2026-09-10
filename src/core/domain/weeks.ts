/**
 * Semanas ISO 8601 y ventanas temporales de recopilación (FR-004, FR-011).
 *
 * Todo se calcula sobre fechas civiles (año-mes-día), no sobre instantes: un
 * estreno pertenece a un día, no a una hora, y así el resultado no cambia según
 * el huso horario de quien ejecuta el agente.
 */

/** `YYYY-MM-DD` a partir de un `Date`, en hora local. */
export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** `Date` local a medianoche a partir de `YYYY-MM-DD`. */
export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
}

/**
 * Semana ISO de una fecha, en formato `YYYY-Www`.
 *
 * ISO 8601: la semana empieza en lunes y la semana 1 es la que contiene el
 * primer jueves del año. El truco del jueves evita los casos de borde de fin de
 * año, donde el 31 de diciembre puede pertenecer a la semana 1 del año siguiente.
 */
export function isoWeek(date: Date): string {
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  // Día ISO: lunes = 1 … domingo = 7
  const dayNumber = (target.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNumber + 3); // jueves de esta semana ISO
  const isoYear = target.getFullYear();
  const firstThursday = new Date(isoYear, 0, 4);
  const firstDayNumber = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDayNumber + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

/** Semana ISO de una fecha en formato `YYYY-MM-DD`. */
export function isoWeekOfDate(iso: string): string {
  return isoWeek(fromISODate(iso));
}

/** Semana ISO en curso. */
export function currentWeek(now: Date = new Date()): string {
  return isoWeek(now);
}

/** Lunes de la semana ISO indicada. */
export function startOfIsoWeek(week: string): Date {
  const match = /^(\d{4})-W(\d{2})$/.exec(week);
  if (!match) throw new Error(`Semana ISO no válida: ${week}`);
  const year = Number(match[1]);
  const weekNumber = Number(match[2]);
  const jan4 = new Date(year, 0, 4);
  const jan4DayNumber = (jan4.getDay() + 6) % 7;
  const week1Monday = new Date(year, 0, 4 - jan4DayNumber);
  return addDays(week1Monday, (weekNumber - 1) * 7);
}

/** Las `count` semanas ISO anteriores a `week`, incluida ella, de más nueva a más vieja. */
export function previousWeeks(week: string, count: number): string[] {
  const monday = startOfIsoWeek(week);
  const weeks: string[] = [];
  for (let i = 0; i < count; i += 1) {
    weeks.push(isoWeek(addDays(monday, -7 * i)));
  }
  return weeks;
}

export interface DateWindow {
  /** `YYYY-MM-DD` inclusivo. */
  from: string;
  /** `YYYY-MM-DD` inclusivo. */
  to: string;
}

/**
 * Ventana de estrenos a consultar (FR-004).
 *
 * Mira `lookbackDays` hacia atrás desde hoy, y añade `graceDays` **también hacia
 * atrás**: las plataformas dan de alta títulos con retraso, así que la gracia
 * sirve para recoger lo que se publicó tarde, no para adivinar el futuro.
 */
export function collectionWindow(
  now: Date,
  lookbackDays: number,
  graceDays: number,
): DateWindow {
  const safeLookback = Math.max(1, Math.floor(lookbackDays));
  const safeGrace = Math.max(0, Math.floor(graceDays));
  return {
    from: toISODate(addDays(now, -(safeLookback + safeGrace))),
    to: toISODate(now),
  };
}

/** ¿Cae `isoDate` dentro de la ventana, con ambos extremos incluidos? */
export function isWithinWindow(isoDate: string, range: DateWindow): boolean {
  return isoDate >= range.from && isoDate <= range.to;
}

/** Etiqueta legible de una semana ISO: `2026-W37` → `8–14 sep 2026`. */
export function formatWeekLabel(week: string): string {
  const monday = startOfIsoWeek(week);
  const sunday = addDays(monday, 6);
  const months = [
    'ene', 'feb', 'mar', 'abr', 'may', 'jun',
    'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
  ];
  const sameMonth = monday.getMonth() === sunday.getMonth();
  const left = sameMonth
    ? `${monday.getDate()}`
    : `${monday.getDate()} ${months[monday.getMonth()]}`;
  return `${left}–${sunday.getDate()} ${months[sunday.getMonth()]} ${sunday.getFullYear()}`;
}
