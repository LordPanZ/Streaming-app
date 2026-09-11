/**
 * Catálogo de ejemplo (FR-051).
 *
 * Sirve para que la aplicación no esté vacía antes de configurar nada: se
 * pueden probar los filtros, la ficha y la valoración por criterios sin clave
 * de API.
 *
 * **Los títulos son inventados a propósito.** Poner películas reales con notas
 * fabricadas sería inventar datos sobre obras que existen, que es justo lo que
 * el Art. IV prohíbe. Todos llevan `sample: true`, la interfaz los marca y la
 * primera recopilación real los borra.
 */

import type { PlatformRef, Title } from '../../shared/types';
import { PLATFORMS } from './platforms';
import { buildSearchFallbackUrl } from './trailer';
import { isoWeekOfDate, toISODate, addDays } from './weeks';

/** Marca que distingue un título de ejemplo de uno real. */
export const SAMPLE_PREFIX = 'ejemplo:';

export function isSampleTitle(title: Pick<Title, 'id' | 'sample'>): boolean {
  return title.sample === true || title.id.startsWith(SAMPLE_PREFIX);
}

function platform(id: string): PlatformRef {
  const definition = PLATFORMS.find((entry) => entry.id === id);
  return {
    id,
    name: definition?.name ?? id,
    providerId: definition?.providerIdHint ?? 0,
    logoUrl: null,
    link: null,
  };
}

/**
 * Carátula generada, para no depender de la red ni de imágenes de terceros.
 * Se codifica por URL y no en base64: `encodeURIComponent` existe en todas
 * partes y ahorra implementar una tabla a mano.
 */
function poster(title: string, from: string, to: string): string {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450">',
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">',
    `<stop offset="0%" stop-color="${from}"/><stop offset="100%" stop-color="${to}"/>`,
    '</linearGradient></defs>',
    '<rect width="300" height="450" fill="url(#g)"/>',
    '<rect x="0" y="326" width="300" height="124" fill="rgba(0,0,0,0.5)"/>',
    `<text x="20" y="372" font-family="Helvetica,Arial" font-size="21" font-weight="bold" fill="#fff">${escapeXml(
      clip(title, 17),
    )}</text>`,
    '<text x="20" y="402" font-family="Helvetica,Arial" font-size="13" fill="rgba(255,255,255,0.75)">EJEMPLO</text>',
    '</svg>',
  ].join('');
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

interface SampleSpec {
  title: string;
  mediaType: Title['mediaType'];
  genres: string[];
  platforms: string[];
  imdb: number | null;
  rotten: number | null;
  metacritic: number | null;
  tmdb: number | null;
  runtime: number | null;
  seasons: number | null;
  daysAgo: number;
  colors: [string, string];
  cast: string[];
  directors: string[];
  overview: string;
}

/**
 * Diez fichas que cubren los casos que importan: con y sin notas, película y
 * serie, una plataforma y varias, y un título sin ninguna nota para que se vea
 * cómo la aplicación dice «sin datos» en lugar de inventarse un cero.
 */
const SPECS: readonly SampleSpec[] = [
  {
    title: 'El último invierno', mediaType: 'movie', genres: ['Drama', 'Suspense'],
    platforms: ['netflix'], imdb: 7.8, rotten: 88, metacritic: 68, tmdb: 7.4,
    runtime: 118, seasons: null, daysAgo: 2, colors: ['#1f3a5f', '#0b1220'],
    cast: ['Irene Balboa', 'Tomás Rivas', 'Lucía Herrán'], directors: ['Elena Vicens'],
    overview: 'Una traductora encuentra un mensaje escondido en un manuscrito que lleva cuarenta años sin abrirse.',
  },
  {
    title: 'Cuentas pendientes', mediaType: 'series', genres: ['Drama', 'Comedia'],
    platforms: ['atresplayer', 'movistar-plus'], imdb: 8.1, rotten: 92, metacritic: 74, tmdb: 8.0,
    runtime: null, seasons: 2, daysAgo: 3, colors: ['#5f1f3a', '#20050f'],
    cast: ['Ana Trueba', 'Óscar Mena'], directors: ['Nuria Calvo', 'Javier Sedano'],
    overview: 'Dos hermanos heredan una deuda que nadie les había contado y un bar que no sabían que existía.',
  },
  {
    title: 'Turno de noche', mediaType: 'movie', genres: ['Terror'],
    platforms: ['prime-video'], imdb: 6.1, rotten: 44, metacritic: null, tmdb: 6.3,
    runtime: 96, seasons: null, daysAgo: 1, colors: ['#2b1f5f', '#0d0820'],
    cast: ['Rubén Ayala'], directors: [],
    overview: 'Un vigilante de un polígono empieza a oír la misma conversación cada madrugada.',
  },
  {
    title: 'Verano en Cádiz', mediaType: 'movie', genres: ['Comedia', 'Romance'],
    platforms: ['filmin'], imdb: null, rotten: null, metacritic: null, tmdb: null,
    runtime: 104, seasons: null, daysAgo: 4, colors: ['#5f4a1f', '#201805'],
    cast: [], directors: [],
    overview: 'Sin notas de crítica todavía: así se ve un estreno muy reciente del que aún no hay nada escrito.',
  },
  {
    title: 'La órbita rota', mediaType: 'series', genres: ['Ciencia ficción', 'Suspense'],
    platforms: ['disney-plus'], imdb: 7.2, rotten: 71, metacritic: 62, tmdb: 7.1,
    runtime: null, seasons: 1, daysAgo: 0, colors: ['#1f5f52', '#052018'],
    cast: ['Miriam Solé', 'Gabriel Ndong'], directors: ['Pau Rigau'],
    overview: 'La tripulación de una estación de reciclaje orbital descubre que llevan tres años girando en falso.',
  },
  {
    title: 'Bajo la misma lluvia', mediaType: 'movie', genres: ['Drama', 'Romance'],
    platforms: ['hbo-max'], imdb: 8.4, rotten: 95, metacritic: 82, tmdb: 8.2,
    runtime: 132, seasons: null, daysAgo: 3, colors: ['#3a1f5f', '#140820'],
    cast: ['Alicia Bernat', 'Hugo Sampaio', 'Rosa Llull'], directors: ['Marcos Quiroga'],
    overview: 'Dos desconocidos comparten portal durante una tormenta y descubren que se cruzan desde hace años.',
  },
  {
    title: 'Ruido blanco', mediaType: 'series', genres: ['Documental'],
    platforms: ['netflix', 'prime-video'], imdb: 6.8, rotten: null, metacritic: null, tmdb: 6.9,
    runtime: null, seasons: 3, daysAgo: 2, colors: ['#4a4a4a', '#111111'],
    cast: [], directors: ['Ada Roldán'],
    overview: 'Tres temporadas sobre la gente que trabaja de noche en las ciudades que no duermen.',
  },
  {
    title: 'Los perros de agosto', mediaType: 'movie', genres: ['Acción', 'Suspense'],
    platforms: ['apple-tv-plus'], imdb: 7.0, rotten: 78, metacritic: 66, tmdb: 7.3,
    runtime: 111, seasons: null, daysAgo: 1, colors: ['#5f2b1f', '#200a05'],
    cast: ['Nacho Villar', 'Paula Etxeberria'], directors: ['Sonia Prats'],
    overview: 'Un transportista acepta un último viaje y descubre que la carga viaja acompañada.',
  },
  {
    title: 'Cartografía del olvido', mediaType: 'movie', genres: ['Drama'],
    platforms: ['filmin', 'movistar-plus'], imdb: 7.6, rotten: 85, metacritic: null, tmdb: 7.5,
    runtime: 97, seasons: null, daysAgo: 5, colors: ['#1f5f2b', '#052010'],
    cast: ['Berta Ferrán'], directors: ['Iñaki Otamendi'],
    overview: 'Una cartógrafa recorre los pueblos que su empresa ha decidido borrar del mapa.',
  },
  {
    title: 'Nadie sale ileso', mediaType: 'series', genres: ['Acción', 'Drama'],
    platforms: ['hbo-max'], imdb: 8.7, rotten: 96, metacritic: 88, tmdb: 8.5,
    runtime: null, seasons: 4, daysAgo: 0, colors: ['#5f1f1f', '#200505'],
    cast: ['Chema Olalla', 'Lidia Ferrer', 'Toni Blasco'], directors: ['Vera Anguita'],
    overview: 'Cuatro temporadas siguiendo a la misma comisaría desde cuatro puntos de vista distintos.',
  },
] as const;

/** Construye el catálogo de ejemplo relativo a la fecha indicada. */
export function buildSampleCatalog(now: Date = new Date()): Title[] {
  const stamp = now.toISOString();

  return SPECS.map((spec, index) => {
    const availableFrom = toISODate(addDays(now, -spec.daysAgo));
    const year = Number(availableFrom.slice(0, 4));

    return {
      id: `${SAMPLE_PREFIX}${index + 1}`,
      mediaType: spec.mediaType,
      title: spec.title,
      originalTitle: spec.title,
      year,
      overview: spec.overview,
      posterUrl: poster(spec.title, spec.colors[0], spec.colors[1]),
      backdropUrl: poster(spec.title, spec.colors[1], spec.colors[0]),
      runtimeMinutes: spec.runtime,
      seasons: spec.seasons,
      genres: spec.genres,
      platforms: spec.platforms.map(platform),
      availableFrom,
      releaseWeek: isoWeekOfDate(availableFrom),
      imdbId: null,
      ratings: {
        imdb: spec.imdb,
        rottenTomatoes: spec.rotten,
        metacritic: spec.metacritic,
        tmdb: spec.tmdb,
        imdbVotes: spec.imdb === null ? null : 1000 + index * 137,
        fetchedAt: spec.imdb === null && spec.rotten === null ? null : stamp,
      },
      // Sin tráiler asignado: los de ejemplo no apuntan a ningún vídeo real, y
      // la interfaz ofrece igualmente la búsqueda de respaldo (FR-018).
      trailer: null,
      cast: spec.cast,
      directors: spec.directors,
      sample: true,
      firstSeenAt: stamp,
      updatedAt: stamp,
    } satisfies Title;
  });
}

/** Enlace de búsqueda para un título de ejemplo, por si alguien lo pulsa. */
export function sampleSearchUrl(title: Title): string {
  return buildSearchFallbackUrl(title.title, title.year);
}
