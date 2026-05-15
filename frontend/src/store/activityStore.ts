// @ts-nocheck
import { create } from 'zustand';
import type { ActivityEvent } from '../types';

interface ActivityState {
  events: ActivityEvent[];
  setEvents: (e: ActivityEvent[]) => void;
  push: (e: ActivityEvent) => void;
}

export const useActivityStore = create<ActivityState>((set) => ({
  events: [],
  setEvents: (events) => set({ events }),
  push: (e) => set((s) => ({ events: [e, ...s.events].slice(0, 60) })),
}));
