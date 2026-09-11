/**
 * NFR-001 · Art. II de la constitución: el núcleo es TypeScript puro.
 *
 * Esta prueba es la que impide que la prohibición se quede en buenas
 * intenciones: falla en cuanto alguien importe Electron, React o el DOM desde
 * `src/core`.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const CORE_DIR = join(process.cwd(), 'src', 'core');

const FORBIDDEN_IMPORTS = [
  'electron',
  'react',
  'react-dom',
  '@renderer',
  '../main',
  '../renderer',
  '../preload',
];

/**
 * Globales de navegador que no pueden aparecer en el núcleo.
 *
 * La comprobación previa exige que el nombre no venga precedido de un punto ni
 * de parte de otro identificador: el dominio tiene su propio concepto de
 * `window` (la ventana temporal de recopilación) y `ctx.window.from` es
 * legítimo, mientras que `window.fetch` no lo es.
 */
const FORBIDDEN_GLOBALS = [
  /(?<![\w.])window\s*\./,
  /(?<![\w.])document\s*\./,
  /(?<![\w.])localStorage\b/,
  /(?<![\w.])navigator\s*\./,
];

async function collectFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(full)));
    else if (entry.name.endsWith('.ts')) files.push(full);
  }
  return files;
}

function importedModules(source: string): string[] {
  const specifiers: string[] = [];
  const patterns = [
    /import\s[^;]*?from\s+['"]([^'"]+)['"]/g,
    /import\s+['"]([^'"]+)['"]/g,
    /require\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1]) specifiers.push(match[1]);
    }
  }
  return specifiers;
}

describe('aislamiento del núcleo (NFR-001)', () => {
  it('encuentra archivos que analizar', async () => {
    expect((await collectFiles(CORE_DIR)).length).toBeGreaterThan(10);
  });

  it('ningún archivo de src/core importa Electron, React ni el renderizador', async () => {
    const offenders: string[] = [];

    for (const file of await collectFiles(CORE_DIR)) {
      const source = await readFile(file, 'utf8');
      for (const specifier of importedModules(source)) {
        if (FORBIDDEN_IMPORTS.some((forbidden) => specifier === forbidden || specifier.startsWith(`${forbidden}/`))) {
          offenders.push(`${relative(process.cwd(), file)} → ${specifier}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('ningún archivo de src/core usa globales del navegador', async () => {
    const offenders: string[] = [];

    for (const file of await collectFiles(CORE_DIR)) {
      const source = await readFile(file, 'utf8');
      // Se ignoran comentarios: hablar de `window` en la documentación es legítimo.
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      for (const pattern of FORBIDDEN_GLOBALS) {
        if (pattern.test(code)) {
          offenders.push(`${relative(process.cwd(), file)} → ${pattern}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('el núcleo no importa nada de fuera de sí mismo', async () => {
    const externalDependencies = new Set<string>();

    for (const file of await collectFiles(CORE_DIR)) {
      for (const specifier of importedModules(await readFile(file, 'utf8'))) {
        if (specifier.startsWith('.')) continue;
        externalDependencies.add(specifier);
      }
    }

    // Cero dependencias, ni de terceros ni de Node: es lo que permite ejecutar
    // el mismo núcleo dentro de Electron, en la consola y en la vista web de
    // Android (ADR-011, ADR-013).
    expect([...externalDependencies]).toEqual([]);
  });

  it('ningún archivo de src/core importa un módulo de Node (NFR-011)', async () => {
    const offenders: string[] = [];

    for (const file of await collectFiles(CORE_DIR)) {
      for (const specifier of importedModules(await readFile(file, 'utf8'))) {
        if (specifier.startsWith('node:')) {
          offenders.push(`${relative(process.cwd(), file)} → ${specifier}`);
        }
      }
    }

    // Si esto falla, el núcleo ha dejado de poder ejecutarse en Android: lo que
    // toque el sistema va detrás de una interfaz en `src/platform/`.
    expect(offenders).toEqual([]);
  });

  it('las implementaciones de plataforma viven fuera del núcleo', async () => {
    const { readdir } = await import('node:fs/promises');
    const platforms = await readdir(join(process.cwd(), 'src', 'platform'));
    expect(platforms.sort()).toEqual(['capacitor', 'node']);
  });
});
