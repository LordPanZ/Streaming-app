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

  it('el núcleo solo importa de sí mismo, de shared o de node:', async () => {
    const externalDependencies = new Set<string>();

    for (const file of await collectFiles(CORE_DIR)) {
      for (const specifier of importedModules(await readFile(file, 'utf8'))) {
        if (specifier.startsWith('.') || specifier.startsWith('node:')) continue;
        externalDependencies.add(specifier);
      }
    }

    // Cero dependencias de terceros en el núcleo: es lo que permite ejecutarlo
    // igual dentro de Electron que en la consola (ADR-011).
    expect([...externalDependencies]).toEqual([]);
  });
});
