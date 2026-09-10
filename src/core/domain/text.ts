/**
 * Normalización de texto compartida por la comparación de nombres de
 * plataforma, la detección de castellano en los tráileres y la búsqueda por
 * texto de la interfaz. Una sola definición para que las tres se comporten
 * igual ante "Peñíscola", "peniscola" y "PENISCOLA".
 */

/** Minúsculas y sin diacríticos, conservando espacios y signos. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Solo letras y números: para comparar identidades, no para buscar. */
export function normalizeSlug(text: string): string {
  return normalizeText(text).replace(/[^a-z0-9]+/g, '');
}
