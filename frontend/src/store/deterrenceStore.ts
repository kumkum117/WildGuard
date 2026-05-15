// @ts-nocheck
import { create } from 'zustand';
import type { DeterrenceState } from '../types';

interface DeterrenceStoreState extends DeterrenceState {
  setSiren: (v: boolean) => void;
  setLights: (v: boolean) => void;
  setSound: (v: boolean) => void;
  setMode: (m: 'auto' | 'manual') => void;
  setCountdown: (n: number) => void;
  reset: () => void;
}

const initial: DeterrenceState = {
  siren: false,
  lights: false,
  sound: true,
  mode: 'auto',
  countdownSec: 0,
};

export const useDeterrenceStore = create<DeterrenceStoreState>((set) => ({
  ...initial,
  setSiren: (v) => set({ siren: v, activatedAt: v ? new Date().toISOString() : undefined }),
  setLights: (v) => set({ lights: v }),
  setSound: (v) => set({ sound: v }),
  setMode: (mode) => set({ mode }),
  setCountdown: (countdownSec) => set({ countdownSec }),
  reset: () => set({ ...initial }),
}));
