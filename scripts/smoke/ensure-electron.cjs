/**
 * Comprueba que el binario de Electron está instalado antes de intentar usarlo.
 *
 * Existe por un fallo que costó tres versiones sin que nadie lo viera: el flujo
 * de comprobaciones instalaba con `ELECTRON_SKIP_BINARY_DOWNLOAD=1` —razonable
 * cuando solo se compila y se pasan pruebas— y después ejecutaba la prueba de
 * humo, que necesita Electron de verdad. El error que salía era este:
 *
 *   Error: Electron failed to install correctly, please delete node_modules/electron
 *
 * que no dice ni quién lo saltó ni dónde arreglarlo, y encima llega desde
 * dentro de `electron/cli.js`, antes de que la prueba de humo llegue a cargarse.
 * Este guion se ejecuta antes y explica el caso concreto.
 */

const { existsSync, readFileSync } = require('node:fs');
const { dirname, join } = require('node:path');

function fail(reason) {
  console.error(`La prueba de humo no puede ejecutarse: ${reason}`);
  console.error('');
  console.error('Necesita el binario de Electron, que no es lo mismo que el paquete de npm.');
  console.error('Si esto pasa en integración continua, revisa que el paso de instalación');
  console.error('de ese flujo NO ponga ELECTRON_SKIP_BINARY_DOWNLOAD=1: saltarse la');
  console.error('descarga deja el paquete sin binario y la prueba de humo sin nada que');
  console.error('ejecutar. En local, `npm ci` sin esa variable lo resuelve.');
  process.exit(1);
}

let root;
try {
  root = dirname(require.resolve('electron/package.json'));
} catch {
  fail('el paquete «electron» no está instalado.');
}

const pathFile = join(root, 'path.txt');
if (!existsSync(pathFile)) {
  fail('falta «path.txt» en node_modules/electron, así que no se descargó el binario.');
}

const binary = join(root, 'dist', readFileSync(pathFile, 'utf8').trim());
if (!existsSync(binary)) {
  fail(`el binario no está en su sitio (${binary}).`);
}
