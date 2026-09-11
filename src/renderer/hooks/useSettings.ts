/** Ajustes y estado de las claves de API (FR-035, FR-036). */

import { useCallback, useEffect, useState } from 'react';
import type { SecretsStatus, Settings } from '../../shared/types';
import { api, describeApiError, unwrap } from '../api';

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [secrets, setSecrets] = useState<SecretsStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [nextSettings, nextSecrets] = await Promise.all([
        unwrap(api.settings.get()),
        unwrap(api.secrets.status()),
      ]);
      setSettings(nextSettings);
      setSecrets(nextSecrets);
      setError(null);
    } catch (caught) {
      setError(describeApiError(caught));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const update = useCallback(async (patch: Partial<Settings>) => {
    try {
      setSettings(await unwrap(api.settings.update(patch)));
      setError(null);
    } catch (caught) {
      setError(describeApiError(caught));
    }
  }, []);

  const saveSecrets = useCallback(async (values: { tmdb?: string; omdb?: string }) => {
    try {
      setSecrets(await unwrap(api.secrets.set(values)));
      setError(null);
    } catch (caught) {
      setError(describeApiError(caught));
    }
  }, []);

  return { settings, secrets, error, reload, update, saveSecrets };
}
