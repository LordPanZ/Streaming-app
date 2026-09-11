/** Etiqueta de plataforma con el color de su marca (FR-005). */

import { getPlatform } from '../../core/domain/platforms';
import type { PlatformRef } from '../../shared/types';

export function PlatformBadge({ platform }: { platform: PlatformRef }) {
  const definition = getPlatform(platform.id);
  return (
    <span className="platform-badge">
      <span
        className="platform-badge__dot"
        style={{ background: definition?.accent ?? 'var(--text-faint)' }}
      />
      {platform.name}
    </span>
  );
}

export function PlatformBadges({ platforms }: { platforms: PlatformRef[] }) {
  return (
    <>
      {platforms.map((platform) => (
        <PlatformBadge key={platform.id} platform={platform} />
      ))}
    </>
  );
}
