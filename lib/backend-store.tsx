'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { API_URL } from './config';

// ============================================================
// EMATHTOCO — Backend Status Store
//
// State global yang SEPENUHNYA TERPISAH dari auth.
// Backend mati ≠ user harus logout.
//
// backendState: 'online' | 'offline' | 'checking'
//
// Rules:
// - Health check timeout: 3 detik
// - Hanya sekali saat startup
// - Tidak polling terus
// - Tidak retry tanpa batas
// - Tidak redirect / signOut
// ============================================================

export type BackendState = 'online' | 'offline' | 'checking';

interface BackendStatusContextType {
  backendState: BackendState;
  retryBackendCheck: () => Promise<void>;
}

const BackendStatusContext = createContext<BackendStatusContextType>({
  backendState: 'checking',
  retryBackendCheck: async () => {},
});

export const useBackendStatus = () => useContext(BackendStatusContext);

// ─── Module-level singleton state ────────────────────────────
// This allows non-React code (e.g. api-client.ts) to check
// backend status without hooks.
let _backendState: BackendState = 'checking';

export function getBackendState(): BackendState {
  return _backendState;
}

function setBackendState(state: BackendState) {
  _backendState = state;
}

// ─── Health check function ───────────────────────────────────
async function performHealthCheck(): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout

  try {
    const res = await fetch(`${API_URL}/health`, {
      method: 'GET',
      headers: {
        'ngrok-skip-browser-warning': 'true',
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    // Any response (even 404) means the server is reachable
    return true;
  } catch (err) {
    clearTimeout(timeoutId);
    if (process.env.NODE_ENV === 'development') {
      console.warn('[BACKEND] Health check failed:', err instanceof Error ? err.message : err);
    }
    return false;
  }
}

// ─── React Provider ──────────────────────────────────────────
export function BackendStatusProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<BackendState>('checking');
  const hasCheckedRef = useRef(false);

  const doCheck = useCallback(async () => {
    setState('checking');
    setBackendState('checking');

    const isOnline = await performHealthCheck();
    const newState: BackendState = isOnline ? 'online' : 'offline';

    setState(newState);
    setBackendState(newState);

    if (process.env.NODE_ENV === 'development') {
      console.log(`[BACKEND] Health check result: ${newState}`);
    }
  }, []);

  // Single health check on mount — no polling, no retry
  useEffect(() => {
    if (hasCheckedRef.current) return;
    hasCheckedRef.current = true;
    doCheck();
  }, [doCheck]);

  const contextValue = React.useMemo(() => ({
    backendState: state,
    retryBackendCheck: doCheck,
  }), [state, doCheck]);

  return (
    <BackendStatusContext.Provider value={contextValue}>
      {children}
    </BackendStatusContext.Provider>
  );
}
