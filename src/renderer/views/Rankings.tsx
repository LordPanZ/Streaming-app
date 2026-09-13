/** Clasificación por año: las mejores del año según la crítica (FR-058). */

import { useState } from 'react';
import type { RankingEntry, RankingResult } from '../../shared/types';
import { api, describeApiError, unwrap } from '../api';
import { Banner, EmptyState } from '../components/EmptyState';

/** Nota con coma decimal, como se escribe en castellano. */
function score(value: number): string {
  return value.toFixed(1).replace('.', ',');
}

/** «1. Título — 8,4 (Netflix)». Entre paréntesis, solo la plataforma. */
function line(entry: RankingEntry, position: number): string {
  const where = entry.platforms.join(', ') || 'sin plataforma';
  const partial = entry.sources < 3 ? ' *' : '';
  return `${position}. ${entry.title} — ${score(entry.score)}${partial} (${where})`;
}

function listText(heading: string, entries: readonly RankingEntry[]): string {
  if (entries.length === 0) return `${heading}\n\n  (ningún título reúne notas suficientes)`;
  return [heading, '', ...entries.map((entry, index) => line(entry, index + 1))].join('\n');
}

function fullText(result: RankingResult): string {
  return [
    'Nota = media simple de IMDb, Rotten Tomatoes y TMDB, sobre 10.',
    'Entre paréntesis, la plataforma donde está en España.',
    '',
    listText(`Top ${result.movies.length} películas de ${result.year}`, result.movies),
    '',
    listText(`Top ${result.series.length} series de ${result.year}`, result.series),
  ].join('\n');
}

function List({ heading, entries }: { heading: string; entries: RankingEntry[] }) {
  return (
    <section className="section">
      <h4 className="section__title">{heading}</h4>
      {entries.length === 0 ? (
        <p className="field__hint">Ningún título de ese año reúne notas suficientes.</p>
      ) : (
        <ol className="ranking">
          {entries.map((entry) => (
            <li key={entry.titleId}>
              <span className="ranking__title">{entry.title}</span>
              <span className="ranking__score">
                {score(entry.score)}
                {entry.sources < 3 && <abbr title="Media de dos fuentes, no de tres"> *</abbr>}
              </span>
              <span className="ranking__where">
                ({entry.platforms.join(', ') || 'sin plataforma'})
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function Rankings({ hasKeys, onGoToSettings }: {
  hasKeys: boolean;
  onGoToSettings: () => void;
}) {
  const thisYear = new Date().getFullYear();
  const years = [thisYear, thisYear - 1, thisYear - 2, thisYear - 3];

  const [year, setYear] = useState(thisYear - 1);
  const [result, setResult] = useState<RankingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const calculate = async () => {
    setLoading(true);
    setError(null);
    setCopied(false);
    try {
      setResult(await unwrap(api.ranking.topOfYear({ year, limit: 10 })));
    } catch (caught) {
      setError(describeApiError(caught));
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(fullText(result));
      setCopied(true);
    } catch {
      setError('No se ha podido copiar al portapapeles.');
    }
  };

  return (
    <>
      <h1 className="page-title">Las mejores del año</h1>
      <p className="page-subtitle">
        Nota = media simple de IMDb, Rotten Tomatoes y TMDB, sobre 10. Entre paréntesis, dónde
        está en España.
      </p>

      {error && <Banner tone="error">{error}</Banner>}

      {!hasKeys ? (
        <Banner tone="warn" actionLabel="Ir a Ajustes" onAction={onGoToSettings}>
          Falta la clave de TMDB. Sin ella no se puede consultar ninguna clasificación.
        </Banner>
      ) : (
        <div className="filters">
          <select
            className="select"
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
            aria-label="Año"
            disabled={loading}
          >
            {years.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>

          <button type="button" className="btn btn--primary" onClick={() => void calculate()} disabled={loading}>
            {loading ? 'Consultando…' : 'Calcular'}
          </button>

          {result && (
            <button type="button" className="btn" onClick={() => void copy()}>
              {copied ? '✓ Copiado' : 'Copiar la lista'}
            </button>
          )}
        </div>
      )}

      {/*
        La cuota de OMDb es de 1 000 consultas al día en el plan gratuito y cada
        año consultado gasta unas 160. Decirlo antes evita la sorpresa de
        quedarse sin notas a mitad de semana.
      */}
      {hasKeys && !result && !loading && (
        <p className="field__hint">
          Cada año consultado gasta unas 160 peticiones de la cuota diaria de OMDb (1 000 en el
          plan gratuito). Se consulta año a año por eso.
        </p>
      )}

      {loading && (
        <EmptyState
          icon="⏳"
          title="Consultando las notas…"
          text="Se piden las mejor valoradas del año en tus plataformas y después sus notas de IMDb y Rotten Tomatoes. Tarda un minuto largo."
        />
      )}

      {result && !loading && (
        <>
          <List heading={`Top 10 películas de ${result.year}`} entries={result.movies} />
          <List heading={`Top 10 series de ${result.year}`} entries={result.series} />

          <p className="field__hint">
            {result.considered} títulos examinados · {result.requests} peticiones.
            {(result.movies.some((entry) => entry.sources < 3) ||
              result.series.some((entry) => entry.sources < 3)) &&
              ' El asterisco marca las medias sacadas de dos fuentes en vez de tres.'}
          </p>

          {result.issues.length > 0 && (
            <Banner tone="info">
              {result.issues.length} incidencias al consultar. La más habitual es que OMDb no
              tenga ficha de algún título.
            </Banner>
          )}
        </>
      )}
    </>
  );
}
