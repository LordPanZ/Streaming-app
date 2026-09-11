/**
 * Reconocimiento de las claves de API antes de usarlas.
 *
 * TMDB enseña **dos** credenciales en la misma página, una encima de la otra:
 *
 *   - «API Key (v3 auth)»: 32 caracteres hexadecimales. Es la que necesita esta
 *     aplicación, porque va como parámetro `api_key` en cada petición.
 *   - «API Read Access Token (v4 auth)»: un testigo largo que empieza por `eyJ`
 *     y va por cabecera de autorización. No sirve aquí.
 *
 * La segunda está más abajo, es más larga y parece la moderna, así que es la
 * que mucha gente copia. Pegada en nuestro campo produce un 401 seco que parece
 * un fallo de la aplicación. Detectarlo y decirlo cuesta veinte líneas y ahorra
 * una tarde de pelea.
 */

export type TmdbKeyKind = 'v3' | 'v4-token' | 'empty' | 'unknown';
export type OmdbKeyKind = 'plausible' | 'empty' | 'unknown';

const TMDB_V3 = /^[0-9a-f]{32}$/i;
/** Un testigo web: tres partes separadas por puntos, la primera empieza por `eyJ`. */
const JWT = /^eyJ[\w-]*\.[\w-]+\.[\w-]+$/;

export function classifyTmdbKey(key: string): TmdbKeyKind {
  const trimmed = key.trim();
  if (trimmed.length === 0) return 'empty';
  if (TMDB_V3.test(trimmed)) return 'v3';
  if (JWT.test(trimmed) || trimmed.startsWith('eyJ')) return 'v4-token';
  return 'unknown';
}

export function classifyOmdbKey(key: string): OmdbKeyKind {
  const trimmed = key.trim();
  if (trimmed.length === 0) return 'empty';
  // OMDb reparte claves cortas alfanuméricas; las suyas son de ocho caracteres.
  if (/^[0-9a-z]{6,12}$/i.test(trimmed)) return 'plausible';
  return 'unknown';
}

/**
 * Aviso para el usuario, o `null` si la clave tiene buena pinta.
 *
 * Es una pista, no una validación: si TMDB cambia el formato, lo desconocido
 * pasa igualmente y se intenta usar. Solo el testigo v4 se señala con certeza,
 * porque de ese sí sabemos que nunca va a funcionar aquí.
 */
export function tmdbKeyWarning(key: string): string | null {
  switch (classifyTmdbKey(key)) {
    case 'v4-token':
      return (
        'Eso es el «API Read Access Token (v4)». Esta aplicación necesita la ' +
        '«API Key (v3 auth)», que está más arriba en esa misma página y son 32 ' +
        'caracteres sin puntos.'
      );
    case 'unknown':
      return (
        'No parece una clave de TMDB: la v3 son 32 caracteres hexadecimales. ' +
        'Se intentará igualmente, por si han cambiado el formato.'
      );
    case 'v3':
    case 'empty':
    default:
      return null;
  }
}

export function omdbKeyWarning(key: string): string | null {
  if (classifyOmdbKey(key) === 'unknown') {
    return 'No parece una clave de OMDb, que suele ser de ocho caracteres. Se intentará igualmente.';
  }
  return null;
}
