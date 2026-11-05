import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Notification centre behind the header bell.
//
// Repeated events (the same animal on the same camera, the same camera losing
// signal…) are merged into ONE entry with a ×N counter instead of piling up,
// the badge counts unread entries (not every alert ever logged), and the list
// is capped. Read state is per browser (persisted in localStorage).

export type NotificationKind = 'threat' | 'alert' | 'system' | 'deterrence' | 'analysis';
export type NotificationLevel = 'info' | 'success' | 'warning' | 'danger';
/** Lowest severity that produces notifications at all. */
export type NotifyThreshold = 'danger' | 'warning' | 'all';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  level: NotificationLevel;
  title: string;
  message: string;
  groupKey: string;
  count: number;
  firstAt: number;
  lastAt: number;
  read: boolean;
  link?: string;
}

export interface NotifyInput {
  kind: NotificationKind;
  level: NotificationLevel;
  title: string;
  message: string;
  /** Events with the same key within GROUP_WINDOW_MS merge into one entry. */
  groupKey?: string;
  link?: string;
}

const MAX_ITEMS = 60;
const GROUP_WINDOW_MS = 30 * 60 * 1000;
const LEVEL_RANK: Record<NotificationLevel, number> = { info: 0, success: 0, warning: 1, danger: 2 };

export const passesThreshold = (level: NotificationLevel, threshold: NotifyThreshold) =>
  threshold === 'all' || LEVEL_RANK[level] >= (threshold === 'danger' ? 2 : 1);

interface NotificationState {
  items: AppNotification[];
  threshold: NotifyThreshold;
  add: (n: NotifyInput) => AppNotification;
  markAllRead: () => void;
  markRead: (id: string) => void;
  remove: (id: string) => void;
  clear: () => void;
  setThreshold: (t: NotifyThreshold) => void;
}

let seq = 0;

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      items: [],
      threshold: 'warning',
      add: (n) => {
        const now = Date.now();
        const groupKey = n.groupKey ?? `${n.kind}:${n.title}`;
        const existing = get().items.find((i) => i.groupKey === groupKey && now - i.lastAt < GROUP_WINDOW_MS);
        const item: AppNotification = existing
          ? {
              ...existing,
              level: LEVEL_RANK[n.level] > LEVEL_RANK[existing.level] ? n.level : existing.level,
              title: n.title,
              message: n.message,
              link: n.link ?? existing.link,
              count: existing.count + 1,
              lastAt: now,
              read: false,
            }
          : {
              id: `N-${now}-${++seq}`,
              ...n,
              groupKey,
              count: 1,
              firstAt: now,
              lastAt: now,
              read: false,
            };
        set((s) => ({
          items: [item, ...s.items.filter((i) => i.id !== item.id)].slice(0, MAX_ITEMS),
        }));
        return item;
      },
      markAllRead: () => set((s) => ({ items: s.items.map((i) => (i.read ? i : { ...i, read: true })) })),
      markRead: (id) => set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, read: true } : i)) })),
      remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
      clear: () => set({ items: [] }),
      setThreshold: (threshold) => set({ threshold }),
    }),
    { name: 'wg-notifications', version: 1 }
  )
);

export const unreadCount = (items: AppNotification[]) => items.filter((i) => !i.read).length;
