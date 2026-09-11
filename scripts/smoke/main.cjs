/**
 * Prueba de humo del renderizado.
 *
 * Carga la interfaz compilada **sin precargador y por HTTP**, que es la
 * situación exacta de Android: el contenedor sirve la aplicación desde un
 * servidor local, no desde el sistema de archivos. La diferencia importa,
 * porque por `file://` las importaciones dinámicas fallan y la prueba mediría
 * otra cosa.
 *
 * Comprueba que aparece la aplicación de verdad, no el mensaje de error de
 * respaldo: dar por bueno cualquier contenido fue justo el motivo de que la
 * primera versión de esta prueba no detectara la pantalla negra.
 */

const { app, BrowserWindow } = require('electron');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const { extname, join, normalize } = require('node:path');

const TIMEOUT_MS = 30_000;
const ROOT = join(__dirname, '..', '..', 'dist', 'renderer');
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
};

app.commandLine.appendSwitch('disable-gpu');

function serve() {
  const server = createServer(async (request, response) => {
    const relative = request.url === '/' ? 'index.html' : decodeURIComponent(request.url.split('?')[0]);
    const file = normalize(join(ROOT, relative));
    if (!file.startsWith(ROOT)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const body = await readFile(file);
      response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

app.whenReady().then(async () => {
  const server = await serve();
  const { port } = server.address();

  const window = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    webPreferences: {
      // A propósito: nada de precargador, así `window.api` no existe al
      // arrancar y se recorre el camino del móvil.
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  const problems = [];
  window.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2) problems.push(message);
  });
  window.webContents.on('render-process-gone', (_event, details) =>
    problems.push(`el proceso de renderizado ha muerto: ${details.reason}`),
  );

  const fail = (reason) => {
    console.error(`FALLO: ${reason}`);
    for (const problem of problems.slice(0, 10)) console.error(`  · ${problem}`);
    app.exit(1);
  };

  const timer = setTimeout(() => fail('la interfaz no ha aparecido a tiempo'), TIMEOUT_MS);

  try {
    await window.loadURL(`http://127.0.0.1:${port}/index.html`);

    // Se espera a que aparezca la aplicación de verdad: la raíz de la interfaz
    // y su navegación. El mensaje de error de respaldo no las tiene.
    const state = await window.webContents.executeJavaScript(`
      new Promise((resolve) => {
        const root = document.getElementById('root');
        const read = () => ({
          app: Boolean(root.querySelector('.app')),
          navegacion: root.querySelectorAll('.nav-item').length,
          texto: root.textContent.slice(0, 200),
        });
        const listo = () => read().app;
        if (listo()) return resolve(read());
        const observer = new MutationObserver(() => {
          if (listo()) { observer.disconnect(); resolve(read()); }
        });
        observer.observe(root, { childList: true, subtree: true });
      })
    `);

    if (!state.app) {
      clearTimeout(timer);
      return fail(`no ha aparecido la aplicación. Pintado: «${state.texto}»`);
    }

    /*
     * Hay que esperar a después del montaje. React confirma el DOM **antes**
     * de ejecutar los efectos, así que la aplicación aparece un instante
     * aunque un efecto vaya a lanzar acto seguido y a desmontarla entera. Dar
     * por buena esa primera imagen fue el motivo de que esta prueba no
     * detectara la pantalla negra a la primera.
     */
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const survives = await window.webContents.executeJavaScript(`
      (() => {
        const root = document.getElementById('root');
        return {
          app: Boolean(root.querySelector('.app')),
          navegacion: root.querySelectorAll('.nav-item').length,
          texto: root.textContent.slice(0, 200),
        };
      })()
    `);

    clearTimeout(timer);

    if (!survives.app) {
      return fail(`la interfaz apareció y se cayó durante el montaje. Queda: «${survives.texto}»`);
    }
    if (survives.navegacion < 5) {
      return fail(`navegación incompleta (${survives.navegacion} entradas)`);
    }
    if (problems.length > 0) {
      return fail('la interfaz sigue en pie, pero ha habido errores en consola');
    }

    console.log(
      `OK: la interfaz se monta y sobrevive sin precargador ` +
        `(${survives.navegacion} entradas de navegación, sin errores)`,
    );
    app.exit(0);
  } catch (error) {
    clearTimeout(timer);
    fail(error instanceof Error ? error.message : String(error));
  }
});
