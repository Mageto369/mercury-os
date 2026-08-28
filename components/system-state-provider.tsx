'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { deriveSystemState, emptyReasonFor, type EmptyReason, type SystemState } from '@/lib/system/health-state';

interface SystemStateContextValue {
  state: SystemState | null;
  checkedAt: string | null;
  refresh: () => Promise<void>;
}

const SystemStateContext = createContext<SystemStateContextValue>({
  state: null,
  checkedAt: null,
  refresh: async () => {},
});

/**
 * One health probe shared by every surface. Without this each panel would
 * either re-fetch /api/health or, as before, silently guess that an empty
 * result means "no market activity".
 */
export function SystemStateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SystemState | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/health', { cache: 'no-store' });
      setState(deriveSystemState(await response.json()));
    } catch {
      setState(deriveSystemState(null));
    }
    setCheckedAt(new Date().toISOString());
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const value = useMemo(() => ({ state, checkedAt, refresh }), [state, checkedAt, refresh]);
  return <SystemStateContext.Provider value={value}>{children}</SystemStateContext.Provider>;
}

export function useSystemState() {
  return useContext(SystemStateContext);
}

/**
 * Convenience for data panels: given how many rows a surface actually has,
 * return the reason it is empty — or 'none' when it is not.
 */
export function useEmptyReason(
  rowCount: number,
  options: { filtered?: boolean; requiresMaturity?: boolean } = {},
): EmptyReason {
  const { state } = useSystemState();
  return emptyReasonFor(state, { rowCount, ...options });
}
