import type { Alert } from '../types';
import { backend, mapAlert } from './backend';
import { isLive } from '../store/connectionStore';
import { useAlertStore } from '../store/alertStore';

// Alert triage. In live mode the status is stored by the backend (and pushed to
// every open dashboard); in demo mode it only changes the local store.
async function setStatus(alert: Alert, action: 'acknowledge' | 'resolve') {
  const store = useAlertStore.getState();
  if (action === 'acknowledge') store.acknowledge(alert.id);
  else store.resolve(alert.id);
  if (!isLive() || alert.backendId === undefined) return;
  try {
    store.upsertAlert(mapAlert(await backend.alertAction(alert.backendId, action)));
  } catch {
    store.upsertAlert({ ...alert }); // revert the optimistic update
  }
}

export const alertService = {
  list(): Alert[] {
    return useAlertStore.getState().alerts;
  },
  acknowledge: (alert: Alert) => setStatus(alert, 'acknowledge'),
  resolve: (alert: Alert) => setStatus(alert, 'resolve'),
};
