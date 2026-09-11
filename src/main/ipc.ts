/**
 * Manejadores IPC (contrato `contracts/ipc.contract.md`).
 *
 * Cada manejador valida su entrada antes de tocar el dominio (NFR-008) y
 * devuelve siempre una envoltura `IpcResult`: el renderizador nunca ve una
 * excepción cruda ni un mensaje con claves dentro (NFR-009).
 */

import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import type {
  AgentProgress,
  AgentRunSummary,
  AgentStatus,
} from '../shared/types';
import {
  IPC,
  IPC_EVENTS,
  ipcFail,
  ipcOk,
  type IpcErrorCode,
  type IpcResult,
} from '../shared/ipc';
import {
  parseCatalogQuery,
  parseExternalUrl,
  parseImportInput,
  parseRunsLimit,
  parseSecrets,
  parseSetScores,
  parseSetWatched,
  parseSettingsPatch,
  parseTitleId,
  parseVerifySecret,
  ValidationError,
} from '../shared/validate';
import { sanitizeScores } from '../core/domain/criteria';
import { sanitizeMessage } from '../core/providers/http';
import { summarize } from '../core/store/runs';
import {
  applyBundle,
  buildExportBundle,
  InvalidBundleError,
  parseBundle,
  wipeAll,
} from '../core/store/transfer';
import { AgentBusyError, type AppContainer } from './container';
import type { SecretsManager } from './secrets';

export interface IpcContext {
  container: AppContainer;
  secrets: SecretsManager;
  appVersion: string;
  getWindow: () => BrowserWindow | null;
}

/** Falta una clave de API sin la que la operación no tiene sentido (FR-042). */
class MissingApiKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissingApiKeyError';
  }
}

/** Traduce cualquier excepción a un error del contrato, ya saneado. */
function toError(error: unknown): IpcResult<never> {
  if (error instanceof ValidationError) return ipcFail('INVALID_INPUT', error.message);
  if (error instanceof InvalidBundleError) return ipcFail('INVALID_INPUT', error.message);
  if (error instanceof AgentBusyError) return ipcFail('BUSY', error.message);
  if (error instanceof MissingApiKeyError) return ipcFail('NO_API_KEY', error.message);

  const code: IpcErrorCode = 'INTERNAL';
  const message = error instanceof Error ? sanitizeMessage(error.message) : 'Error inesperado.';
  return ipcFail(code, message);
}

/** Envuelve un manejador para que nunca lance hacia el canal IPC. */
function handle<T>(channel: string, run: (payload: unknown) => Promise<T> | T): void {
  ipcMain.handle(channel, async (_event, payload: unknown): Promise<IpcResult<T>> => {
    try {
      return ipcOk(await run(payload));
    } catch (error) {
      return toError(error);
    }
  });
}

export function registerIpcHandlers(ctx: IpcContext): void {
  const { container, secrets } = ctx;

  const emit = (channel: string, payload: unknown): void => {
    const window = ctx.getWindow();
    if (window && !window.isDestroyed()) {
      window.webContents.send(channel, payload);
    }
  };

  // --- Catálogo ------------------------------------------------------------

  handle(IPC.catalogQuery, (payload) => container.service.query(parseCatalogQuery(payload)));

  handle(IPC.catalogGet, (payload) => {
    const id = parseTitleId(typeof payload === 'string' ? payload : (payload as { id?: unknown })?.id);
    return container.service.get(id);
  });

  handle(IPC.catalogFacets, () => container.service.facets());

  // --- Valoraciones --------------------------------------------------------

  handle(IPC.ratingsSetWatched, async (payload) => {
    const input = parseSetWatched(payload);
    const rating = await container.ratings.setWatched(input.titleId, input.watched, {
      watchedAt: input.watchedAt ?? null,
      platform: input.platform ?? null,
    });
    emit(IPC_EVENTS.catalogChanged, { reason: 'rating' });
    return rating;
  });

  handle(IPC.ratingsSetScores, async (payload) => {
    const input = parseSetScores(payload, container.settings.get().criteria, sanitizeScores);
    const rating = await container.ratings.setScores(input.titleId, input.scores, input.notes);
    emit(IPC_EVENTS.catalogChanged, { reason: 'rating' });
    return rating;
  });

  handle(IPC.ratingsClear, async (payload) => {
    const id = parseTitleId(typeof payload === 'string' ? payload : (payload as { titleId?: unknown })?.titleId);
    await container.ratings.clear(id);
    emit(IPC_EVENTS.catalogChanged, { reason: 'rating' });
    return { ok: true as const };
  });

  handle(IPC.ratingsStats, () => container.service.stats());

  // --- Agente --------------------------------------------------------------

  handle(IPC.agentRun, async (): Promise<AgentRunSummary> => {
    if (!container.hasKeys()) {
      throw new MissingApiKeyError(
        'Falta la clave de API de TMDB. Configúrala en Ajustes para poder recopilar.',
      );
    }

    const onProgress = (progress: AgentProgress) => emit(IPC_EVENTS.agentProgress, progress);
    const run = await container.runAgent({ trigger: 'manual' }, onProgress);
    const summary = summarize(run);

    emit(IPC_EVENTS.agentDone, summary);
    emit(IPC_EVENTS.catalogChanged, { reason: 'agent' });
    return summary;
  });

  handle(IPC.agentStatus, (): AgentStatus => {
    const schedule = container.settings.get().schedule;
    const last = container.runs.last();
    return {
      running: container.isRunning,
      currentStage: null,
      lastRunAt: schedule.lastRunAt,
      nextRunAt: schedule.nextRunAt,
      lastStatus: last?.status ?? null,
      hasKeys: container.hasKeys(),
    };
  });

  handle(IPC.agentRuns, (payload) => container.runs.list(parseRunsLimit(payload)));

  // --- Ajustes -------------------------------------------------------------

  handle(IPC.settingsGet, () => container.settings.get());

  handle(IPC.settingsUpdate, async (payload) => {
    const patch = parseSettingsPatch(payload);
    const updated = await container.settings.update(patch);

    // Cambiar día u hora reprograma el próximo vencimiento (FR-001).
    if (patch.schedule) {
      const { ensureScheduled } = await import('../core/agent/scheduler');
      const rescheduled = ensureScheduled(
        { ...updated.schedule, nextRunAt: null },
        new Date(),
      );
      return container.settings.update({ schedule: rescheduled });
    }
    return updated;
  });

  // --- Claves --------------------------------------------------------------

  handle(IPC.secretsSet, async (payload) => {
    await secrets.set(parseSecrets(payload));
    return secrets.status();
  });

  handle(IPC.secretsStatus, () => secrets.status());

  handle(IPC.secretsVerify, async (payload) => {
    const { which } = parseVerifySecret(payload);
    const settings = container.settings.get();
    const client = which === 'tmdb' ? container.tmdb(settings) : container.omdb(settings);
    if (!client) {
      return { ok: false, message: `No hay ninguna clave de ${which.toUpperCase()} guardada.` };
    }
    const result = await client.verifyKey();
    return { ok: result.ok, message: sanitizeMessage(result.message) };
  });

  // --- Datos ---------------------------------------------------------------

  handle(IPC.dataExport, async () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const result = await showSaveDialog(ctx.getWindow(), {
      title: 'Exportar mis datos',
      defaultPath: `estrenos-es-${stamp}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { path: null };

    const bundle = buildExportBundle(
      {
        catalog: container.catalog,
        ratings: container.ratings,
        settings: container.settings,
        runs: container.runs,
      },
      ctx.appVersion,
    );
    await writeFile(result.filePath, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');
    return { path: result.filePath };
  });

  handle(IPC.dataImport, async (payload) => {
    const { overwriteRatings } = parseImportInput(payload);
    const result = await showOpenDialog(ctx.getWindow(), {
      title: 'Importar datos',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    const [chosen] = result.filePaths;
    if (result.canceled || !chosen) {
      return { titlesImported: 0, ratingsImported: 0, ratingsSkipped: 0, settingsImported: false };
    }

    const bundle = parseBundle(JSON.parse(await readFile(chosen, 'utf8')));
    const outcome = await applyBundle(
      {
        catalog: container.catalog,
        ratings: container.ratings,
        settings: container.settings,
        runs: container.runs,
      },
      bundle,
      overwriteRatings,
    );
    emit(IPC_EVENTS.catalogChanged, { reason: 'import' });
    return outcome;
  });

  handle(IPC.dataWipe, async () => {
    await wipeAll({
      catalog: container.catalog,
      ratings: container.ratings,
      settings: container.settings,
      runs: container.runs,
    });
    await secrets.wipe();
    container.cache.clear();
    await container.saveCache();
    emit(IPC_EVENTS.catalogChanged, { reason: 'wipe' });
    return { ok: true as const };
  });

  // --- Sistema -------------------------------------------------------------

  handle(IPC.shellOpenExternal, async (payload) => {
    // `parseExternalUrl` solo deja pasar http y https (Art. VI.3).
    await shell.openExternal(parseExternalUrl(payload));
    return { opened: true };
  });
}

/**
 * Los diálogos del sistema aceptan ventana padre o ninguna. Se separan aquí
 * para que los manejadores no tengan que lidiar con las dos sobrecargas.
 */
function showSaveDialog(
  window: BrowserWindow | null,
  options: Electron.SaveDialogOptions,
): Promise<Electron.SaveDialogReturnValue> {
  return window ? dialog.showSaveDialog(window, options) : dialog.showSaveDialog(options);
}

function showOpenDialog(
  window: BrowserWindow | null,
  options: Electron.OpenDialogOptions,
): Promise<Electron.OpenDialogReturnValue> {
  return window ? dialog.showOpenDialog(window, options) : dialog.showOpenDialog(options);
}

/** Retira los manejadores. Necesario para poder reiniciar limpio en pruebas. */
export function unregisterIpcHandlers(): void {
  for (const channel of Object.values(IPC)) {
    ipcMain.removeHandler(channel);
  }
}
