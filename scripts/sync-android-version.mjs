/**
 * Lleva la versión de `package.json` al contenedor de Android.
 *
 * Se hizo script porque la alternativa —editar `build.gradle` a mano en cada
 * publicación— ya falló: las versiones 1.0.0, 1.0.1, 1.1.0 y 1.1.1 salieron
 * todas con `versionCode 1`, así que el móvil no sabía distinguir una
 * actualización de una reinstalación.
 *
 * `versionCode` tiene que crecer siempre y ser un entero, así que se deriva de
 * la versión semántica: mayor × 10 000 + menor × 100 + parche. 1.2.0 → 10200.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GRADLE = join(ROOT, 'android', 'app', 'build.gradle');

const { version } = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
if (!match) {
  console.error(`La versión «${version}» no tiene la forma mayor.menor.parche.`);
  process.exit(1);
}

const [, major, minor, patch] = match.map(Number);
const versionCode = major * 10_000 + minor * 100 + patch;

const original = await readFile(GRADLE, 'utf8');
const updated = original
  .replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
  .replace(/versionName\s+"[^"]*"/, `versionName "${version}"`);

if (!/versionCode \d+/.test(updated) || !updated.includes(`versionName "${version}"`)) {
  console.error('No se pudo escribir la versión en build.gradle: revisa el archivo.');
  process.exit(1);
}

if (updated !== original) await writeFile(GRADLE, updated);
console.log(`Android: versionName ${version}, versionCode ${versionCode}`);
