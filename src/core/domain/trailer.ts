/**
 * Selección del tráiler en castellano y enlace de respaldo (FR-016, FR-018).
 *
 * La decisión es pura y determinista: entra la lista de vídeos que declara la
 * fuente y sale el mejor candidato, sin tocar la red. La verificación de que el
 * enlace está vivo (FR-017) es otra cosa y vive en `providers/youtube.ts`.
 */

import type { Trailer, TrailerKind, TrailerLanguage } from '../../shared/types';
import { normalizeText } from './text';

/** Vídeo tal como lo declara TMDB (contrato §1.4). */
export interface VideoCandidate {
  key: string;
  name: string;
  site: string;
  type: string;
  official?: boolean;
  iso_639_1?: string | null;
  iso_3166_1?: string | null;
  published_at?: string | null;
  size?: number | null;
}

/**
 * Marcas inequívocas de castellano en el título del vídeo. Se usan cuando la
 * fuente no etiqueta el idioma, cosa habitual en los canales de las
 * distribuidoras españolas.
 *
 * Se comparan sin tildes, así que aquí solo pueden ir palabras que no existan
 * en inglés ni siquiera al quitarles los diacríticos.
 */
const SPANISH_NAME_HINTS = [
  'castellano',
  'español',
  'doblado',
  'subtitulado',
  'subtitulos en espanol',
  'vose',
];

/**
 * Pistas que **dependen de la tilde**: se comparan sobre el nombre en
 * minúsculas pero sin quitar diacríticos. "tráiler" es castellano; "trailer",
 * que es lo que queda al normalizarlo, es también la palabra inglesa y
 * marcaría como español cualquier "Official Trailer".
 */
const SPANISH_ACCENTED_HINTS = ['tráiler'];

export function hasSpanishNameHint(name: string): boolean {
  const normalized = normalizeText(name);
  if (SPANISH_NAME_HINTS.some((hint) => normalized.includes(normalizeText(hint)))) {
    return true;
  }
  const lowered = name.toLowerCase();
  return SPANISH_ACCENTED_HINTS.some((hint) => lowered.includes(hint));
}

function kindOf(type: string): TrailerKind | null {
  const t = type.toLowerCase();
  if (t === 'trailer') return 'trailer';
  if (t === 'teaser') return 'teaser';
  if (t === 'clip' || t === 'featurette') return 'clip';
  return null;
}

/**
 * Prioridad de un candidato. Números más altos ganan. Los tramos siguen
 * literalmente el orden de FR-016.
 */
export function candidatePriority(video: VideoCandidate): number {
  if (video.site !== 'YouTube') return -1;
  const kind = kindOf(video.type);
  if (kind === null) return -1;

  const lang = (video.iso_639_1 ?? '').toLowerCase();
  const country = (video.iso_3166_1 ?? '').toUpperCase();
  const isSpanish = lang === 'es';
  const isSpain = country === 'ES';
  const official = video.official === true;
  const nameHint = hasSpanishNameHint(video.name);

  if (isSpanish && isSpain && kind === 'trailer') return official ? 100 : 90;
  if (isSpanish && isSpain && kind === 'teaser') return official ? 80 : 75;
  if (isSpanish && kind === 'trailer') return 70;
  if (isSpanish && kind === 'teaser') return 65;
  if (nameHint && kind === 'trailer') return 60;
  if (nameHint && kind === 'teaser') return 55;
  if (kind === 'trailer') return official ? 40 : 35;
  if (kind === 'teaser') return 25;
  if (isSpanish && kind === 'clip') return 20;
  return 10;
}

function publishedTime(video: VideoCandidate): number {
  if (!video.published_at) return 0;
  const time = Date.parse(video.published_at);
  return Number.isNaN(time) ? 0 : time;
}

function languageOf(video: VideoCandidate): TrailerLanguage {
  const lang = (video.iso_639_1 ?? '').toLowerCase();
  if (lang === 'es') return 'es';
  if (hasSpanishNameHint(video.name)) return 'es';
  if (lang) return 'original';
  return 'unknown';
}

export function youtubeWatchUrl(youtubeId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(youtubeId)}`;
}

/** Búsqueda de respaldo en YouTube cuando no hay tráiler o el enlace no vive (FR-018). */
export function buildSearchFallbackUrl(title: string, year?: number | null): string {
  const terms = [title, year ? String(year) : '', 'tráiler', 'español']
    .filter(Boolean)
    .join(' ');
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(terms)}`;
}

/**
 * Elige el mejor tráiler disponible.
 *
 * Devuelve `null` si no hay ningún vídeo utilizable; en ese caso quien llama
 * debe ofrecer igualmente el enlace de búsqueda (FR-018). El `liveness` sale
 * siempre como `unverified`: marcarlo como vivo exige comprobarlo de verdad
 * (Art. IV.3 de la constitución).
 */
export function selectTrailer(
  videos: readonly VideoCandidate[],
  title: string,
  year?: number | null,
): Trailer | null {
  const ranked = videos
    .map((video) => ({ video, priority: candidatePriority(video) }))
    .filter((entry) => entry.priority > 0)
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      const timeDelta = publishedTime(b.video) - publishedTime(a.video);
      if (timeDelta !== 0) return timeDelta;
      return (b.video.size ?? 0) - (a.video.size ?? 0);
    });

  const best = ranked[0];
  if (!best) return null;

  return {
    youtubeId: best.video.key,
    url: youtubeWatchUrl(best.video.key),
    title: best.video.name,
    language: languageOf(best.video),
    kind: kindOf(best.video.type) ?? 'clip',
    liveness: 'unverified',
    checkedAt: null,
    searchFallbackUrl: buildSearchFallbackUrl(title, year),
  };
}

/** ¿Hay que revalidar este tráiler en esta ejecución? (FR-019) */
export function needsRevalidation(
  trailer: Trailer | null,
  releaseWeek: string,
  recentWeeks: readonly string[],
): boolean {
  if (!trailer) return false;
  if (trailer.liveness === 'unverified') return true;
  return recentWeeks.includes(releaseWeek);
}
