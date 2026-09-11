/**
 * Arranque en Android (ADR-012, ADR-014, ADR-015).
 *
 * Monta el mismo contenedor y el mismo servicio que usa el PC, pero con las
 * piezas del móvil: almacenamiento del contenedor, claves en preferencias
 * privadas y el `fetch` nativo, que no pasa por las políticas de origen cruzado
 * de la vista web.
 *
 * Este módulo solo se carga en el móvil: en el PC, `window.api` ya viene del
 * precargador de Electron y nada de esto llega a ejecutarse.
 */

import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';

import { AppContainer } from '../../core/app/container';
import { AppService } from '../../core/app/app-service';
import type { IpcApi } from '../../shared/ipc';
import { CapacitorFileStorage } from './capacitor-storage';
import { CapacitorSecretsVault } from './capacitor-secrets';
import { createLocalApi, LocalEventBus } from './local-api';

/** Carpeta del contenedor donde viven los datos. Privada de la aplicación. */
const DATA_DIRECTORY = Directory.Data;

/**
 * `fetch` nativo (ADR-014).
 *
 * Con `CapacitorHttp` activado en la configuración, el contenedor sustituye el
 * `fetch` de la vista web por una implementación nativa, así que basta con
 * pasar el global: las peticiones salen del proceso de Android y no las alcanza
 * la política de origen cruzado del navegador incrustado.
 *
 * Salvedad asumida: el `fetch` parcheado ignora `AbortSignal`, de modo que en
 * Android el tiempo de espera lo impone el cliente nativo y no el nuestro. El
 * resto del comportamiento —códigos de estado, reintentos, límites de tasa— lo
 * sigue gobernando `HttpClient` igual que en el PC.
 */
function platformFetch(): typeof globalThis.fetch {
  return globalThis.fetch.bind(globalThis);
}

export interface MobileRuntime {
  api: IpcApi;
  service: AppService;
}

export async function bootstrapMobile(appVersion: string): Promise<MobileRuntime> {
  const storage = new CapacitorFileStorage(Filesystem, DATA_DIRECTORY);

  const secrets = new CapacitorSecretsVault(Preferences);
  await secrets.load();

  const container = new AppContainer({
    storage,
    keys: { get: (name) => secrets.get(name) },
    fetchImpl: platformFetch(),
  });
  await container.load();

  const events = new LocalEventBus();
  const service = new AppService({ container, secrets, appVersion, emit: events.emit });

  const api = createLocalApi({
    service,
    events,
    openExternal: async (url) => {
      await Browser.open({ url });
    },
    exportBundle: async (contents, suggestedName) => {
      // Se deja en el directorio de documentos del contenedor y se devuelve la
      // ruta: el usuario puede recogerlo desde el gestor de archivos.
      await Filesystem.writeFile({
        path: suggestedName,
        data: contents,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
        recursive: true,
      });
      return `Documentos/${suggestedName}`;
    },
    pickImport: async () => {
      // Sin selector de archivos nativo en esta versión: se lee el último
      // paquete exportado. La limitación está declarada en la guía.
      const result = await Filesystem.readdir({ path: '', directory: Directory.Documents }).catch(
        () => null,
      );
      const candidate = result?.files
        .map((file) => (typeof file === 'string' ? file : file.name))
        .filter((name) => name.startsWith('estrenos-es-') && name.endsWith('.json'))
        .sort()
        .at(-1);
      if (!candidate) return null;

      const file = await Filesystem.readFile({
        path: candidate,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
      });
      return typeof file.data === 'string' ? file.data : null;
    },
  });

  /**
   * Android no deja correr trabajos en segundo plano sin permisos que no
   * merecen la pena aquí (ADR-015), así que la ejecución vencida se lanza al
   * arrancar y cada vez que la aplicación vuelve a primer plano.
   */
  void service.runIfDue().catch(() => undefined);
  void App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) void service.runIfDue().catch(() => undefined);
  });

  return { api, service };
}
