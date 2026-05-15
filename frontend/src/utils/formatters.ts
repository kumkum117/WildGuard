// @ts-nocheck
export const formatTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

export const formatRelative = (iso: string) => {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const diff = Math.max(0, Math.floor((now - t) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

export const formatGps = (lat: number, lng: number) =>
  `${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E`;

export const padNum = (n: number, width = 2) =>
  n.toString().padStart(width, '0');
