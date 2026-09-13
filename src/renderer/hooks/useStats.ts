/**
 * Estadísticas personales (FR-033, FR-054).
 *
 * Vive en un gancho porque lo miran dos sitios: la vista «Mis vistas» y el
 * contador de la navegación. Duplicar el efecto era duplicar también la
 * suscripción al aviso de cambio de catálogo, y con ella el riesgo de que uno
 * de los dos se quedara desfasado.
 */

import { useCallback, useEffect, useState } from 'react';
import type { WatchedStats } from '../../shared/types';
import { api, describeApiError, unwrap } from '../api';

export function useStats() {
  const [stats, setStats] = useState<WatchedStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setStats(await unwrap(api.ratings.stats()));
      setError(null);
    } catch (caught) {
      setError(describeApiError(caught));
    }
  }, []);

  useEffect(() => {
    void reload();
    return api.on.catalogChanged(() => void reload());
  }, [reload]);

  return { stats, error, reload };
}
