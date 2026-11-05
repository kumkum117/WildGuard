import { useEffect, useState } from 'react';
import { sirenEngine, type AudioState } from '../utils/sirenEngine';

/** Re-renders every `intervalMs` while `active`; returns Date.now(). */
export function useNow(intervalMs = 1000, active = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, active]);
  return now;
}

/** Live state of the browser's siren audio (locked until a user gesture). */
export function useAudioState() {
  const [state, setState] = useState<AudioState>(sirenEngine.state);
  useEffect(() => sirenEngine.subscribe(setState), []);
  return state;
}

export const mmss = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
