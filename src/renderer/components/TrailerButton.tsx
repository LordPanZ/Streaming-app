/**
 * Acceso al tráiler (FR-016, FR-017, FR-018, FR-020).
 *
 * El estado de verificación se muestra tal cual: `live` es un enlace
 * comprobado, `unverified` es "no lo hemos podido comprobar" y `dead` ofrece
 * directamente la búsqueda de respaldo. La app no promete lo que no sabe.
 */

import type { Title } from '../../shared/types';
import { api } from '../api';

const LIVENESS_LABEL = {
  live: 'Enlace verificado',
  dead: 'El vídeo ya no está disponible',
  unverified: 'Enlace sin verificar',
} as const;

function openExternal(url: string): void {
  void api.shell.openExternal(url);
}

export function TrailerButton({ title, compact = false }: { title: Title; compact?: boolean }) {
  const trailer = title.trailer;
  const buttonClass = compact ? 'btn btn--sm btn--ghost' : 'btn';

  if (!trailer || trailer.liveness === 'dead') {
    const searchUrl =
      trailer?.searchFallbackUrl ??
      `https://www.youtube.com/results?search_query=${encodeURIComponent(
        `${title.title} ${title.year ?? ''} tráiler español`,
      )}`;

    return (
      <button
        type="button"
        className={buttonClass}
        onClick={() => openExternal(searchUrl)}
        title={
          trailer
            ? 'El tráiler guardado ya no está disponible; se abre una búsqueda en YouTube.'
            : 'No hay tráiler en castellano registrado; se abre una búsqueda en YouTube.'
        }
      >
        🔎 Buscar tráiler
      </button>
    );
  }

  const isSpanish = trailer.language === 'es';

  return (
    <button
      type="button"
      className={buttonClass}
      onClick={() => openExternal(trailer.url)}
      title={`${trailer.title} · ${LIVENESS_LABEL[trailer.liveness]}`}
    >
      ▶ Tráiler{isSpanish ? '' : ' (V.O.)'}
    </button>
  );
}

/** Detalle del tráiler para la ficha: enlace, idioma y estado de verificación. */
export function TrailerDetail({ title }: { title: Title }) {
  const trailer = title.trailer;

  return (
    <div className="trailer">
      <TrailerButton title={title} />

      {trailer ? (
        <>
          <span className={`liveness liveness--${trailer.liveness}`}>
            <span className="liveness__dot" />
            {LIVENESS_LABEL[trailer.liveness]}
          </span>
          <span className="confidence">
            {trailer.language === 'es' ? 'En castellano' : 'Versión original'} ·{' '}
            {trailer.kind === 'teaser' ? 'Teaser' : trailer.kind === 'clip' ? 'Clip' : 'Tráiler'}
          </span>
          {trailer.liveness !== 'dead' && (
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={() => openExternal(trailer.searchFallbackUrl)}
            >
              Buscar otros
            </button>
          )}
        </>
      ) : (
        <span className="confidence">No se ha encontrado ningún tráiler en castellano.</span>
      )}
    </div>
  );
}
