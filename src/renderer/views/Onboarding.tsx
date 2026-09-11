/**
 * Primer arranque guiado (FR-050).
 *
 * Sin clave y sin catálogo, lo peor que puede hacer una aplicación es enseñar
 * una pantalla vacía y dejarte buscar. Aquí están los tres pasos, en orden, con
 * el enlace exacto donde se pide la clave y el campo para pegarla, sin tener
 * que ir a ninguna otra pantalla.
 */

import { useState } from 'react';
import { api, describeApiError, unwrap } from '../api';

const TMDB_API_URL = 'https://www.themoviedb.org/settings/api';
const OMDB_API_URL = 'https://www.omdbapi.com/apikey.aspx';

interface OnboardingProps {
  onReady: () => Promise<void> | void;
  onLoadSamples: () => Promise<void>;
  onSkip: () => void;
}

export function Onboarding({ onReady, onLoadSamples, onSkip }: OnboardingProps) {
  const [key, setKey] = useState('');
  const [omdbKey, setOmdbKey] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [busySamples, setBusySamples] = useState(false);

  const open = (url: string) => void api.shell.openExternal(url);

  async function saveAndVerify(): Promise<void> {
    setState('saving');
    setMessage('Guardando y comprobando la clave…');
    try {
      await unwrap(api.secrets.set({ tmdb: key.trim(), ...(omdbKey.trim() ? { omdb: omdbKey.trim() } : {}) }));
      const result = await unwrap(api.secrets.verify({ which: 'tmdb' }));

      if (!result.ok) {
        setState('idle');
        setMessage(`No ha funcionado: ${result.message}`);
        return;
      }
      setState('saved');
      setMessage('Clave verificada. Ya puedes traer los estrenos.');
      await onReady();
    } catch (error) {
      setState('idle');
      setMessage(describeApiError(error));
    }
  }

  return (
    <div className="onboarding">
      <header className="onboarding__head">
        <span className="onboarding__logo" aria-hidden="true">🍿</span>
        <h1 className="page-title" style={{ margin: 0 }}>Vamos a llenar esto de estrenos</h1>
        <p className="page-subtitle" style={{ margin: '6px 0 0' }}>
          Hacen falta dos minutos y una clave gratuita. No se comparte con nadie: se queda en este
          dispositivo.
        </p>
      </header>

      <ol className="steps">
        <li className="step">
          <span className="step__number">1</span>
          <div className="step__body">
            <h3 className="step__title">Pide tu clave de TMDB</h3>
            <p className="step__text">
              Es gratis y es de donde salen el catálogo, las plataformas, los géneros y los tráileres.
              Entra, crea la cuenta si no la tienes y copia la clave de la API.
            </p>
            <button type="button" className="btn" onClick={() => open(TMDB_API_URL)}>
              Abrir la página de TMDB ↗
            </button>
          </div>
        </li>

        <li className="step">
          <span className="step__number">2</span>
          <div className="step__body">
            <h3 className="step__title">Pégala aquí</h3>
            <div className="field">
              <input
                type="password"
                value={key}
                placeholder="Tu clave de TMDB"
                onChange={(event) => setKey(event.target.value)}
                autoComplete="off"
                aria-label="Clave de TMDB"
              />
            </div>

            <details className="step__optional">
              <summary>¿Y las notas de IMDb y Rotten Tomatoes? (opcional)</summary>
              <p className="step__text">
                Vienen de OMDb, que también es gratis, 1 000 consultas al día. Sin ella verás solo la
                nota de TMDB; puedes añadirla más tarde en Ajustes.
              </p>
              <button type="button" className="btn btn--sm" onClick={() => open(OMDB_API_URL)}>
                Abrir la página de OMDb ↗
              </button>
              <div className="field" style={{ marginTop: 10 }}>
                <input
                  type="password"
                  value={omdbKey}
                  placeholder="Tu clave de OMDb (opcional)"
                  onChange={(event) => setOmdbKey(event.target.value)}
                  autoComplete="off"
                  aria-label="Clave de OMDb"
                />
              </div>
            </details>
          </div>
        </li>

        <li className="step">
          <span className="step__number">3</span>
          <div className="step__body">
            <h3 className="step__title">Trae los estrenos</h3>
            <p className="step__text">
              La primera recopilación tarda un par de minutos. Después se repite sola una vez por
              semana, el día y la hora que elijas.
            </p>
            <button
              type="button"
              className="btn btn--primary"
              disabled={key.trim().length === 0 || state === 'saving'}
              onClick={() => void saveAndVerify()}
            >
              {state === 'saving' ? 'Comprobando…' : 'Guardar y empezar'}
            </button>
          </div>
        </li>
      </ol>

      {message && (
        <p className={`onboarding__message${state === 'saved' ? ' onboarding__message--ok' : ''}`}>
          {message}
        </p>
      )}

      <footer className="onboarding__foot">
        <span className="field__hint">¿Prefieres verla por dentro antes de registrarte?</span>
        <button
          type="button"
          className="btn"
          disabled={busySamples}
          onClick={() => {
            setBusySamples(true);
            void onLoadSamples().finally(() => setBusySamples(false));
          }}
        >
          {busySamples ? 'Cargando…' : 'Cargar datos de ejemplo'}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onSkip}>
          Ahora no
        </button>
      </footer>
    </div>
  );
}
