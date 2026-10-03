import { RefreshCw } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSyncStatus, useTriggerSync } from '../api/hooks';
import { fmtRelative } from '../lib/format';

const PHASE_LABEL: Record<string, string> = {
  collection: 'Reading collection',
  details: 'Fetching release details',
  images: 'Caching covers',
};

export function SyncPanel() {
  const { data: status } = useSyncStatus();
  const trigger = useTriggerSync();
  const qc = useQueryClient();
  const wasRunning = useRef(false);

  // Refresh library data when a sync finishes.
  useEffect(() => {
    if (wasRunning.current && status && !status.running) qc.invalidateQueries();
    wasRunning.current = !!status?.running;
  }, [status, qc]);

  const p = status?.progress;
  const pct = p && p.total ? Math.round((p.done / p.total) * 100) : 0;

  return (
    <div className="sync-panel">
      {status?.running ? (
        <>
          <div className="row">
            <RefreshCw size={13} className="spin" />
            <span className="grow ellipsis">{PHASE_LABEL[p?.phase ?? ''] ?? 'Syncing'}</span>
            <span className="muted">{p?.total ? `${p.done}/${p.total}` : ''}</span>
          </div>
          <div className="progress"><div style={{ width: `${pct}%` }} /></div>
        </>
      ) : (
        <div className="row">
          <span className="grow muted">Synced {fmtRelative(status?.lastCompletedAt)}</span>
          <button className="btn btn-sm" onClick={() => trigger.mutate()} disabled={trigger.isPending}>
            <RefreshCw /> Sync now
          </button>
        </div>
      )}
      {status?.lastError && !status.running && <div className="sync-error">{status.lastError}</div>}
    </div>
  );
}
