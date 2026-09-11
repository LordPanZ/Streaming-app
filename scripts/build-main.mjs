/**
 * Empaqueta el proceso principal, el precargador y el ejecutor de consola.
 *
 * Se usa esbuild y no `tsc` porque Electron carga CommonJS y el núcleo se
 * escribe en ESM: bundear resuelve la mezcla de una vez, sin sembrar el
 * proyecto de extensiones `.js` en los imports.
 */

import { build } from 'esbuild';
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outdir = join(root, 'dist', 'main');
const watch = process.argv.includes('--watch');

const targets = [
  { entry: 'src/main/main.ts', out: 'main.cjs' },
  { entry: 'src/preload/preload.ts', out: 'preload.cjs' },
  { entry: 'scripts/agent-cli.ts', out: 'agent-cli.cjs' },
];

async function run() {
  if (!watch) await rm(outdir, { recursive: true, force: true });

  for (const target of targets) {
    await build({
      entryPoints: [join(root, target.entry)],
      outfile: join(outdir, target.out),
      bundle: true,
      platform: 'node',
      target: 'node20',
      format: 'cjs',
      sourcemap: true,
      minify: process.env.NODE_ENV === 'production',
      // Electron lo resuelve el propio runtime; empaquetarlo rompería la app.
      external: ['electron'],
      logLevel: 'info',
    });
  }
}

await run();
