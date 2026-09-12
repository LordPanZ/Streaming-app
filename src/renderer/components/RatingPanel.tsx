/**
 * Panel de valoración por criterios cuantificables
 * (FR-021 a FR-027).
 *
 * Cada criterio se puntúa por separado de 0 a 10 en pasos de 0,5, con su peso
 * a la vista. Un criterio sin puntuar se queda sin puntuar: no cuenta como
 * cero ni entra en la media (FR-024).
 */

import { useEffect, useMemo, useState } from 'react';
import type { RatingCriterion, TitleView } from '../../shared/types';
import { activeCriteria, SCORE_MAX, SCORE_MIN, SCORE_STEP } from '../../core/domain/criteria';
import { personalScore } from '../../core/domain/scoring';
import { normalizedWeights } from '../../core/domain/scoring';
import { formatDelta, formatScore } from '../format';

interface RatingPanelProps {
  view: TitleView;
  criteria: RatingCriterion[];
  onSave: (scores: Record<string, number>, notes: string) => Promise<void>;
  onClear: () => Promise<void>;
  onToggleWatched: (watched: boolean) => Promise<void>;
  onToggleInterested: (interested: boolean) => Promise<void>;
}

export function RatingPanel({
  view,
  criteria,
  onSave,
  onClear,
  onToggleWatched,
  onToggleInterested,
}: RatingPanelProps) {
  const [scores, setScores] = useState<Record<string, number>>(view.rating?.scores ?? {});
  const [notes, setNotes] = useState(view.rating?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Al cambiar de título hay que descartar el borrador del anterior.
  useEffect(() => {
    setScores(view.rating?.scores ?? {});
    setNotes(view.rating?.notes ?? '');
    setDirty(false);
  }, [view.title.id, view.rating]);

  const active = useMemo(() => activeCriteria(criteria), [criteria]);
  const weights = useMemo(() => {
    const map = new Map(normalizedWeights(criteria).map((w) => [w.id, w.percent]));
    return map;
  }, [criteria]);

  /** Se recalcula en vivo con los mismos pesos que usará el almacén. */
  const preview = useMemo(
    () =>
      personalScore(
        {
          titleId: view.title.id,
          watched: true,
          watchedAt: null,
          watchedOnPlatform: null,
          interested: false,
          scores,
          notes,
          createdAt: '',
          updatedAt: '',
        },
        criteria,
      ),
    [scores, notes, criteria, view.title.id],
  );

  const delta =
    preview.score !== null && view.critic.score !== null
      ? Math.round((preview.score - view.critic.score) * 10) / 10
      : null;

  function setScore(id: string, value: number): void {
    setScores((current) => ({ ...current, [id]: value }));
    setDirty(true);
  }

  function unsetScore(id: string): void {
    setScores((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setDirty(true);
  }

  async function save(): Promise<void> {
    setSaving(true);
    try {
      await onSave(scores, notes);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }

  const watched = view.rating?.watched === true;
  const interested = view.rating?.interested === true;

  return (
    <div className="section">
      <h4 className="section__title">Mi valoración</h4>

      <div className="field__row" style={{ marginBottom: 14 }}>
        <button
          type="button"
          className={watched ? 'btn btn--primary' : 'btn'}
          aria-pressed={watched}
          onClick={() => void onToggleWatched(!watched)}
        >
          {watched ? '✓ La he visto' : 'Marcar como vista'}
        </button>

        {/* Verla cumple la intención, así que el botón se retira (FR-054). */}
        {!watched && (
          <button
            type="button"
            className={interested ? 'btn' : 'btn btn--ghost'}
            aria-pressed={interested}
            onClick={() => void onToggleInterested(!interested)}
            title={interested ? 'Quitar de mi lista' : 'Añadir a mi lista de pendientes'}
          >
            {interested ? '★ Me interesa' : '☆ Me interesa'}
          </button>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="field__hint">Nota personal</span>
          <span
            className={
              preview.score === null ? 'score-pill score-pill--empty' : 'score-pill score-pill--personal'
            }
          >
            {preview.score === null ? 'Sin valorar' : formatScore(preview.score)}
            {preview.score !== null && <small>/10</small>}
          </span>
        </div>
      </div>

      {preview.score !== null && (
        <p className="field__hint" style={{ marginTop: -6, marginBottom: 12 }}>
          {preview.scoredCriteria} de {preview.totalCriteria} criterios puntuados
          {delta !== null && (
            <>
              {' · '}
              <strong style={{ color: delta >= 0 ? 'var(--positive)' : 'var(--negative)' }}>
                {formatDelta(delta)}
              </strong>{' '}
              frente a la crítica
            </>
          )}
        </p>
      )}

      {active.map((criterion) => {
        const value = scores[criterion.id];
        const hasValue = typeof value === 'number';

        return (
          <div className="criterion" key={criterion.id}>
            <div>
              <span className="criterion__label">{criterion.label}</span>
              <span className="criterion__weight">{weights.get(criterion.id) ?? 0} %</span>
              {criterion.description && (
                <div className="field__hint">{criterion.description}</div>
              )}
            </div>

            <div className={hasValue ? 'criterion__value' : 'criterion__value criterion__value--unset'}>
              {hasValue ? formatScore(value) : '—'}
            </div>

            <div className="criterion__slider">
              <input
                type="range"
                min={SCORE_MIN}
                max={SCORE_MAX}
                step={SCORE_STEP}
                value={hasValue ? value : 0}
                aria-label={criterion.label}
                onChange={(event) => setScore(criterion.id, Number(event.target.value))}
              />
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={() => unsetScore(criterion.id)}
                disabled={!hasValue}
                title="Dejar este criterio sin puntuar"
              >
                Sin puntuar
              </button>
            </div>
          </div>
        );
      })}

      <div className="field" style={{ marginTop: 14 }}>
        <label className="field__label" htmlFor="rating-notes">
          Comentario
        </label>
        <textarea
          id="rating-notes"
          value={notes}
          placeholder="Qué te ha parecido…"
          onChange={(event) => {
            setNotes(event.target.value);
            setDirty(true);
          }}
        />
      </div>

      <div className="field__row">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => void save()}
          disabled={saving || !dirty}
        >
          {saving ? 'Guardando…' : dirty ? 'Guardar valoración' : 'Guardado'}
        </button>
        <button
          type="button"
          className="btn btn--danger btn--ghost"
          onClick={() => void onClear()}
          disabled={!view.rating}
        >
          Borrar valoración
        </button>
      </div>
    </div>
  );
}
