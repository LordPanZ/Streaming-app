/**
 * Identificadores aleatorios sin depender de Node (NFR-011, ADR-013).
 *
 * `crypto.getRandomValues` es estándar y existe tanto en Node como en cualquier
 * vista web, a diferencia de `node:crypto`. Aquí no hace falta criptografía:
 * solo un sufijo que no choque entre dos ejecuciones del mismo segundo.
 */

export function randomHex(bytes: number): string {
  const buffer = new Uint8Array(Math.max(1, bytes));
  globalThis.crypto.getRandomValues(buffer);

  let out = '';
  for (const byte of buffer) {
    out += byte.toString(16).padStart(2, '0');
  }
  return out;
}
