import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Configuración del contenedor de Android (ADR-012, ADR-014).
 *
 * `webDir` apunta a lo mismo que carga Electron: una única compilación de la
 * interfaz para las dos plataformas, que es lo que exige FR-044.
 */
const config: CapacitorConfig = {
  appId: 'es.estrenos.app',
  appName: 'Estrenos ES',
  webDir: 'dist/renderer',
  android: {
    backgroundColor: '#0b0d12',
    // Sin tráfico en claro: todas las fuentes son HTTPS (ADR-010).
    allowMixedContent: false,
  },
  plugins: {
    /**
     * Sustituye `fetch` por el cliente HTTP nativo. Sin esto, las peticiones
     * saldrían del navegador incrustado y dependerían de que cada tercero siga
     * permitiendo el origen cruzado (ADR-014).
     */
    CapacitorHttp: { enabled: true },
  },
};

export default config;
