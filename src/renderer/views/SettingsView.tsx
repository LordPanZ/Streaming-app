/**
 * Ajustes: claves, plataformas, calendario, criterios y datos
 * (FR-005, FR-023, FR-026, FR-035 a FR-039).
 */

import { useEffect, useState } from 'react';
import type { RatingCriterion, SecretsStatus, Settings } from '../../shared/types';
import { PLATFORMS } from '../../core/domain/platforms';
import { normalizedWeights } from '../../core/domain/scoring';
import { omdbKeyWarning, tmdbKeyWarning } from '../../core/domain/api-keys';
import { api, describeApiError, unwrap } from '../api';
import { Banner } from '../components/EmptyState';
import { formatDateTime } from '../format';

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

interface SettingsViewProps {
  settings: Settings | null;
  secrets: SecretsStatus | null;
  onUpdate: (patch: Partial<Settings>) => Promise<void>;
  onSaveSecrets: (values: { tmdb?: string; omdb?: string }) => Promise<void>;
  onReload: () => Promise<void>;
}

export function SettingsView({
  settings,
  secrets,
  onUpdate,
  onSaveSecrets,
  onReload,
}: SettingsViewProps) {
  if (!settings) return <p className="page-subtitle">Cargando ajustes…</p>;

  return (
    <>
      <h1 className="page-title">Ajustes</h1>
      <p className="page-subtitle">
        Todo se guarda en tu equipo. La aplicación no envía nada a ningún servidor propio.
      </p>

      <div className="settings-stack">
        <ApiKeysSection secrets={secrets} onSave={onSaveSecrets} />
        <ScheduleSection settings={settings} onUpdate={onUpdate} />
        <QualitySection settings={settings} onUpdate={onUpdate} />
        <PlatformsSection settings={settings} onUpdate={onUpdate} />
        <CriteriaSection settings={settings} onUpdate={onUpdate} />
        <SamplesSection onReload={onReload} />
        <DataSection onReload={onReload} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------

function ApiKeysSection({
  secrets,
  onSave,
}: {
  secrets: SecretsStatus | null;
  onSave: (values: { tmdb?: string; omdb?: string }) => Promise<void>;
}) {
  const [tmdb, setTmdb] = useState('');
  const [omdb, setOmdb] = useState('');
  const [verification, setVerification] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function save(which: 'tmdb' | 'omdb', value: string): Promise<void> {
    setBusy(true);
    try {
      await onSave({ [which]: value.trim() });
      if (which === 'tmdb') setTmdb('');
      else setOmdb('');
      setVerification((current) => ({ ...current, [which]: 'Clave guardada.' }));
    } finally {
      setBusy(false);
    }
  }

  async function verify(which: 'tmdb' | 'omdb'): Promise<void> {
    setBusy(true);
    setVerification((current) => ({ ...current, [which]: 'Comprobando…' }));
    try {
      const result = await unwrap(api.secrets.verify({ which }));
      setVerification((current) => ({
        ...current,
        [which]: `${result.ok ? '✓' : '✕'} ${result.message}`,
      }));
    } catch (caught) {
      setVerification((current) => ({ ...current, [which]: describeApiError(caught) }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section">
      <h4 className="section__title">Claves de API</h4>

      {secrets && !secrets.encryptionAvailable && (
        <Banner tone="warn">
          Tu sistema no ofrece almacén cifrado, así que las claves solo se conservan durante esta
          sesión y no se escriben en disco. Habrá que volver a introducirlas al reiniciar.
        </Banner>
      )}

      <div className="field">
        <label className="field__label" htmlFor="key-tmdb">
          TMDB · catálogo, plataformas, géneros y tráileres
        </label>
        <p className="field__hint">
          Obligatoria y gratuita, te la dan al momento. En esa página hay dos credenciales:
          necesitas la de arriba, «API Key (v3 auth)», de 32 caracteres. El «Read Access Token»,
          el que empieza por eyJ, no vale aquí.
          {secrets?.tmdb.present && ` Guardada actualmente: ${secrets.tmdb.hint}.`}
        </p>
        <div className="field__row">
          <input
            id="key-tmdb"
            type="password"
            value={tmdb}
            placeholder={
              secrets?.tmdb.present ? 'Introduce una nueva para sustituirla' : 'Tu clave de TMDB (32 caracteres)'
            }
            onChange={(event) => setTmdb(event.target.value)}
            autoComplete="off"
          />
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || tmdb.trim().length === 0}
            onClick={() => void save('tmdb', tmdb)}
          >
            Guardar
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy || !secrets?.tmdb.present}
            onClick={() => void verify('tmdb')}
          >
            Verificar
          </button>
        </div>
        {tmdbKeyWarning(tmdb) && (
          <p className="field__hint field__hint--warn">{tmdbKeyWarning(tmdb)}</p>
        )}
        {verification.tmdb && <p className="field__hint">{verification.tmdb}</p>}
      </div>

      <div className="field">
        <label className="field__label" htmlFor="key-omdb">
          OMDb · notas de IMDb, Rotten Tomatoes y Metacritic
        </label>
        <p className="field__hint">
          Opcional pero muy recomendable. Plan gratuito de 1 000 consultas al día en
          omdbapi.com/apikey.aspx. Sin ella solo verás la nota de TMDB.
          {secrets?.omdb.present && ` Guardada actualmente: ${secrets.omdb.hint}.`}
        </p>
        <div className="field__row">
          <input
            id="key-omdb"
            type="password"
            value={omdb}
            placeholder={secrets?.omdb.present ? 'Introduce una nueva para sustituirla' : 'Tu clave de OMDb'}
            onChange={(event) => setOmdb(event.target.value)}
            autoComplete="off"
          />
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || omdb.trim().length === 0}
            onClick={() => void save('omdb', omdb)}
          >
            Guardar
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy || !secrets?.omdb.present}
            onClick={() => void verify('omdb')}
          >
            Verificar
          </button>
        </div>
        {omdbKeyWarning(omdb) && (
          <p className="field__hint field__hint--warn">{omdbKeyWarning(omdb)}</p>
        )}
        {verification.omdb && <p className="field__hint">{verification.omdb}</p>}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function ScheduleSection({
  settings,
  onUpdate,
}: {
  settings: Settings;
  onUpdate: (patch: Partial<Settings>) => Promise<void>;
}) {
  return (
    <section className="section">
      <h4 className="section__title">Recopilación semanal</h4>

      <label className="toggle" style={{ marginBottom: 14 }}>
        <input
          type="checkbox"
          checked={settings.schedule.enabled}
          onChange={(event) =>
            void onUpdate({ schedule: { ...settings.schedule, enabled: event.target.checked } })
          }
        />
        Ejecutar el agente automáticamente una vez por semana
      </label>

      <div className="field">
        <span className="field__label">Día y hora</span>
        <div className="field__row">
          <select
            className="select"
            value={settings.schedule.weekday}
            onChange={(event) =>
              void onUpdate({
                schedule: { ...settings.schedule, weekday: Number(event.target.value) },
              })
            }
            aria-label="Día de la semana"
          >
            {WEEKDAYS.map((day, index) => (
              <option key={day} value={index}>
                Cada {day}
              </option>
            ))}
          </select>
          <select
            className="select"
            value={settings.schedule.hour}
            onChange={(event) =>
              void onUpdate({ schedule: { ...settings.schedule, hour: Number(event.target.value) } })
            }
            aria-label="Hora"
          >
            {Array.from({ length: 24 }, (_, hour) => (
              <option key={hour} value={hour}>
                a las {String(hour).padStart(2, '0')}:00
              </option>
            ))}
          </select>
        </div>
        <p className="field__hint">
          Próxima ejecución: {formatDateTime(settings.schedule.nextRunAt)}. Última:{' '}
          {formatDateTime(settings.schedule.lastRunAt)}. Si la aplicación estaba cerrada a la hora
          prevista, la ejecución pendiente se lanza al abrirla, y solo una vez.
        </p>
      </div>

      <div className="field">
        <span className="field__label">Ventana de estrenos</span>
        <div className="field__row">
          <input
            type="number"
            min={1}
            max={90}
            value={settings.window.lookbackDays}
            onChange={(event) =>
              void onUpdate({
                window: { ...settings.window, lookbackDays: Number(event.target.value) },
              })
            }
            style={{ maxWidth: 90 }}
            aria-label="Días hacia atrás"
          />
          <span className="field__hint">días hacia atrás, más</span>
          <input
            type="number"
            min={0}
            max={30}
            value={settings.window.graceDays}
            onChange={(event) =>
              void onUpdate({
                window: { ...settings.window, graceDays: Number(event.target.value) },
              })
            }
            style={{ maxWidth: 90 }}
            aria-label="Días de margen"
          />
          <span className="field__hint">de margen para altas tardías</span>
        </div>
      </div>

      <div className="field">
        <span className="field__label">Revalidación de tráileres</span>
        <div className="field__row">
          <input
            type="number"
            min={0}
            max={52}
            value={settings.revalidateTrailerWeeks}
            onChange={(event) =>
              void onUpdate({ revalidateTrailerWeeks: Number(event.target.value) })
            }
            style={{ maxWidth: 90 }}
            aria-label="Semanas de revalidación"
          />
          <span className="field__hint">
            semanas hacia atrás en las que se vuelve a comprobar que los enlaces siguen vivos
          </span>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

/** Listón de calidad del catálogo (FR-053). */
function QualitySection({
  settings,
  onUpdate,
}: {
  settings: Settings;
  onUpdate: (patch: Partial<Settings>) => Promise<void>;
}) {
  const { minCritic, includeUnrated } = settings.quality;

  return (
    <section className="section">
      <h4 className="section__title">Qué entra en el catálogo</h4>
      <p className="field__hint" style={{ marginBottom: 12 }}>
        El agente recopila todos los estrenos de las plataformas activas, pero solo se muestran
        los que llegan a esta nota. Lo que no llega se guarda igualmente: si dentro de unas
        semanas sube de nota, aparece sin tener que volver a buscarlo.
      </p>

      <div className="field">
        <span className="field__label">Nota mínima de la crítica</span>
        <div className="field__row">
          <select
            className="select"
            value={String(minCritic)}
            onChange={(event) =>
              void onUpdate({
                quality: { ...settings.quality, minCritic: Number(event.target.value) },
              })
            }
            aria-label="Nota mínima de la crítica"
          >
            <option value="0">Todas: sin listón</option>
            <option value="6">6 o más</option>
            <option value="7">7 o más — las buenas</option>
            <option value="7.5">7,5 o más</option>
            <option value="8">8 o más — solo lo excelente</option>
          </select>
          <span className="field__hint">
            sobre 10, combinando IMDb, Rotten Tomatoes, Metacritic y TMDB
          </span>
        </div>
      </div>

      <label className="toggle" style={{ marginTop: 10 }}>
        <input
          type="checkbox"
          checked={includeUnrated}
          disabled={minCritic <= 0}
          onChange={(event) =>
            void onUpdate({
              quality: { ...settings.quality, includeUnrated: event.target.checked },
            })
          }
        />
        Enseñar también los que todavía no tienen nota
      </label>
      <p className="field__hint" style={{ marginTop: 6 }}>
        Un estreno de esta misma semana casi nunca tiene nota todavía: aún no hay ficha en IMDb ni
        críticas publicadas. Descartarlo por «no llega al mínimo» sería dar por malo algo que
        nadie ha visto aún. Si lo desactivas, el catálogo será más corto y verás los estrenos con
        una semana o dos de retraso, cuando ya tengan nota.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------

function PlatformsSection({
  settings,
  onUpdate,
}: {
  settings: Settings;
  onUpdate: (patch: Partial<Settings>) => Promise<void>;
}) {
  const activeCount = PLATFORMS.filter((p) => settings.platforms[p.id] !== false).length;

  return (
    <section className="section">
      <h4 className="section__title">Plataformas ({activeCount} activas)</h4>
      <p className="field__hint" style={{ marginBottom: 12 }}>
        Cada plataforma desactivada son consultas que el agente no hace: menos tiempo de ejecución
        y menos cuota consumida.
      </p>
      <div className="toggle-grid">
        {PLATFORMS.map((platform) => (
          <label className="toggle" key={platform.id}>
            <input
              type="checkbox"
              checked={settings.platforms[platform.id] !== false}
              onChange={(event) =>
                void onUpdate({
                  platforms: { ...settings.platforms, [platform.id]: event.target.checked },
                })
              }
            />
            <span
              className="platform-badge__dot"
              style={{ background: platform.accent }}
              aria-hidden="true"
            />
            {platform.name}
          </label>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function CriteriaSection({
  settings,
  onUpdate,
}: {
  settings: Settings;
  onUpdate: (patch: Partial<Settings>) => Promise<void>;
}) {
  const [draft, setDraft] = useState<RatingCriterion[]>(settings.criteria);

  useEffect(() => setDraft(settings.criteria), [settings.criteria]);

  const percentages = new Map(normalizedWeights(draft).map((w) => [w.id, w.percent]));

  function patchCriterion(id: string, patch: Partial<RatingCriterion>): void {
    setDraft((current) => current.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  const changed = JSON.stringify(draft) !== JSON.stringify(settings.criteria);

  return (
    <section className="section">
      <h4 className="section__title">Criterios de valoración</h4>
      <p className="field__hint" style={{ marginBottom: 12 }}>
        Los pesos son relativos: se normalizan a 100 % al calcular tu nota. Desactivar un criterio
        conserva las puntuaciones que ya hubieras dado, pero lo excluye de los cálculos.
      </p>

      {draft
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((criterion) => (
          <div className="detail-row" key={criterion.id}>
            <label className="toggle" style={{ flex: 1, border: 'none', background: 'transparent', padding: 0 }}>
              <input
                type="checkbox"
                checked={criterion.enabled}
                onChange={(event) => patchCriterion(criterion.id, { enabled: event.target.checked })}
              />
              <input
                type="text"
                value={criterion.label}
                onChange={(event) => patchCriterion(criterion.id, { label: event.target.value })}
                style={{ maxWidth: 280 }}
                aria-label={`Nombre del criterio ${criterion.id}`}
              />
            </label>
            <span className="field__row">
              <input
                type="number"
                min={1}
                max={100}
                value={criterion.weight}
                onChange={(event) =>
                  patchCriterion(criterion.id, { weight: Number(event.target.value) })
                }
                style={{ maxWidth: 80 }}
                aria-label={`Peso de ${criterion.label}`}
              />
              <span className="field__hint" style={{ minWidth: 46, textAlign: 'right' }}>
                {criterion.enabled ? `${percentages.get(criterion.id) ?? 0} %` : '—'}
              </span>
            </span>
          </div>
        ))}

      <div className="field__row" style={{ marginTop: 14 }}>
        <button
          type="button"
          className="btn btn--primary"
          disabled={!changed}
          onClick={() => void onUpdate({ criteria: draft })}
        >
          Guardar criterios
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={!changed}
          onClick={() => setDraft(settings.criteria)}
        >
          Descartar cambios
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

/** Datos de ejemplo (FR-051). */
function SamplesSection({ onReload }: { onReload: () => Promise<void> }) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<string>): Promise<void> {
    setBusy(true);
    try {
      setMessage(await action());
      await onReload();
    } catch (caught) {
      setMessage(describeApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section">
      <h4 className="section__title">Datos de ejemplo</h4>
      <p className="field__hint" style={{ marginBottom: 12 }}>
        Diez títulos inventados para probar los filtros y la valoración sin configurar nada. Van
        marcados como ejemplo y desaparecen solos en cuanto llega la primera recopilación real, para
        que no se mezclen con los estrenos de verdad.
      </p>
      <div className="field__row">
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const result = await unwrap(api.data.loadSamples());
              return `Cargados ${result.loaded} títulos de ejemplo.`;
            })
          }
        >
          Cargar datos de ejemplo
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const result = await unwrap(api.data.clearSamples());
              return result.removed > 0
                ? `Retirados ${result.removed} títulos de ejemplo.`
                : 'No había ningún título de ejemplo.';
            })
          }
        >
          Quitar los de ejemplo
        </button>
      </div>
      {message && <p className="field__hint" style={{ marginTop: 10 }}>{message}</p>}
    </section>
  );
}

function DataSection({ onReload }: { onReload: () => Promise<void> }) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);

  async function run(action: () => Promise<string>): Promise<void> {
    setBusy(true);
    try {
      setMessage(await action());
      await onReload();
    } catch (caught) {
      setMessage(describeApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section">
      <h4 className="section__title">Mis datos</h4>
      <p className="field__hint" style={{ marginBottom: 12 }}>
        La exportación incluye el catálogo, tus valoraciones, tus ajustes y el historial de
        ejecuciones. Nunca incluye tus claves de API.
      </p>

      <div className="field__row">
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const result = await unwrap(api.data.export());
              return result.path ? `Exportado a ${result.path}` : 'Exportación cancelada.';
            })
          }
        >
          Exportar a JSON
        </button>

        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const result = await unwrap(api.data.import({ overwriteRatings: false }));
              return `Importados ${result.titlesImported} títulos y ${result.ratingsImported} valoraciones. Se conservaron ${result.ratingsSkipped} valoraciones que ya tenías.`;
            })
          }
        >
          Importar sin pisar mis valoraciones
        </button>

        <button
          type="button"
          className="btn btn--danger"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const result = await unwrap(api.data.import({ overwriteRatings: true }));
              return `Importados ${result.titlesImported} títulos y ${result.ratingsImported} valoraciones, sustituyendo las existentes.`;
            })
          }
        >
          Importar sustituyendo
        </button>
      </div>

      <div className="field__row" style={{ marginTop: 14 }}>
        {confirmWipe ? (
          <>
            <span className="field__hint" style={{ color: 'var(--negative)' }}>
              Se borrarán el catálogo, tus valoraciones, tus ajustes y tus claves. No hay vuelta atrás.
            </span>
            <button
              type="button"
              className="btn btn--danger"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await unwrap(api.data.wipe());
                  setConfirmWipe(false);
                  return 'Todos los datos han sido borrados.';
                })
              }
            >
              Sí, borrarlo todo
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setConfirmWipe(false)}>
              Cancelar
            </button>
          </>
        ) : (
          <button type="button" className="btn btn--danger btn--ghost" onClick={() => setConfirmWipe(true)}>
            Borrar todos mis datos
          </button>
        )}
      </div>

      {message && <p className="field__hint" style={{ marginTop: 10 }}>{message}</p>}
    </section>
  );
}
