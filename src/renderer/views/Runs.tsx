/** Historial de ejecuciones del agente (FR-008). */

import { useState } from 'react';
import type { AgentRun } from '../../shared/types';
import { formatDateTime, formatDuration, STAGE_SHORT } from '../format';
import { EmptyState } from '../components/EmptyState';

const TRIGGER_LABEL: Record<AgentRun['trigger'], string> = {
  scheduled: 'Programada',
  manual: 'Manual',
  catchup: 'Recuperada',
  cli: 'Consola',
};

const STATUS_LABEL: Record<AgentRun['status'], string> = {
  success: 'Correcta',
  partial: 'Parcial',
  failed: 'Fallida',
};

export function Runs({ runs }: { runs: AgentRun[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (runs.length === 0) {
    return (
      <>
        <h1 className="page-title">Ejecuciones</h1>
        <EmptyState
          icon="📋"
          title="Todavía no se ha ejecutado el agente"
          text="Aquí quedará registrado qué recopiló cada semana, cuánto tardó y qué falló, si es que falló algo."
        />
      </>
    );
  }

  return (
    <>
      <h1 className="page-title">Ejecuciones</h1>
      <p className="page-subtitle">
        Cada recopilación deja constancia de lo que encontró y de lo que no pudo obtener.
      </p>

      <section className="section">
        {runs.map((run) => (
          <div key={run.id}>
            <div className="run-row">
              <span className={`status-tag status-tag--${run.status}`}>
                {STATUS_LABEL[run.status]}
              </span>
              <span>
                {formatDateTime(run.startedAt)} · {TRIGGER_LABEL[run.trigger]} ·{' '}
                {run.counts.created} nuevos, {run.counts.updated} actualizados
                {run.issues.length > 0 && ` · ${run.issues.length} incidencias`}
              </span>
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={() => setExpanded(expanded === run.id ? null : run.id)}
              >
                {expanded === run.id ? 'Ocultar' : 'Detalles'}
              </button>
            </div>

            {expanded === run.id && (
              <div style={{ padding: '4px 0 16px 102px' }}>
                <div className="detail-row">
                  <span className="detail-row__label">Ventana consultada</span>
                  <span>
                    {run.window.from} … {run.window.to}
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-row__label">Plataformas</span>
                  <span>{run.platformsQueried.join(', ') || '—'}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-row__label">Descubiertos</span>
                  <span>{run.counts.discovered}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-row__label">Peticiones de red</span>
                  <span>
                    {run.http.requests} · {run.http.cacheHits} desde caché ·{' '}
                    {run.http.retries} reintentos
                  </span>
                </div>
                <div className="detail-row">
                  <span className="detail-row__label">Duración</span>
                  <span>{formatDuration(run.durationMs)}</span>
                </div>

                {run.stages.length > 0 && (
                  <div className="detail-row">
                    <span className="detail-row__label">Etapas</span>
                    <span>
                      {run.stages
                        .map(
                          (stage) =>
                            `${STAGE_SHORT[stage.stage]} (${stage.processed}✓${stage.failed > 0 ? ` ${stage.failed}✗` : ''})`,
                        )
                        .join(' · ')}
                    </span>
                  </div>
                )}

                {run.issues.length > 0 && (
                  <ul className="issue-list">
                    {run.issues.slice(0, 25).map((issue, index) => (
                      <li key={`${run.id}-${index}`}>
                        <strong>{STAGE_SHORT[issue.stage]}</strong> · {issue.source}
                        {issue.titleName ? ` · ${issue.titleName}` : ''}: {issue.message}
                      </li>
                    ))}
                    {run.issues.length > 25 && <li>… y {run.issues.length - 25} más.</li>}
                  </ul>
                )}
              </div>
            )}
          </div>
        ))}
      </section>
    </>
  );
}
