/**
 * ADR-016 · paralelismo acotado de las etapas del agente.
 *
 * Lo que se comprueba aquí no es que vaya más rápido (eso lo decide la red),
 * sino que ir en paralelo no cambie el resultado: mismo orden de salida, mismo
 * número de trabajos simultáneos y ninguna petición abandonada a medias.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_STAGE_CONCURRENCY,
  mapWithConcurrency,
  progressCounter,
} from '../../src/core/agent/concurrency';

/** Espera controlada: sin temporizadores reales, las pruebas son deterministas. */
function tick(times = 1): Promise<void> {
  let promise = Promise.resolve();
  for (let i = 0; i < times; i += 1) promise = promise.then(() => undefined);
  return promise;
}

/** Instrumento que cuenta cuántos trabajos coinciden en el tiempo. */
function tracker() {
  const state = { active: 0, peak: 0, started: [] as number[] };
  return {
    state,
    enter(index: number) {
      state.started.push(index);
      state.active += 1;
      state.peak = Math.max(state.peak, state.active);
    },
    leave() {
      state.active -= 1;
    },
  };
}

describe('mapWithConcurrency (ADR-016)', () => {
  it('devuelve los resultados en el orden de entrada aunque lleguen al revés', async () => {
    // El primero es el que más tarda: si el orden dependiera de la llegada,
    // aparecería el último.
    const delays = [5, 4, 3, 2, 1];
    const results = await mapWithConcurrency(delays, 5, async (delay, index) => {
      await tick(delay);
      return `${index}:${delay}`;
    });

    expect(results).toEqual(['0:5', '1:4', '2:3', '3:2', '4:1']);
  });

  it('no supera nunca el límite de trabajos simultáneos', async () => {
    const track = tracker();
    await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 3, async (_item, index) => {
      track.enter(index);
      await tick(2);
      track.leave();
    });

    expect(track.state.peak).toBe(3);
    expect(track.state.active).toBe(0);
  });

  it('trabaja de verdad en paralelo: el límite se alcanza', async () => {
    const track = tracker();
    await mapWithConcurrency([1, 2, 3, 4, 5, 6], 4, async (_item, index) => {
      track.enter(index);
      await tick(3);
      track.leave();
    });

    // Los cuatro primeros arrancan antes de que termine ninguno.
    expect(track.state.started.slice(0, 4)).toEqual([0, 1, 2, 3]);
    expect(track.state.peak).toBe(4);
  });

  it('con límite 1 recorre en serie, que es el comportamiento de referencia', async () => {
    const track = tracker();
    await mapWithConcurrency([1, 2, 3], 1, async (_item, index) => {
      track.enter(index);
      await tick(2);
      track.leave();
    });

    expect(track.state.peak).toBe(1);
    expect(track.state.started).toEqual([0, 1, 2]);
  });

  it('un límite absurdo se interpreta como uno', async () => {
    for (const limit of [0, -4, Number.NaN]) {
      const track = tracker();
      await mapWithConcurrency([1, 2, 3], limit, async () => {
        track.enter(0);
        await tick(1);
        track.leave();
      });
      expect(track.state.peak).toBe(1);
    }
  });

  it('no arranca más trabajadores que elementos hay', async () => {
    const track = tracker();
    await mapWithConcurrency([1, 2], 50, async (_item, index) => {
      track.enter(index);
      await tick(1);
      track.leave();
    });

    expect(track.state.peak).toBe(2);
  });

  it('con la lista vacía no llama al trabajador', async () => {
    const worker = vi.fn();
    await expect(mapWithConcurrency([], 4, worker)).resolves.toEqual([]);
    expect(worker).not.toHaveBeenCalled();
  });

  it('propaga el error original del trabajador', async () => {
    const boom = new Error('se cayó la red');
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (item) => {
        if (item === 2) throw boom;
        await tick(1);
        return item;
      }),
    ).rejects.toBe(boom);
  });

  it('deja terminar lo que ya estaba en vuelo antes de propagar el error', async () => {
    // Abandonar peticiones a medias es justo lo que deja un informe mintiendo
    // sobre lo que se llegó a hacer.
    //
    // La espera es de macrotarea a propósito: el rechazo de una promesa se
    // entrega en la cola de microtareas, así que una implementación que corte
    // de raíz llegaría aquí con `finished` todavía vacío y la prueba lo vería.
    const finished: number[] = [];
    const slow = () => new Promise((resolve) => setTimeout(resolve, 0));

    await expect(
      mapWithConcurrency([0, 1, 2, 3], 4, async (item) => {
        if (item === 0) throw new Error('falla el primero');
        await slow();
        finished.push(item);
        return item;
      }),
    ).rejects.toThrow('falla el primero');

    expect(finished).toEqual([1, 2, 3]);
  });

  it('tras un fallo no coge trabajo nuevo', async () => {
    const attempted: number[] = [];

    await expect(
      mapWithConcurrency([0, 1, 2, 3, 4, 5], 2, async (item) => {
        attempted.push(item);
        if (item === 0) throw new Error('falla el primero');
        await tick(2);
        return item;
      }),
    ).rejects.toThrow('falla el primero');

    // El segundo trabajador ya había empezado con el 1; a partir de ahí, nada.
    expect(attempted).toEqual([0, 1]);
  });

  it('el límite por defecto coincide con el del cliente HTTP', () => {
    expect(DEFAULT_STAGE_CONCURRENCY).toBe(4);
  });
});

describe('progressCounter', () => {
  it('cuenta hacia arriba y nunca retrocede', () => {
    const tickCount = progressCounter();
    expect([tickCount(), tickCount(), tickCount()]).toEqual([1, 2, 3]);
  });

  it('cada contador es independiente', () => {
    const a = progressCounter();
    const b = progressCounter();
    a();
    a();
    expect(b()).toBe(1);
  });
});
