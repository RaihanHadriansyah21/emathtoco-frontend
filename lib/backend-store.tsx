'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { API_URL } from './config';

export type BackendState = 'healthy' | 'degraded' | 'offline' | 'checking';

interface BackendStatusContextType {
  backendState: BackendState;
  retryBackendCheck: () => Promise<void>;
}

const BackendStatusContext = createContext<BackendStatusContextType>({
  backendState: 'checking',
  retryBackendCheck: async () => undefined,
});

let backendStateSnapshot: BackendState = 'checking';

export function getBackendState(): BackendState {
  return backendStateSnapshot;
}

function updateSnapshot(state: BackendState) {
  backendStateSnapshot = state;
}

async function performHealthCheck(): Promise<BackendState> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 4000);

  try {
    const response = await fetch(`${API_URL}/health/ready`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) {
      return 'degraded';
    }
    const data = await response.json() as { status?: string };
    return data.status === 'healthy' ? 'healthy' : 'degraded';
  } catch {
    return 'offline';
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export const useBackendStatus = () => useContext(BackendStatusContext);

export function BackendStatusProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<BackendState>('checking');
  const timerRef = useRef<number | null>(null);
  const consecutiveFailuresRef = useRef(0);
  const runningRef = useRef(false);

  const scheduleNext = useCallback((nextState: BackendState) => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    const offlineDelays = [5_000, 15_000, 30_000, 60_000];
    const delay = nextState === 'healthy'
      ? 60_000
      : nextState === 'degraded'
        ? 15_000
        : offlineDelays[Math.min(
            consecutiveFailuresRef.current,
            offlineDelays.length - 1,
          )];
    timerRef.current = window.setTimeout(() => {
      window.dispatchEvent(new Event('emathtoco:backend-check'));
    }, delay);
  }, []);

  const doCheck = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      const nextState = await performHealthCheck();
      if (nextState === 'offline') {
        consecutiveFailuresRef.current += 1;
      } else {
        consecutiveFailuresRef.current = 0;
      }
      setState(nextState);
      updateSnapshot(nextState);
      scheduleNext(nextState);
    } finally {
      runningRef.current = false;
    }
  }, [scheduleNext]);

  useEffect(() => {
    const onCheck = () => void doCheck();
    const onFocus = () => void doCheck();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void doCheck();
    };

    void doCheck();
    window.addEventListener('emathtoco:backend-check', onCheck);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      window.removeEventListener('emathtoco:backend-check', onCheck);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [doCheck]);

  const contextValue = useMemo(
    () => ({ backendState: state, retryBackendCheck: doCheck }),
    [state, doCheck],
  );

  return (
    <BackendStatusContext.Provider value={contextValue}>
      {children}
    </BackendStatusContext.Provider>
  );
}
