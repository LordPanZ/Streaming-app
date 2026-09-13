/** Etiqueta de plataforma con el color de su marca (FR-005, FR-056). */

import { getPlatform } from '../../core/domain/platforms';
import { platformLink } from '../../core/domain/platform-links';
import type { PlatformRef } from '../../shared/types';
import { api } from '../api';

interface PlatformBadgeProps {
  platform: PlatformRef;
  /**
   * Título a buscar en la plataforma. Cuando viene, la etiqueta deja de ser
   * decorativa y se convierte en el enlace (FR-056); sin él sigue siendo texto,
   * que es lo que conviene donde ya hay botones aparte.
   */
  titleName?: string;
}

export function PlatformBadge({ platform, titleName }: PlatformBadgeProps) {
  const definition = getPlatform(platform.id);
  const dot = (
    <span
      className="platform-badge__dot"
      style={{ background: definition?.accent ?? 'var(--text-faint)' }}
    />
  );

  const link = titleName ? platformLink(platform.id, platform.name, titleName) : null;

  if (!link) {
    return (
      <span className="platform-badge">
        {dot}
        {platform.name}
      </span>
    );
  }

  return (
    <button
      type="button"
      className="platform-badge platform-badge--link"
      onClick={(event) => {
        // La tarjeta abre la ficha al pulsarla: este botón va a otro sitio.
        event.stopPropagation();
        void api.shell.openExternal(link.url);
      }}
      title={
        link.kind === 'search'
          ? `Buscar «${titleName}» en ${platform.name}`
          : `Abrir ${platform.name}`
      }
    >
      {dot}
      {platform.name} ↗
    </button>
  );
}

export function PlatformBadges({
  platforms,
  titleName,
}: {
  platforms: PlatformRef[];
  titleName?: string;
}) {
  return (
    <>
      {platforms.map((platform) => (
        <PlatformBadge
          key={platform.id}
          platform={platform}
          {...(titleName ? { titleName } : {})}
        />
      ))}
    </>
  );
}
