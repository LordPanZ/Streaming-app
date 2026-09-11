/**
 * Proceso principal: ciclo de vida, ventana segura y planificador (NFR-007,
 * FR-001, FR-002, FR-003).
 */

import { app, BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import { IPC_EVENTS } from '../shared/ipc';
import { summarize } from '../core/store/runs';
import { CHECK_INTERVAL_MS } from '../core/agent/scheduler';
import { AppContainer } from './container';
import { registerIpcHandlers } from './ipc';
import { SecretsManager } from './secrets';
import { DATA_FOLDER, resolvePaths } from './paths';

/**
 * Ruta de datos fijada antes de nada: sin esto, Electron la deduce del nombre
 * de la aplicación y cambia entre desarrollo y empaquetado. Tiene que ocurrir
 * al cargar el módulo, antes de que nadie la lea, o Electron habrá creado ya su
 * directorio por defecto.
 */
app.setPath('userData', join(app.getPath('appData'), 'estrenos-es'));

const isDevelopment = !app.isPackaged;
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5273';

let mainWindow: BrowserWindow | null = null;
let container: AppContainer | null = null;
let scheduleTimer: NodeJS.Timeout | null = null;

/**
 * Ventana con el renderizador aislado del sistema (Art. VI.1).
 * `nodeIntegration: false`, `contextIsolation: true` y `sandbox: true` no son
 * negociables: sin ellas, una inyección en la interfaz sería acceso al equipo.
 */
function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0d0f14',
    title: 'Estrenos ES',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  window.once('ready-to-show', () => window.show());

  // Toda navegación externa sale al navegador del sistema (Art. VI.3).
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    const isDevServer = isDevelopment && url.startsWith(DEV_SERVER_URL);
    if (!url.startsWith('file://') && !isDevServer) {
      event.preventDefault();
      if (url.startsWith('http:') || url.startsWith('https:')) {
        void shell.openExternal(url);
      }
    }
  });

  if (isDevelopment && process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(DEV_SERVER_URL);
  } else {
    void window.loadFile(join(__dirname, '..', 'renderer', 'index.html'));
  }

  return window;
}

/**
 * Planificador (ADR-007): comprueba el vencimiento al arrancar y cada cuarto de
 * hora. No hay temporizador que "recuerde" la cita; se pregunta si ya pasó.
 */
async function checkSchedule(): Promise<void> {
  if (!container || container.isRunning) return;

  const trigger = container.pendingTrigger();
  if (!trigger || !container.hasKeys()) return;

  try {
    const run = await container.runAgent({ trigger }, (progress) => {
      mainWindow?.webContents.send(IPC_EVENTS.agentProgress, progress);
    });
    mainWindow?.webContents.send(IPC_EVENTS.agentDone, summarize(run));
    mainWindow?.webContents.send(IPC_EVENTS.catalogChanged, { reason: 'agent' });
  } catch (error) {
    console.error('[agente] la ejecución programada ha fallado:', error);
  }
}

async function bootstrap(): Promise<void> {
  const dataDir = join(app.getPath('userData'), DATA_FOLDER);
  const paths = resolvePaths(dataDir);

  const secrets = new SecretsManager(paths.secrets);
  await secrets.load();

  container = new AppContainer({
    dataDir,
    keys: { get: (name) => secrets.get(name) },
    onRecover: (message) => console.warn('[almacén]', message),
  });
  await container.load();

  registerIpcHandlers({
    container,
    secrets,
    appVersion: app.getVersion(),
    getWindow: () => mainWindow,
  });

  mainWindow = createWindow();

  // Comprobación al arrancar: recupera la ejecución perdida (FR-002).
  void checkSchedule();
  scheduleTimer = setInterval(() => void checkSchedule(), CHECK_INTERVAL_MS);
}

// Una sola instancia: dos procesos escribiendo el mismo catálogo no acaban bien.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  void app.whenReady().then(bootstrap);
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
});

app.on('before-quit', () => {
  if (scheduleTimer) clearInterval(scheduleTimer);
  void container?.saveCache();
});
