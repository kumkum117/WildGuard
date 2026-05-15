// @ts-nocheck
import { create } from 'zustand';
import type { Alert, ThreatLevel } from '../types';

interface AlertState {
  alerts: Alert[];
  filter: 'all' | ThreatLevel;
  search: string;
  setAlerts: (a: Alert[]) => void;
  addAlert: (a: Alert) => void;
  acknowledge: (id: string) => void;
  resolve: (id: string) => void;
  setFilter: (f: AlertState['filter']) => void;
  setSearch: (s: string) => void;
}

export const useAlertStore = create<AlertState>((set) => ({
  alerts: [],
  filter: 'all',
  search: '',
  setAlerts: (alerts) => set({ alerts }),
  addAlert: (a) => set((s) => ({ alerts: [a, ...s.alerts].slice(0, 200) })),
  acknowledge: (id) =>
    set((s) => ({
      alerts: s.alerts.map((a) => (a.id === id ? { ...a, status: 'acknowledged' } : a)),
    })),
  resolve: (id) =>
    set((s) => ({
      alerts: s.alerts.map((a) => (a.id === id ? { ...a, status: 'resolved' } : a)),
    })),
  setFilter: (filter) => set({ filter }),
  setSearch: (search) => set({ search }),
}));
