import { useEffect, useState } from 'react';
import type { UpdaterStatus } from '@shared/types';

/** Suit l'état de l'auto-updater poussé par le main process. */
export function useUpdaterStatus(): UpdaterStatus {
  const [status, setStatus] = useState<UpdaterStatus>({ state: 'idle' });

  useEffect(() => {
    let mounted = true;
    void window.api
      ?.getUpdaterStatus()
      .then((s) => {
        if (mounted) setStatus(s);
      })
      .catch(() => {});
    const unsub = window.api?.onUpdaterStatus(setStatus);
    return () => {
      mounted = false;
      unsub?.();
    };
  }, []);

  return status;
}
