import type { Alert } from '../types';
import { backend, mapAlert } from './backend';
import { isLive } from '../store/connectionStore';
import { useAlertStore } from '../store/alertStore';
import { useToastStore } from '../store/toastStore';

// Alert triage. In live mode the status is stored by the backend (and pushed to
// every open dashboard); in demo mode it only changes the local store.
type Action = 'acknowledge' | 'resolve';

function applyLocal(alerts: Alert[], action: Action) {
  const store = useAlertStore.getState();
  for (const a of alerts) {
    if (a.status === 'resolved') continue;
    if (action === 'acknowledge' && a.status === 'active') store.acknowledge(a.id);
    if (action === 'resolve') store.resolve(a.id);
  }
}

async function setStatus(alert: Alert, action: Action) {
  const store = useAlertStore.getState();
  applyLocal([alert], action);
  if (!isLive() || alert.backendId === undefined) return;
  try {
    store.upsertAlert(mapAlert(await backend.alertAction(alert.backendId, action)));
  } catch {
    store.upsertAlert({ ...alert }); // revert the optimistic update
  }
}

/** Acknowledge or resolve several alerts (an incident group, or everything shown). */
async function setMany(alerts: Alert[], action: Action) {
  const targets = alerts.filter((a) => (action === 'acknowledge' ? a.status === 'active' : a.status !== 'resolved'));
  if (!targets.length) return 0;
  applyLocal(targets, action);
  const ids = targets.map((a) => a.backendId).filter((id): id is number => id !== undefined);
  if (isLive() && ids.length) {
    try {
      await backend.bulkAlerts(action, ids);
    } catch (err) {
      targets.forEach((a) => useAlertStore.getState().upsertAlert({ ...a }));
      useToastStore.getState().push({
        title: 'Could not update alerts',
        message: (err as Error).message,
        level: 'warning',
      });
      return 0;
    }
  }
  return targets.length;
}

export const alertService = {
  list(): Alert[] {
    return useAlertStore.getState().alerts;
  },
  acknowledge: (alert: Alert) => setStatus(alert, 'acknowledge'),
  resolve: (alert: Alert) => setStatus(alert, 'resolve'),
  acknowledgeMany: (alerts: Alert[]) => setMany(alerts, 'acknowledge'),
  resolveMany: (alerts: Alert[]) => setMany(alerts, 'resolve'),
};
