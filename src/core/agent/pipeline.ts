/**
 * Tubería del agente semanal (ADR-006, FR-008, FR-009).
 *
 * Ejecuta las cinco etapas en orden y construye el informe. Ninguna etapa
 * lanza hacia arriba: cada una acumula sus incidencias y la ejecución termina
 * siempre con un informe, sea `success`, `partial` o `failed`.
 */

import type { AgentRun, RunTrigger } from '../../shared/types';
import { collectionWindow } from '../domain/weeks';
import { PLATFORMS } from '../domain/platforms';
import type { AgentDeps, DiscoveredItem, PipelineContext } from './context';
import { describeError, newRunId, RunRecorder } from './report';
import { stageDiscover } from './stages/discover';
import { stageEnrich } from './stages/enrich';
import { stageRate } from './stages/rate';
import { stageTrailer } from './stages/trailer';
import { stagePersist } from './stages/persist';

export interface RunOptions {
  trigger: RunTrigger;
  /** Fuerza las plataformas a consultar, ignorando los ajustes (modo consola). */
  platformIds?: readonly string[];
  /** Sobrescribe la ventana de los ajustes (modo consola). */
  lookbackDays?: number;
  graceDays?: number;
  /** No escribe nada: sirve para probar la recopilación sin tocar el catálogo. */
  dryRun?: boolean;
}

/** Plataformas activas según los ajustes, en el orden del catálogo (FR-005). */
export function enabledPlatformIds(
  platforms: Record<string, boolean>,
  override?: readonly string[],
): string[] {
  if (override?.length) {
    const requested = new Set(override);
    return PLATFORMS.filter((platform) => requested.has(platform.id)).map((p) => p.id);
  }
  return PLATFORMS.filter((platform) => platforms[platform.id] !== false).map((p) => p.id);
}

export async function runWeeklyAgent(
  deps: AgentDeps,
  options: RunOptions,
): Promise<AgentRun> {
  const startedAt = deps.now();
  const settings = deps.settings;

  const window = collectionWindow(
    startedAt,
    options.lookbackDays ?? settings.window.lookbackDays,
    options.graceDays ?? settings.window.graceDays,
  );
  const platformIds = enabledPlatformIds(settings.platforms, options.platformIds);

  const recorder = new RunRecorder(
    newRunId(startedAt),
    options.trigger,
    startedAt,
    window,
    [...platformIds],
  );

  const ctx: PipelineContext = {
    runId: recorder.runId,
    trigger: options.trigger,
    startedAt,
    window,
    platforms: [],
    discovered: new Map<string, DiscoveredItem>(),
    titles: [],
    recorder,
  };

  deps.http.resetMetrics();

  try {
    await stageDiscover(ctx, deps, platformIds);

    if (ctx.discovered.size > 0) {
      await stageEnrich(ctx, deps);
      await stageRate(ctx, deps);
    }

    // La etapa de tráileres corre aunque no se haya descubierto nada: la
    // revalidación de enlaces (FR-019) no depende de que esta semana haya
    // estrenos, y una semana tranquila es justo cuando conviene comprobar que
    // los enlaces antiguos siguen vivos.
    await stageTrailer(ctx, deps);

    if (!options.dryRun && ctx.titles.length > 0) {
      await stagePersist(ctx, deps);
    }
  } catch (error) {
    // Red de seguridad: una etapa no debería llegar aquí, pero si lo hace, la
    // ejecución termina con informe en vez de con una excepción sin recoger.
    recorder.error('persist', 'pipeline', `Fallo inesperado: ${describeError(error)}`);
  }

  return recorder.build(deps.now(), deps.http.metrics);
}
