/**
 * Claves de API cifradas con el almacén del sistema operativo (FR-035, Art. III.3).
 *
 * Si el sistema no ofrece cifrado —algunos Linux sin llavero configurado— las
 * claves se mantienen **solo en memoria** durante la sesión y no se escriben en
 * disco. Guardarlas en claro sería incumplir el Art. III.3 en silencio, que es
 * peor que pedirle al usuario que las vuelva a introducir.
 */

import { safeStorage } from 'electron';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { mkdir } from 'node:fs/promises';
import type { SecretsStatus } from '../shared/types';

export type SecretName = 'tmdb' | 'omdb';

interface SecretsFile {
  schemaVersion: number;
  /** Valor cifrado en base64, por servicio. */
  values: Partial<Record<SecretName, string>>;
}

const SCHEMA_VERSION = 1;

export class SecretsManager {
  private values: Partial<Record<SecretName, string>> = {};
  private encryptionAvailable = false;

  constructor(private readonly filePath: string) {}

  async load(): Promise<void> {
    this.encryptionAvailable = safeStorage.isEncryptionAvailable();
    if (!this.encryptionAvailable) return;

    let raw: string;
    try {
      raw = await readFile(this.filePath, 'utf8');
    } catch {
      return; // No hay archivo todavía: es lo normal en el primer arranque.
    }

    try {
      const parsed = JSON.parse(raw) as SecretsFile;
      for (const name of ['tmdb', 'omdb'] as const) {
        const encoded = parsed.values?.[name];
        if (!encoded) continue;
        this.values[name] = safeStorage.decryptString(Buffer.from(encoded, 'base64'));
      }
    } catch {
      // Archivo ilegible o cifrado con otra identidad de sistema: se descarta.
      // El usuario volverá a introducir las claves; no hay nada que recuperar.
      this.values = {};
    }
  }

  get(name: SecretName): string | null {
    const value = this.values[name];
    return value && value.length > 0 ? value : null;
  }

  has(name: SecretName): boolean {
    return this.get(name) !== null;
  }

  /** Una cadena vacía borra la clave, que es como el usuario la revoca. */
  async set(values: Partial<Record<SecretName, string>>): Promise<void> {
    for (const [name, value] of Object.entries(values) as Array<[SecretName, string]>) {
      if (value.length === 0) delete this.values[name];
      else this.values[name] = value;
    }
    await this.persist();
  }

  async wipe(): Promise<void> {
    this.values = {};
    await rm(this.filePath, { force: true });
  }

  /** Estado sin revelar las claves: presencia y los cuatro últimos caracteres (FR-035). */
  status(): SecretsStatus {
    return {
      tmdb: { present: this.has('tmdb'), hint: hintFor(this.get('tmdb')) },
      omdb: { present: this.has('omdb'), hint: hintFor(this.get('omdb')) },
      encryptionAvailable: this.encryptionAvailable,
    };
  }

  private async persist(): Promise<void> {
    if (!this.encryptionAvailable) return;

    const file: SecretsFile = { schemaVersion: SCHEMA_VERSION, values: {} };
    for (const name of ['tmdb', 'omdb'] as const) {
      const value = this.values[name];
      if (!value) continue;
      file.values[name] = safeStorage.encryptString(value).toString('base64');
    }

    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(file), { encoding: 'utf8', mode: 0o600 });
  }
}

/** `…c3f9`, o `null` si no hay clave. Nunca el valor completo (NFR-009). */
export function hintFor(value: string | null): string | null {
  if (!value) return null;
  return value.length <= 4 ? '••••' : `••••${value.slice(-4)}`;
}
