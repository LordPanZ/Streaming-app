/**
 * Enlaces a la ficha del título dentro de cada plataforma (FR-056).
 *
 * Aquí hay que ser honesto sobre lo que se puede y lo que no (Art. IV):
 *
 * **No existe el enlace directo.** TMDB da un único `link` por región —una
 * página suya que lista dónde ver el título— y ese mismo enlace viene repetido
 * para todas las plataformas. No hay en la respuesta nada parecido a «la URL de
 * esta película en Netflix», y las plataformas no publican un esquema que se
 * pueda derivar de un identificador de TMDB.
 *
 * **Lo que sí se puede.** Llevar al usuario a la búsqueda de la plataforma con
 * el título ya escrito. Es un clic más, pero acaba en el sitio correcto y no
 * miente sobre lo que es: el botón dice «Buscar en», igual que el respaldo del
 * tráiler dice «Buscar tráiler» cuando no hay enlace verificado (FR-018).
 *
 * **Lo que no se ha podido comprobar.** Estos patrones no se han probado contra
 * los servidores de cada plataforma: el inventario de destinos de red está
 * cerrado a cuatro anfitriones (ADR-010) y ninguna de estas lo es. Van
 * declarados con el nivel de certeza de cada uno, y donde no lo hay se abre la
 * página principal, que sí es estable, en lugar de inventarse una ruta.
 */

/** Cómo se llega al título dentro de la plataforma. */
export type PlatformLinkKind =
  /** La plataforma tiene buscador con el término en la URL. */
  | 'search'
  /** No se conoce una ruta de búsqueda fiable: se abre la portada. */
  | 'home';

export interface PlatformLink {
  kind: PlatformLinkKind;
  url: string;
  /** Texto del botón, ya redactado según lo que el enlace realmente hace. */
  label: string;
}

interface PlatformUrls {
  /** Portada. Siempre presente: es lo único que se puede dar por estable. */
  home: string;
  /**
   * Prefijo de búsqueda al que se le concatena el término codificado.
   * Ausente cuando no se conoce una ruta fiable.
   */
  searchPrefix?: string;
}

/**
 * Direcciones por plataforma para España.
 *
 * Se separan del catálogo de `platforms.ts` a propósito: aquello son datos del
 * dominio (identificadores, alias, color), esto son direcciones de terceros que
 * cambian sin avisar y que conviene poder corregir de una línea.
 */
const URLS: Readonly<Record<string, PlatformUrls>> = {
  netflix: {
    home: 'https://www.netflix.com/es/',
    searchPrefix: 'https://www.netflix.com/search?q=',
  },
  'prime-video': {
    home: 'https://www.primevideo.com/',
    searchPrefix: 'https://www.primevideo.com/search/?phrase=',
  },
  'disney-plus': {
    home: 'https://www.disneyplus.com/es-es',
    searchPrefix: 'https://www.disneyplus.com/search?q=',
  },
  'hbo-max': { home: 'https://play.max.com/' },
  'movistar-plus': { home: 'https://ver.movistarplus.es/' },
  'apple-tv-plus': {
    home: 'https://tv.apple.com/es',
    searchPrefix: 'https://tv.apple.com/search?term=',
  },
  skyshowtime: { home: 'https://www.skyshowtime.com/es' },
  filmin: { home: 'https://www.filmin.es/', searchPrefix: 'https://www.filmin.es/buscar?q=' },
  crunchyroll: {
    home: 'https://www.crunchyroll.com/es/',
    searchPrefix: 'https://www.crunchyroll.com/search?q=',
  },
  atresplayer: { home: 'https://www.atresplayer.com/' },
  'rakuten-tv': { home: 'https://rakuten.tv/es' },
  'pluto-tv': { home: 'https://pluto.tv/es' },
};

/**
 * Enlace a un título dentro de una plataforma.
 *
 * Devuelve `null` para una plataforma desconocida en vez de inventarse una
 * dirección: si mañana aparece una nueva, el botón no sale hasta que alguien
 * añada su dirección aquí.
 */
export function platformLink(
  platformId: string,
  platformName: string,
  titleName: string,
): PlatformLink | null {
  const urls = URLS[platformId];
  if (!urls) return null;

  if (urls.searchPrefix) {
    return {
      kind: 'search',
      url: `${urls.searchPrefix}${encodeURIComponent(titleName)}`,
      label: `Buscar en ${platformName}`,
    };
  }

  return { kind: 'home', url: urls.home, label: `Abrir ${platformName}` };
}

/** Identificadores con dirección conocida. Sirve para probar la cobertura. */
export function platformsWithLinks(): string[] {
  return Object.keys(URLS).sort();
}
