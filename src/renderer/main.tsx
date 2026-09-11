import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/global.css';

const container = document.getElementById('root');
if (!container) throw new Error('Falta el contenedor #root en index.html');

/**
 * En el PC, `window.api` la expone el precargador de Electron antes de que
 * cargue nada de esto. Si no está, estamos en el móvil y hay que montar el
 * servicio en el propio proceso (ADR-012).
 *
 * La importación es dinámica a propósito: así el paquete de Capacitor queda en
 * un fragmento aparte que el escritorio no llega a descargar.
 */
async function ensureApi(): Promise<void> {
  if (window.api) return;

  const { bootstrapMobile } = await import('../platform/capacitor/bootstrap');
  const runtime = await bootstrapMobile(__APP_VERSION__);
  window.api = runtime.api;
}

ensureApi()
  .then(() => {
    createRoot(container).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  })
  .catch((error: unknown) => {
    // Sin servicio no hay aplicación: se dice qué ha pasado en lugar de dejar
    // una pantalla en blanco (FR-034).
    container.innerHTML = `
      <div style="padding:40px;font-family:system-ui;color:#e8ecf3">
        <h1 style="font-size:18px">No se ha podido iniciar la aplicación</h1>
        <p style="color:#9aa5b7;font-size:14px">${
          error instanceof Error ? error.message : 'Error desconocido.'
        }</p>
      </div>`;
  });
