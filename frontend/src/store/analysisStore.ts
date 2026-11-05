import { create } from 'zustand';
import type { Analysis } from '../types';

// Uploaded image / video analyses. Summaries arrive from /api/analyses and
// live progress from the event stream; full results are fetched on demand.
interface AnalysisState {
  items: Analysis[];
  selectedId: string | null;
  setItems: (items: Analysis[]) => void;
  upsert: (a: Analysis) => void;
  remove: (id: string) => void;
  select: (id: string | null) => void;
}

export const useAnalysisStore = create<AnalysisState>((set) => ({
  items: [],
  selectedId: null,
  setItems: (items) => set({ items }),
  upsert: (a) =>
    set((s) => {
      const i = s.items.findIndex((x) => x.id === a.id);
      if (i === -1) return { items: [a, ...s.items].slice(0, 100) };
      const items = [...s.items];
      items[i] = { ...items[i], ...a };
      return { items };
    }),
  remove: (id) =>
    set((s) => ({
      items: s.items.filter((x) => x.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    })),
  select: (selectedId) => set({ selectedId }),
}));
