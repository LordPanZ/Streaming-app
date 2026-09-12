/**
 * Ejecución en paralelo acotada para las etapas del agente (ADR-016).
 *
 * Las etapas de enriquecimiento, notas y tráileres hacen una petición por
 * título. Hacerlas de una en una convertía la primera recopilación en varios
 * minutos de espera, y en Android eso significa varios minutos con la pantalla
 * encendida y la aplicación en primer plano (ADR-015). El limitador del cliente
 * HTTP ya existía; lo que faltaba era que alguien lo usara.
 *
 * Dos promesas que este módulo mantiene, y que son la razón de que exista en
 * vez de un `Promise.all` suelto:
 *
 *  1. **El resultado no depende del orden de llegada.** Se devuelve un array
 *     alineado con la entrada, así que el catálogo queda igual que cuando las
 *     etapas iban en serie (Art. VII).
 *  2. **Nada queda a medias.** Si un trabajador falla, los demás terminan antes
 *     de propagar el error: abandonar peticiones en vuelo es lo que deja un
 *     informe mintiendo sobre lo que se llegó a hacer.
 */

/**
 * Trabajos simultáneos por etapa. Coincide a propósito con el límite del
 * cliente HTTP: pedir más solo llenaría su cola de espera sin acelerar nada, y
 * apretar a un tercero gratuito no es de recibo (Art. V).
 */
export const DEFAULT_STAGE_CONCURRENCY = 4;

/**
 * Recorre `items` con como mucho `limit` trabajos a la vez y devuelve los
 * resultados **en el orden de entrada**.
 *
 * El trabajador recibe el índice original porque varias etapas lo necesitan
 * para volver a casar su resultado con el título del que salió.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  if (items.length === 0) return results;

  const width = Math.max(1, Math.min(Math.floor(limit) || 1, items.length));
  let next = 0;
  let failure: unknown = null;
  let failed = false;

  async function runner(): Promise<void> {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      // Tras un fallo se deja de coger trabajo nuevo, pero lo que ya está en
      // vuelo se termina: por eso se sale del bucle en vez de cortar de raíz.
      if (failed) return;

      try {
        results[index] = await worker(items[index] as T, index);
      } catch (error) {
        if (!failed) {
          failed = true;
          failure = error;
        }
        return;
      }
    }
  }

  await Promise.all(Array.from({ length: width }, () => runner()));
  if (failed) throw failure;
  return results;
}

/**
 * Contador de progreso compartido entre trabajadores.
 *
 * En paralelo el orden de finalización es imprevisible, pero «voy por 37 de
 * 120» sigue siendo cierto y es lo que el usuario mira. El número nunca
 * retrocede.
 */
export function progressCounter(): () => number {
  let done = 0;
  return () => {
    done += 1;
    return done;
  };
}
