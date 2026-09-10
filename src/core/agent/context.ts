/**
 * Estado compartido por las etapas de la tubería (ADR-006) y las dependencias
 * que necesitan. Vive en su propio archivo para que las etapas no se importen
 * unas a otras y el orden siga siendo cosa de `pipeline.ts`.
 */

import type { AgentProgress, MediaType, PlatformRef, RunTrigger, Settings, Title } from '../../shared/types';
import type { ResolvedPlatform } from '../domain/platforms';
import type { DateWindow } from '../domain/weeks';
import type { OmdbClient } from '../providers/omdb';
import type { TmdbClient } from '../providers/tmdb';
import type { YoutubeVerifier } from '../providers/youtube';
import type { HttpClient } from '../providers/http';
import type { CatalogStore } from '../store/catalog';
import type { RunRecorder } from './report';

/** Un título hallado en el descubrimiento, aún sin enriquecer. */
export interface DiscoveredItem {
  key: string;
  mediaType: MediaType;
  tmdbId: number;
  /** Plataformas en las que se descubrió, para usarlas de respaldo. */
  platforms: PlatformRef[];
  /** Nota de TMDB tal como llegó en el descubrimiento. */
  voteAverage: number | null;
  voteCount: number | null;
}

export interface AgentDeps {
  /** `null` cuando falta la clave: la ejecución fallará explícitamente. */
  tmdb: TmdbClient | null;
  /** `null` cuando falta la clave: se recopila sin notas de crítica. */
  omdb: OmdbClient | null;
  youtube: YoutubeVerifier;
  http: HttpClient;
  catalog: CatalogStore;
  settings: Settings;
  now: () => Date;
  onProgress?: (progress: AgentProgress) => void;
  /** Tope de revalidaciones de tráiler por ejecución (FR-019). */
  maxRevalidations?: number;
}

export interface PipelineContext {
  runId: string;
  trigger: RunTrigger;
  startedAt: Date;
  window: DateWindow;
  platforms: ResolvedPlatform[];
  discovered: Map<string, DiscoveredItem>;
  titles: Title[];
  recorder: RunRecorder;
}

export function discoveryKey(mediaType: MediaType, tmdbId: number): string {
  return `${mediaType}:${tmdbId}`;
}
