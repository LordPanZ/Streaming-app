/**
 * Desarrollo: servidor de Vite para la interfaz + esbuild en vigilancia para el
 * proceso principal + Electron apuntando al servidor.
 */

import { spawn } from 'node:child_process';
import { createServer } from 'vite';
import electronPath from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const server = await createServer({ configFile: join(root, 'vite.config.ts') });
await server.listen();
server.printUrls();

const url = server.resolvedUrls?.local?.[0] ?? 'http://localhost:5273';

await new Promise((resolve, reject) => {
  const build = spawn(process.execPath, [join(root, 'scripts', 'build-main.mjs')], {
    stdio: 'inherit',
  });
  build.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`esbuild salió con ${code}`))));
});

const child = spawn(electronPath, [join(root, 'dist', 'main', 'main.cjs')], {
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: url, NODE_ENV: 'development' },
});

child.on('exit', async () => {
  await server.close();
  process.exit(0);
});
