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
import { omdbKeyWarning, tmdbKeyWarning } from '../../core/domain/api-keys';

const TMDB_API_URL = 'https://www.themoviedb.org/settings/api';
const TMDB_SIGNUP_URL = 'https://www.themoviedb.org/signup';
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

  // Aviso en vivo: mejor decirlo mientras pega que tras un 401 sin explicación.
  const tmdbWarning = tmdbKeyWarning(key);
  const omdbWarning = omdbKeyWarning(omdbKey);

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
              Es gratis y es de donde salen el catálogo, las plataformas, los géneros y los
              tráileres. Necesitas una cuenta; la clave te la dan <strong>al momento</strong>, no
              hay lista de espera ni aprobación.
            </p>
            <p className="step__text">
              En esa página aparecen <strong>dos</strong> credenciales. Copia la de arriba,
              «API&nbsp;Key&nbsp;(v3&nbsp;auth)»: son 32 caracteres sin puntos. La de abajo, el
              «Read Access Token», es larga, empieza por <code>eyJ</code> y aquí no vale.
            </p>
            <div className="field__row">
              <button type="button" className="btn" onClick={() => open(TMDB_API_URL)}>
                Abrir la página de la clave ↗
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => open(TMDB_SIGNUP_URL)}>
                No tengo cuenta ↗
              </button>
            </div>
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
                placeholder="Tu clave de TMDB (32 caracteres)"
                onChange={(event) => setKey(event.target.value)}
                autoComplete="off"
                aria-label="Clave de TMDB"
              />
              {tmdbWarning && <p className="field__hint field__hint--warn">{tmdbWarning}</p>}
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
                {omdbWarning && <p className="field__hint field__hint--warn">{omdbWarning}</p>}
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
