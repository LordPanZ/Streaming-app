/**
 * Adaptador IPC de Electron (contrato `contracts/ipc.contract.md`).
 *
 * Desde ADR-012 aquí no hay lógica: se traduce cada canal a una llamada al
 * servicio de aplicación y se envuelve el resultado. Lo que decide qué pasa
 * vive en `core/app/app-service.ts`, que es lo que Android también usa.
 *
 * Lo único que sigue siendo cosa de Electron es lo que necesita al sistema:
 * los diálogos de archivo y abrir un enlace en el navegador.
 */

import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { IPC, IPC_EVENTS, ipcFail, ipcOk, type IpcResult } from '../shared/ipc';
import { ValidationError } from '../shared/validate';
import { sanitizeMessage } from '../core/providers/http';
import { InvalidBundleError } from '../core/store/transfer';
import { AgentBusyError } from '../core/app/container';
import { MissingApiKeyError, type AppEvent, type AppService } from '../core/app/app-service';

export interface IpcContext {
  service: AppService;
  getWindow: () => BrowserWindow | null;
}

/** Traduce cualquier excepción a un error del contrato, ya saneado. */
function toError(error: unknown): IpcResult<never> {
  if (error instanceof ValidationError) return ipcFail('INVALID_INPUT', error.message);
  if (error instanceof InvalidBundleError) return ipcFail('INVALID_INPUT', error.message);
  if (error instanceof AgentBusyError) return ipcFail('BUSY', error.message);
  if (error instanceof MissingApiKeyError) return ipcFail('NO_API_KEY', error.message);

  const message = error instanceof Error ? sanitizeMessage(error.message) : 'Error inesperado.';
  return ipcFail('INTERNAL', message);
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

/** Reenvía los eventos del servicio a la ventana. */
export function forwardEvents(getWindow: () => BrowserWindow | null) {
  return (event: AppEvent): void => {
    const window = getWindow();
    if (!window || window.isDestroyed()) return;

    const channel =
      event.type === 'agent:progress'
        ? IPC_EVENTS.agentProgress
        : event.type === 'agent:done'
          ? IPC_EVENTS.agentDone
          : IPC_EVENTS.catalogChanged;

    window.webContents.send(channel, event.payload);
  };
}

export function registerIpcHandlers(ctx: IpcContext): void {
  const { service } = ctx;

  handle(IPC.catalogQuery, (payload) => service.catalogQuery(payload));
  handle(IPC.catalogGet, (payload) => service.catalogGet(payload));
  handle(IPC.catalogFacets, () => service.catalogFacets());

  handle(IPC.ratingsSetWatched, (payload) => service.ratingsSetWatched(payload));
  handle(IPC.ratingsSetInterested, (payload) => service.ratingsSetInterested(payload));
  handle(IPC.ratingsSetScores, (payload) => service.ratingsSetScores(payload));
  handle(IPC.ratingsClear, (payload) => service.ratingsClear(payload));
  handle(IPC.ratingsStats, () => service.ratingsStats());

  handle(IPC.rankingTopOfYear, (payload) => service.rankingTopOfYear(payload));

  handle(IPC.agentRun, () => service.agentRun());
  handle(IPC.agentStatus, () => service.agentStatus());
  handle(IPC.agentRuns, (payload) => service.agentRuns(payload));

  handle(IPC.settingsGet, () => service.settingsGet());
  handle(IPC.settingsUpdate, (payload) => service.settingsUpdate(payload));

  handle(IPC.secretsSet, (payload) => service.secretsSet(payload));
  handle(IPC.secretsStatus, () => service.secretsStatus());
  handle(IPC.secretsVerify, (payload) => service.secretsVerify(payload));

  // --- Lo que solo sabe hacer el sistema operativo -------------------------

  handle(IPC.dataExport, async () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const result = await showSaveDialog(ctx.getWindow(), {
      title: 'Exportar mis datos',
      defaultPath: `estrenos-es-${stamp}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { path: null };

    const bundle = service.buildExport();
    await writeFile(result.filePath, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');
    return { path: result.filePath };
  });

  handle(IPC.dataImport, async (payload) => {
    const result = await showOpenDialog(ctx.getWindow(), {
      title: 'Importar datos',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    const [chosen] = result.filePaths;
    if (result.canceled || !chosen) {
      return { titlesImported: 0, ratingsImported: 0, ratingsSkipped: 0, settingsImported: false };
    }
    return service.applyImport(JSON.parse(await readFile(chosen, 'utf8')), payload);
  });

  handle(IPC.dataSamplesLoad, () => service.loadSamples());
  handle(IPC.dataSamplesClear, () => service.clearSamples());
  handle(IPC.dataWipe, () => service.dataWipe());

  handle(IPC.shellOpenExternal, async (payload) => {
    // El servicio solo deja pasar http y https (Art. VI.3).
    await shell.openExternal(service.resolveExternalUrl(payload));
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
