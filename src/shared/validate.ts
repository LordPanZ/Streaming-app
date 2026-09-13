/**
 * Validación de todo lo que cruza la frontera IPC (NFR-008, Art. VI.2).
 *
 * El renderizador no es de fiar por definición: aunque hoy lo escribamos
 * nosotros, es el único punto de la aplicación expuesto a contenido web. Nada
 * llega al dominio ni al almacén sin pasar por aquí.
 *
 * Módulo puro y sin dependencias: se prueba sin arrancar Electron.
 */

import { MAX_PAGE_SIZE } from '../core/domain/filters';
import type {
  CatalogQuery,
  MediaType,
  RatingCriterion,
  Settings,
  SortField,
  SortOrder,
  WatchStatusFilter,
} from './types';
import type {
  ImportInput,
  RankingInput,
  SetInterestedInput,
  SetScoresInput,
  SetSecretsInput,
  SetWatchedInput,
  VerifySecretInput,
} from './ipc';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

function fail(message: string): never {
  throw new ValidationError(message);
}

function asObject(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(`${what} debe ser un objeto.`);
  }
  return value as Record<string, unknown>;
}

function optionalString(value: unknown, what: string, maxLength = 500): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') fail(`${what} debe ser texto.`);
  if (value.length > maxLength) fail(`${what} supera los ${maxLength} caracteres.`);
  return value;
}

function optionalStringArray(value: unknown, what: string, maxItems = 50): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) fail(`${what} debe ser una lista.`);
  if (value.length > maxItems) fail(`${what} tiene demasiados elementos.`);
  return value.map((entry, index) => {
    if (typeof entry !== 'string') fail(`${what}[${index}] debe ser texto.`);
    return entry;
  });
}

function optionalBoolean(value: unknown, what: string): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'boolean') fail(`${what} debe ser verdadero o falso.`);
  return value;
}

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  what: string,
): T | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    fail(`${what} debe ser uno de: ${allowed.join(', ')}.`);
  }
  return value as T;
}

/**
 * Caracteres de control: no tienen cabida en un identificador. Rechazarlos es
 * justo el propósito de esta expresión, así que la regla que los prohíbe en
 * expresiones regulares no aplica aquí.
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/** Identificador de título: no vacío, acotado y sin caracteres de control. */
export function parseTitleId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail('El identificador de título es obligatorio.');
  }
  if (value.length > 200) fail('El identificador de título es demasiado largo.');
  if (CONTROL_CHARS.test(value)) fail('El identificador de título no es válido.');
  return value;
}

const MEDIA_TYPES = ['movie', 'series', 'all'] as const;
/** Estados que admite una consulta. Es contrato: las pruebas afirman sobre él. */
export const STATUSES = ['all', 'watched', 'pending', 'rated', 'interested'] as const;
const SORT_FIELDS = ['date', 'critic', 'personal', 'title'] as const;
const SORT_ORDERS = ['asc', 'desc'] as const;

/**
 * Cobertura de las listas anteriores, comprobada por el compilador.
 *
 * Existe por un fallo real y caro: `WatchStatusFilter` ganó el valor
 * `'interested'` para la sección «Me interesa», esta lista se quedó sin él, y
 * la consulta de la sección pasó a fallar la validación. Como la interfaz
 * conservaba los resultados anteriores al fallar, en pantalla no se veía un
 * error sino el catálogo entero: parecía que el filtro no filtraba.
 *
 * Declarar la lista como `readonly WatchStatusFilter[]` no ayudaba: un
 * subconjunto también encaja en ese tipo, así que el compilador no tenía nada
 * que objetar. Esto sí: si la unión gana un valor que no esté en su lista, la
 * compilación falla **nombrando el valor que falta**.
 */
type Missing<Union, List extends readonly unknown[]> = Exclude<Union, List[number]>;
type Covered<Union, List extends readonly unknown[]> =
  Missing<Union, List> extends never ? true : Missing<Union, List>;

const _listasCompletas: [
  Covered<MediaType | 'all', typeof MEDIA_TYPES>,
  Covered<WatchStatusFilter, typeof STATUSES>,
  Covered<SortField, typeof SORT_FIELDS>,
  Covered<SortOrder, typeof SORT_ORDERS>,
] = [true, true, true, true];

export function parseCatalogQuery(input: unknown): CatalogQuery {
  const raw = asObject(input ?? {}, 'La consulta');
  const query: CatalogQuery = {};

  const text = optionalString(raw.text, 'El texto de búsqueda', 200);
  if (text !== undefined) query.text = text;

  const mediaType = oneOf(raw.mediaType, MEDIA_TYPES, 'El tipo');
  if (mediaType !== undefined) query.mediaType = mediaType;

  const platforms = optionalStringArray(raw.platforms, 'Las plataformas');
  if (platforms !== undefined) query.platforms = platforms;

  const genres = optionalStringArray(raw.genres, 'Los géneros');
  if (genres !== undefined) query.genres = genres;

  const week = optionalString(raw.week, 'La semana', 20);
  if (week !== undefined) {
    if (week !== 'current' && week !== 'all' && !/^\d{4}-W\d{2}$/.test(week)) {
      fail('La semana debe tener el formato AAAA-Wss, «current» o «all».');
    }
    query.week = week;
  }

  if (raw.minCritic !== undefined && raw.minCritic !== null) {
    if (typeof raw.minCritic !== 'number' || !Number.isFinite(raw.minCritic)) {
      fail('La nota mínima debe ser un número.');
    }
    query.minCritic = Math.min(10, Math.max(0, raw.minCritic));
  }

  const includeUnrated = optionalBoolean(raw.includeUnrated, 'La inclusión de los no puntuados');
  if (includeUnrated !== undefined) query.includeUnrated = includeUnrated;

  const excludeAnimation = optionalBoolean(raw.excludeAnimation, 'La exclusión de la animación');
  if (excludeAnimation !== undefined) query.excludeAnimation = excludeAnimation;

  const status = oneOf(raw.status, STATUSES, 'El estado');
  if (status !== undefined) query.status = status;

  const sort = oneOf(raw.sort, SORT_FIELDS, 'El campo de ordenación');
  if (sort !== undefined) query.sort = sort;

  const order = oneOf(raw.order, SORT_ORDERS, 'El sentido de ordenación');
  if (order !== undefined) query.order = order;

  if (raw.offset !== undefined && raw.offset !== null) {
    if (typeof raw.offset !== 'number' || !Number.isFinite(raw.offset) || raw.offset < 0) {
      fail('El desplazamiento debe ser un número positivo.');
    }
    query.offset = Math.floor(raw.offset);
  }

  if (raw.limit !== undefined && raw.limit !== null) {
    if (typeof raw.limit !== 'number' || !Number.isFinite(raw.limit) || raw.limit <= 0) {
      fail('El tamaño de página debe ser un número positivo.');
    }
    // Se recorta en vez de rechazar: el contrato promete un máximo, no un error.
    query.limit = Math.min(MAX_PAGE_SIZE, Math.floor(raw.limit));
  }

  return query;
}

export function parseSetWatched(input: unknown): SetWatchedInput {
  const raw = asObject(input, 'La orden');
  const watched = optionalBoolean(raw.watched, 'El estado de visionado');
  if (watched === undefined) fail('Falta indicar si está visto.');

  const watchedAt = optionalString(raw.watchedAt, 'La fecha de visionado', 40);
  if (watchedAt !== undefined && Number.isNaN(Date.parse(watchedAt))) {
    fail('La fecha de visionado no es válida.');
  }

  return {
    titleId: parseTitleId(raw.titleId),
    watched,
    watchedAt: watchedAt ?? null,
    platform: optionalString(raw.platform, 'La plataforma', 60) ?? null,
  };
}

/**
 * Año y tope de la clasificación (FR-058).
 *
 * El año se acota a un rango con sentido para el cine: pedirle a TMDB el año
 * 99999 no devuelve nada útil y gasta una petición igual.
 */
export function parseRankingInput(input: unknown): RankingInput {
  const raw = asObject(input, 'La orden');
  const year = raw.year;
  if (typeof year !== 'number' || !Number.isInteger(year) || year < 1900 || year > 2100) {
    fail('El año debe ser un número entre 1900 y 2100.');
  }

  const limit = raw.limit;
  if (limit === undefined || limit === null) return { year };
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0) {
    fail('El tope debe ser un número positivo.');
  }
  return { year, limit: Math.min(50, Math.floor(limit)) };
}

export function parseSetInterested(input: unknown): SetInterestedInput {
  const raw = asObject(input, 'La orden');
  const interested = optionalBoolean(raw.interested, 'El interés');
  if (interested === undefined) fail('Falta indicar si interesa.');
  return { titleId: parseTitleId(raw.titleId), interested };
}

/**
 * Las puntuaciones se validan contra los criterios vigentes: lo desconocido y
 * lo que no es un número se descarta, y el resto se ajusta al paso válido.
 *
 * El saneador entra inyectado para que este módulo siga sin depender del
 * dominio de criterios y se pueda probar aislado.
 */
export function parseSetScores(
  input: unknown,
  criteria: readonly RatingCriterion[],
  sanitize: (
    scores: Record<string, unknown>,
    criteria: readonly RatingCriterion[],
  ) => Record<string, number>,
): SetScoresInput {
  const raw = asObject(input, 'La valoración');
  const scores = asObject(raw.scores ?? {}, 'Las puntuaciones');
  if (Object.keys(scores).length > 100) fail('Demasiadas puntuaciones.');

  return {
    titleId: parseTitleId(raw.titleId),
    scores: sanitize(scores, criteria),
    notes: optionalString(raw.notes, 'El comentario', 5000) ?? '',
  };
}

/**
 * Comprueba la forma del parche de ajustes. El recorte fino de rangos lo hace
 * `sanitizeSettings` justo después: aquí solo se impide que llegue basura
 * estructural (una lista donde va un objeto, mil criterios, etc.).
 */
export function parseSettingsPatch(input: unknown): Partial<Settings> {
  const raw = asObject(input, 'Los ajustes');
  const patch: Partial<Settings> = {};

  if (raw.schedule !== undefined) {
    patch.schedule = asObject(raw.schedule, 'El calendario') as unknown as Settings['schedule'];
  }
  if (raw.window !== undefined) {
    patch.window = asObject(raw.window, 'La ventana temporal') as unknown as Settings['window'];
  }
  if (raw.platforms !== undefined) {
    patch.platforms = asObject(raw.platforms, 'Las plataformas') as Settings['platforms'];
  }
  if (raw.criteria !== undefined) {
    if (!Array.isArray(raw.criteria)) fail('Los criterios deben ser una lista.');
    if (raw.criteria.length > 50) fail('Demasiados criterios.');
    patch.criteria = raw.criteria as Settings['criteria'];
  }
  if (raw.revalidateTrailerWeeks !== undefined) {
    patch.revalidateTrailerWeeks = raw.revalidateTrailerWeeks as number;
  }
  if (raw.cacheTtlHours !== undefined) {
    patch.cacheTtlHours = raw.cacheTtlHours as number;
  }
  if (raw.quality !== undefined) {
    patch.quality = asObject(raw.quality, 'El listón de calidad') as unknown as Settings['quality'];
  }

  return patch;
}

export function parseSecrets(input: unknown): SetSecretsInput {
  const raw = asObject(input, 'Las claves');
  const result: SetSecretsInput = {};

  for (const which of ['tmdb', 'omdb'] as const) {
    const value = raw[which];
    if (value === undefined) continue;
    if (typeof value !== 'string') fail(`La clave de ${which.toUpperCase()} debe ser texto.`);
    const trimmed = value.trim();
    if (trimmed.length > 200) fail(`La clave de ${which.toUpperCase()} es demasiado larga.`);
    result[which] = trimmed;
  }

  if (result.tmdb === undefined && result.omdb === undefined) {
    fail('No se ha indicado ninguna clave.');
  }
  return result;
}

export function parseVerifySecret(input: unknown): VerifySecretInput {
  const raw = asObject(input, 'La orden');
  const which = oneOf(raw.which, ['tmdb', 'omdb'] as const, 'El servicio');
  if (which === undefined) fail('Falta indicar el servicio.');
  return { which };
}

export function parseImportInput(input: unknown): ImportInput {
  const raw = asObject(input ?? {}, 'La orden de importación');
  return { overwriteRatings: optionalBoolean(raw.overwriteRatings, 'La confirmación') ?? false };
}

/**
 * URL para abrir en el navegador del sistema (Art. VI.3).
 *
 * Solo `http:` y `https:`. Se rechaza `file:`, `javascript:`, `data:` y
 * cualquier otro esquema: abrir uno de esos con el manejador del sistema es
 * ejecución de código, no navegación.
 */
export function parseExternalUrl(input: unknown): string {
  const raw = typeof input === 'string' ? input : asObject(input, 'La orden').url;
  if (typeof raw !== 'string' || raw.length === 0) fail('Falta la dirección.');
  if (raw.length > 2000) fail('La dirección es demasiado larga.');

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    fail('La dirección no es válida.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    fail('Solo se pueden abrir direcciones http y https.');
  }
  return parsed.toString();
}

export function parseRunsLimit(input: unknown): number {
  const fallback = 20;
  if (input === undefined || input === null) return fallback;
  if (typeof input === 'number') {
    return Number.isFinite(input) && input > 0 ? Math.min(50, Math.floor(input)) : fallback;
  }
  const raw = asObject(input, 'La orden');
  if (typeof raw.limit === 'number' && Number.isFinite(raw.limit) && raw.limit > 0) {
    return Math.min(50, Math.floor(raw.limit));
  }
  return fallback;
}
