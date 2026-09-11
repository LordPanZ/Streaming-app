/**
 * Claves de API en Android (FR-047).
 *
 * **Qué protección hay realmente.** Se guardan en las preferencias privadas de
 * la aplicación. Android aísla ese almacenamiento entre aplicaciones, así que
 * otra aplicación no puede leerlas; pero no están cifradas con una clave
 * respaldada por el hardware, y en un móvil con acceso de superusuario serían
 * legibles. La interfaz lo dice con esas palabras en lugar de prometer un
 * cifrado que no hay (Art. IV.2).
 */

import type { SecretsStatus } from '../../shared/types';
import type { SecretsVault } from '../../core/app/app-service';

type SecretName = 'tmdb' | 'omdb';

/** Subconjunto del complemento de preferencias que necesitamos. */
export interface PreferencesLike {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
}

const PREFIX = 'estrenos-es.secret.';

export class CapacitorSecretsVault implements SecretsVault {
  private readonly values: Partial<Record<SecretName, string>> = {};

  constructor(private readonly preferences: PreferencesLike) {}

  async load(): Promise<void> {
    for (const name of ['tmdb', 'omdb'] as const) {
      const stored = await this.preferences.get({ key: PREFIX + name }).catch(() => ({ value: null }));
      if (stored.value) this.values[name] = stored.value;
    }
  }

  get(name: SecretName): string | null {
    const value = this.values[name];
    return value && value.length > 0 ? value : null;
  }

  /** Una cadena vacía borra la clave, que es como el usuario la revoca. */
  async set(values: Partial<Record<SecretName, string>>): Promise<void> {
    for (const [name, value] of Object.entries(values) as Array<[SecretName, string]>) {
      if (value.length === 0) {
        delete this.values[name];
        await this.preferences.remove({ key: PREFIX + name });
      } else {
        this.values[name] = value;
        await this.preferences.set({ key: PREFIX + name, value });
      }
    }
  }

  async wipe(): Promise<void> {
    for (const name of ['tmdb', 'omdb'] as const) {
      delete this.values[name];
      await this.preferences.remove({ key: PREFIX + name }).catch(() => undefined);
    }
  }

  status(): SecretsStatus {
    return {
      tmdb: { present: this.get('tmdb') !== null, hint: hintFor(this.get('tmdb')) },
      omdb: { present: this.get('omdb') !== null, hint: hintFor(this.get('omdb')) },
      // No hay almacén cifrado del sistema detrás: se declara, no se disimula.
      encryptionAvailable: false,
    };
  }
}

/** `••••c3f9`, o `null` si no hay clave. Nunca el valor completo (NFR-009). */
export function hintFor(value: string | null): string | null {
  if (!value) return null;
  return value.length <= 4 ? '••••' : `••••${value.slice(-4)}`;
}
