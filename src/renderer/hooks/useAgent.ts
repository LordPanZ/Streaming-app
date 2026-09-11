/** Estado del agente: progreso en vivo, ejecución manual e historial (FR-003, FR-008). */

import { useCallback, useEffect, useState } from 'react';
import type { AgentProgress, AgentRun, AgentRunSummary, AgentStatus } from '../../shared/types';
import { api, describeApiError, unwrap } from '../api';

export function useAgent() {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [progress, setProgress] = useState<AgentProgress | null>(null);
  const [lastSummary, setLastSummary] = useState<AgentRunSummary | null>(null);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [nextStatus, nextRuns] = await Promise.all([
        unwrap(api.agent.status()),
        unwrap(api.agent.runs(20)),
      ]);
      setStatus(nextStatus);
      setRuns(nextRuns);
      setRunning(nextStatus.running);
    } catch (caught) {
      setError(describeApiError(caught));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => api.on.agentProgress((next) => setProgress(next)), []);

  useEffect(
    () =>
      api.on.agentDone((summary) => {
        setLastSummary(summary);
        setProgress(null);
        setRunning(false);
        void refresh();
      }),
    [refresh],
  );

  const run = useCallback(async () => {
    setError(null);
    setRunning(true);
    setProgress(null);
    try {
      setLastSummary(await unwrap(api.agent.run({ trigger: 'manual' })));
    } catch (caught) {
      setError(describeApiError(caught));
    } finally {
      setRunning(false);
      setProgress(null);
      void refresh();
    }
  }, [refresh]);

  return { status, progress, lastSummary, runs, error, running, run, refresh, setError };
}
