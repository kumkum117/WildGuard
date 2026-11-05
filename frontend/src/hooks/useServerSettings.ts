import { useEffect, useRef } from 'react';
import type { ServerSettings } from '../types';
import { backend } from '../services/backend';
import { useConnectionStore } from '../store/connectionStore';
import { useToastStore } from '../store/toastStore';

// Backend settings with optimistic local updates. Rapid changes (sliders) are
// merged and sent once input settles.
export function useServerSettings() {
  const live = useConnectionStore((s) => s.mode === 'live');
  const settings = useConnectionStore((s) => s.settings);
  const pending = useRef<Partial<ServerSettings>>({});
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const update = (patch: Partial<ServerSettings>, debounceMs = 0) => {
    const conn = useConnectionStore.getState();
    if (conn.settings) conn.setSettings({ ...conn.settings, ...patch });
    pending.current = { ...pending.current, ...patch };
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      const body = pending.current;
      pending.current = {};
      try {
        useConnectionStore.getState().setSettings(await backend.updateSettings(body));
      } catch (err) {
        useToastStore.getState().push({ title: 'Settings not saved', message: (err as Error).message, level: 'warning' });
      }
    }, debounceMs);
  };

  return { live, settings, update };
}
