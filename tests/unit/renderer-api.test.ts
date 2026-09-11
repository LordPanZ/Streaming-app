/**
 * Regresión de la pantalla negra en Android.
 *
 * El puente `window.api` lo define el precargador de Electron **antes** de que
 * corra la interfaz, pero en Android lo define el arranque del móvil de forma
 * asíncrona. Capturarlo al cargar el módulo funcionaba en el PC y dejaba el
 * móvil en negro: el primer efecto que tocaba `api.on` lanzaba y React no
 * llegaba a pintar nada.
 *
 * Estas pruebas fijan que el acceso es diferido.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

interface FakeWindow {
  api?: unknown;
}

function setWindow(value: FakeWindow): void {
  (globalThis as { window?: FakeWindow }).window = value;
}

/** Un puente mínimo con la forma que consume la interfaz. */
function fakeBridge() {
  return {
    on: { catalogChanged: () => () => undefined },
    catalog: { query: async () => ({ ok: true as const, data: 'ok' }) },
  };
}

beforeEach(() => {
  vi.resetModules();
  delete (globalThis as { window?: FakeWindow }).window;
});

describe('acceso al puente (regresión de la pantalla negra)', () => {
  it('no captura el puente al cargar el módulo', async () => {
    // El módulo se carga cuando `window.api` todavía no existe: es el orden
    // exacto que ocurre en Android.
    setWindow({});
    const { api } = await import('../../src/renderer/api');

    // El arranque del móvil lo instala después.
    (globalThis as { window: FakeWindow }).window.api = fakeBridge();

    expect(typeof api.on.catalogChanged).toBe('function');
    expect(typeof api.catalog.query).toBe('function');
  });

  it('usarlo antes de tiempo da un error legible, no un «undefined»', async () => {
    setWindow({});
    const { api } = await import('../../src/renderer/api');

    expect(() => api.catalog).toThrow(/todavía no ha terminado de iniciarse/);
  });

  it('isApiReady distingue los dos momentos', async () => {
    setWindow({});
    const { isApiReady } = await import('../../src/renderer/api');

    expect(isApiReady()).toBe(false);
    (globalThis as { window: FakeWindow }).window.api = fakeBridge();
    expect(isApiReady()).toBe(true);
  });

  it('cada acceso resuelve el puente vigente, no uno memorizado', async () => {
    setWindow({ api: fakeBridge() });
    const { api } = await import('../../src/renderer/api');
    const first = api.on;

    (globalThis as { window: FakeWindow }).window.api = fakeBridge();
    expect(api.on).not.toBe(first);
  });
});

describe('unwrap y errores', () => {
  it('devuelve los datos de un resultado correcto', async () => {
    setWindow({});
    const { unwrap } = await import('../../src/renderer/api');
    await expect(unwrap(Promise.resolve({ ok: true, data: 42 }))).resolves.toBe(42);
  });

  it('convierte un resultado fallido en una excepción con su código', async () => {
    setWindow({});
    const { ApiError, unwrap } = await import('../../src/renderer/api');

    const failing = unwrap(
      Promise.resolve({ ok: false as const, error: { code: 'NO_API_KEY' as const, message: 'Falta la clave.' } }),
    );
    await expect(failing).rejects.toThrow(ApiError);
    await failing.catch((error: unknown) => {
      expect((error as InstanceType<typeof ApiError>).code).toBe('NO_API_KEY');
    });
  });

  it('describeApiError da un texto aunque le llegue cualquier cosa', async () => {
    setWindow({});
    const { describeApiError } = await import('../../src/renderer/api');

    expect(describeApiError(new Error('vaya'))).toBe('vaya');
    expect(describeApiError('algo')).toContain('inesperado');
  });
});
