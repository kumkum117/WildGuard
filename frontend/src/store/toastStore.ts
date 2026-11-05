import { create } from 'zustand';

// Pop-up toasts. Kept deliberately calm:
//  * at most MAX_VISIBLE on screen — the oldest is dropped, never stacked up;
//  * a toast with the same `key` as one already showing is updated in place
//    (×N counter, timer restarted) instead of adding another;
//  * timers live in the toast component, so hovering pauses them.

export interface Toast {
  id: string;
  key?: string;
  title: string;
  message: string;
  level: 'info' | 'success' | 'warning' | 'danger';
  duration?: number;
  count?: number;
  /** In-app route opened by the toast's "View" action. */
  link?: string;
  /** Bumped whenever the toast is updated, so its timer restarts. */
  version?: number;
}

const MAX_VISIBLE = 3;

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: string) => void;
  clear: () => void;
}

let seq = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (t) =>
    set((s) => {
      const existing = t.key ? s.toasts.find((x) => x.key === t.key) : undefined;
      if (existing) {
        const updated: Toast = {
          ...existing,
          ...t,
          id: existing.id,
          count: t.count ?? (existing.count ?? 1) + 1,
          version: (existing.version ?? 0) + 1,
        };
        return { toasts: s.toasts.map((x) => (x.id === existing.id ? updated : x)) };
      }
      const toast: Toast = { duration: 5000, count: 1, version: 0, ...t, id: `toast-${Date.now()}-${++seq}` };
      return { toasts: [...s.toasts, toast].slice(-MAX_VISIBLE) };
    }),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
  clear: () => set({ toasts: [] }),
}));
