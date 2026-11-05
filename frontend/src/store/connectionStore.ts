import { create } from 'zustand';
import type { BackendHealth, ConnectionMode, ServerSettings } from '../types';

// Whether the dashboard is driven by the WildGuard backend ("live") or by the
// built-in simulation ("demo", used when no backend is reachable).
interface ConnectionState {
  mode: ConnectionMode;
  /** Live mode only: false while the event stream is reconnecting. */
  online: boolean;
  health: BackendHealth | null;
  settings: ServerSettings | null;
  setMode: (mode: ConnectionMode) => void;
  setOnline: (online: boolean) => void;
  setHealth: (health: BackendHealth | null) => void;
  setSettings: (settings: ServerSettings | null) => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  mode: 'connecting',
  online: false,
  health: null,
  settings: null,
  setMode: (mode) => set({ mode }),
  setOnline: (online) => set({ online }),
  setHealth: (health) => set({ health }),
  setSettings: (settings) => set({ settings }),
}));

export const isLive = () => useConnectionStore.getState().mode === 'live';
