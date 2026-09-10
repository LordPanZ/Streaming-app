/**
 * Verificación de tráileres contra YouTube (ADR-004, FR-017).
 *
 * No hay clave de API: se usa el punto oEmbed público, que basta para
 * distinguir los tres estados que exige la especificación. Marcar algo como
 * vivo sin haberlo comprobado está prohibido por el Art. IV.3.
 */

import type { Trailer, TrailerLiveness } from '../../shared/types';
import type { HttpClient } from './http';

const OEMBED_URL = 'https://www.youtube.com/oembed';

export function oembedUrlFor(youtubeId: string): string {
  const watchUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
  const url = new URL(OEMBED_URL);
  url.searchParams.set('url', watchUrl);
  url.searchParams.set('format', 'json');
  return url.toString();
}

/**
 * Traduce un código de estado HTTP a un estado de vitalidad.
 *
 * `200` es lo único que autoriza a decir "vivo". `401`, `403` y `404`
 * significan retirado, privado o restringido. Cualquier otra cosa —un 5xx, un
 * tiempo de espera agotado, el código 0 que devolvemos ante error de red— deja
 * el enlace sin verificar, que no es lo mismo que muerto.
 */
export function livenessFromStatus(status: number): TrailerLiveness {
  if (status === 200) return 'live';
  if (status === 401 || status === 403 || status === 404) return 'dead';
  return 'unverified';
}

export class YoutubeVerifier {
  constructor(private readonly http: HttpClient) {}

  async checkLiveness(youtubeId: string): Promise<TrailerLiveness> {
    const status = await this.http.probeStatus(oembedUrlFor(youtubeId), {
      label: `verificación del vídeo ${youtubeId}`,
    });
    return livenessFromStatus(status);
  }

  /** Devuelve una copia del tráiler con su vitalidad ya comprobada. */
  async verify(trailer: Trailer, now: Date = new Date()): Promise<Trailer> {
    const liveness = await this.checkLiveness(trailer.youtubeId);
    return {
      ...trailer,
      liveness,
      // Invariante 3: si está vivo, consta cuándo se comprobó.
      checkedAt: liveness === 'unverified' ? trailer.checkedAt : now.toISOString(),
    };
  }
}
