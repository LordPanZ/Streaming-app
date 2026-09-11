/**
 * ADR-013 · almacenamiento de Android.
 *
 * El contenedor no expone `rename`, así que la atomicidad se sustituye por una
 * copia de seguridad previa. Estas pruebas comprueban justo eso: que una
 * escritura interrumpida a mitad no deja al usuario sin datos.
 */

import { describe, expect, it } from 'vitest';
import { Directory } from '@capacitor/filesystem';
import {
  CapacitorFileStorage,
  type FilesystemLike,
} from '../../src/platform/capacitor/capacitor-storage';
import { CapacitorSecretsVault } from '../../src/platform/capacitor/capacitor-secrets';

/** Doble del complemento de archivos, con un mapa por ruta. */
function fakeFilesystem(initial: Record<string, string> = {}) {
  const files = new Map(Object.entries(initial));
  /** Rutas cuya escritura debe fallar, para simular una interrupción. */
  const failing = new Set<string>();

  const plugin = {
    async readFile({ path }: { path: string }) {
      const data = files.get(path);
      if (data === undefined) throw new Error(`No existe: ${path}`);
      return { data };
    },
    async writeFile({ path, data }: { path: string; data: string }) {
      if (failing.has(path)) throw new Error(`Escritura interrumpida: ${path}`);
      files.set(path, data);
      return {};
    },
    async deleteFile({ path }: { path: string }) {
      files.delete(path);
      return {};
    },
    async mkdir() {
      return {};
    },
  } as unknown as FilesystemLike;

  return { plugin, files, failing };
}

function makeStorage(fs: ReturnType<typeof fakeFilesystem>) {
  return new CapacitorFileStorage(fs.plugin, Directory.Data);
}

describe('CapacitorFileStorage', () => {
  it('escribe y relee', async () => {
    const fs = fakeFilesystem();
    const storage = makeStorage(fs);

    await storage.write('titles', '{"a":1}');
    expect(await storage.read('titles')).toBe('{"a":1}');
  });

  it('un documento inexistente se lee como ausente', async () => {
    expect(await makeStorage(fakeFilesystem()).read('titles')).toBeNull();
  });

  it('guarda siempre una copia de seguridad junto al documento', async () => {
    const fs = fakeFilesystem();
    await makeStorage(fs).write('titles', '{"a":1}');

    expect(fs.files.get('estrenos-es/titles.json')).toBe('{"a":1}');
    expect(fs.files.get('estrenos-es/titles.json.bak')).toBe('{"a":1}');
  });

  it('recupera la copia si el documento principal quedó a medio escribir', async () => {
    const fs = fakeFilesystem();
    const storage = makeStorage(fs);
    await storage.write('titles', '{"version":1}');

    // La siguiente escritura muere justo después de actualizar la copia.
    fs.failing.add('estrenos-es/titles.json');
    await expect(storage.write('titles', '{"version":2}')).rejects.toThrow();
    // Y el archivo principal se queda truncado.
    fs.files.set('estrenos-es/titles.json', '{"vers');

    expect(await storage.read('titles')).toBe('{"version":2}');
  });

  it('si ambos están corruptos devuelve el principal, para que se pueda apartar', async () => {
    const fs = fakeFilesystem({
      'estrenos-es/titles.json': '{roto',
      'estrenos-es/titles.json.bak': '{tambien roto',
    });
    expect(await makeStorage(fs).read('titles')).toBe('{roto');
  });

  it('borrar elimina documento y copia', async () => {
    const fs = fakeFilesystem();
    const storage = makeStorage(fs);
    await storage.write('titles', '{"a":1}');

    await storage.remove('titles');
    expect(fs.files.size).toBe(0);
    expect(await storage.read('titles')).toBeNull();
  });

  it('rechaza una clave que podría salirse del directorio', async () => {
    await expect(makeStorage(fakeFilesystem()).read('../../secretos')).rejects.toThrow(/no válida/);
  });

  it('dice dónde viven los datos sin mentir sobre la protección', () => {
    expect(makeStorage(fakeFilesystem()).describe('titles')).toContain('privado');
  });
});

// ---------------------------------------------------------------------------

function fakePreferences(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    plugin: {
      async get({ key }: { key: string }) {
        return { value: values.get(key) ?? null };
      },
      async set({ key, value }: { key: string; value: string }) {
        values.set(key, value);
      },
      async remove({ key }: { key: string }) {
        values.delete(key);
      },
    },
  };
}

describe('CapacitorSecretsVault (FR-047)', () => {
  it('guarda y recupera una clave entre arranques', async () => {
    const prefs = fakePreferences();
    const first = new CapacitorSecretsVault(prefs.plugin);
    await first.load();
    await first.set({ tmdb: 'abc123' });

    const second = new CapacitorSecretsVault(prefs.plugin);
    await second.load();
    expect(second.get('tmdb')).toBe('abc123');
  });

  it('la cadena vacía revoca la clave', async () => {
    const vault = new CapacitorSecretsVault(fakePreferences().plugin);
    await vault.load();
    await vault.set({ omdb: 'xyz' });
    await vault.set({ omdb: '' });

    expect(vault.get('omdb')).toBeNull();
  });

  it('el estado no revela la clave completa (NFR-009)', async () => {
    const vault = new CapacitorSecretsVault(fakePreferences().plugin);
    await vault.load();
    await vault.set({ tmdb: 'clave-secreta-1234' });

    const status = vault.status();
    expect(status.tmdb.present).toBe(true);
    expect(status.tmdb.hint).toBe('••••1234');
    expect(JSON.stringify(status)).not.toContain('clave-secreta');
  });

  it('no dice que hay cifrado del sistema, porque no lo hay (Art. IV.2)', async () => {
    const vault = new CapacitorSecretsVault(fakePreferences().plugin);
    await vault.load();
    expect(vault.status().encryptionAvailable).toBe(false);
  });

  it('el borrado se lleva las dos claves', async () => {
    const prefs = fakePreferences();
    const vault = new CapacitorSecretsVault(prefs.plugin);
    await vault.load();
    await vault.set({ tmdb: 'a', omdb: 'b' });

    await vault.wipe();
    expect(vault.get('tmdb')).toBeNull();
    expect(prefs.values.size).toBe(0);
  });
});
