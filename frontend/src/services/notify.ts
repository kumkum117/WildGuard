import { passesThreshold, useNotificationStore, type NotifyInput } from '../store/notificationStore';
import { useToastStore } from '../store/toastStore';
import { useConnectionStore } from '../store/connectionStore';

interface Options {
  /** Also pop a toast (merged with an identical one already showing). */
  toast?: boolean;
  toastDuration?: number;
}

/**
 * Single entry point for everything that should reach the operator. Records
 * the event in the notification centre (grouped) and, for important events,
 * shows a toast and a browser notification when the tab is in the background.
 * Respects the "Notify me about" threshold and the push-notification switch.
 */
export function notify(input: NotifyInput, { toast = false, toastDuration }: Options = {}) {
  const store = useNotificationStore.getState();
  if (!passesThreshold(input.level, store.threshold)) return null;
  const item = store.add(input);

  const pushEnabled = useConnectionStore.getState().settings?.notifications.push ?? true;
  if (!toast || !pushEnabled) return item;

  useToastStore.getState().push({
    key: item.groupKey,
    title: input.title,
    message: input.message,
    level: input.level,
    count: item.count,
    link: input.link,
    duration: toastDuration ?? (input.level === 'danger' ? 8000 : 5000),
  });
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
    try {
      new Notification(input.title, { body: input.message, icon: '/favicon.svg', tag: item.groupKey });
    } catch {
      /* some browsers only allow notifications from a service worker */
    }
  }
  return item;
}
