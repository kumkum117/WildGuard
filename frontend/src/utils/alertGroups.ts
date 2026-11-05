import type { Alert, AlertStatus } from '../types';

// Repeated alerts for the same animal on the same camera (e.g. a leopard that
// keeps coming back, or older alerts logged every few minutes) are shown as one
// incident with a ×N count instead of a wall of identical cards.

export interface AlertGroup {
  key: string;
  latest: Alert;
  alerts: Alert[];
  status: AlertStatus;
  sightings: number;
  firstAt: number;
  lastAt: number;
}

const GAP_MS = 30 * 60 * 1000;
const RANK: Record<AlertStatus, number> = { active: 2, acknowledged: 1, resolved: 0 };

const seenAt = (a: Alert) => new Date(a.lastSeen ?? a.timestamp).getTime();

export function groupAlerts(alerts: Alert[], gapMs = GAP_MS): AlertGroup[] {
  const sorted = [...alerts].sort((a, b) => seenAt(b) - seenAt(a));
  const groups: AlertGroup[] = [];
  const open = new Map<string, AlertGroup>();
  for (const a of sorted) {
    // Resolved and unresolved alerts never merge — resolving closes an incident.
    const base = `${a.cameraId}|${a.animal.toLowerCase()}|${a.status === 'resolved' ? 'r' : 'o'}`;
    const g = open.get(base);
    const t = new Date(a.timestamp).getTime();
    if (g && g.firstAt - seenAt(a) <= gapMs) {
      g.alerts.push(a);
      g.firstAt = Math.min(g.firstAt, t);
      g.sightings += a.sightings ?? 1;
      if (RANK[a.status] > RANK[g.status]) g.status = a.status;
      continue;
    }
    const group: AlertGroup = {
      key: `${base}|${a.id}`,
      latest: a,
      alerts: [a],
      status: a.status,
      sightings: a.sightings ?? 1,
      firstAt: t,
      lastAt: seenAt(a),
    };
    open.set(base, group);
    groups.push(group);
  }
  return groups;
}

export const openGroupCount = (alerts: Alert[]) =>
  groupAlerts(alerts.filter((a) => a.status === 'active')).length;
