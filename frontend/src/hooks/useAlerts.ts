// @ts-nocheck
import { useAlertStore } from '../store/alertStore';

export function useAlerts() {
  const alerts = useAlertStore((s) => s.alerts);
  const filter = useAlertStore((s) => s.filter);
  const search = useAlertStore((s) => s.search);
  const filtered = alerts.filter((a) => {
    if (filter !== 'all' && a.threatLevel !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !a.animal.toLowerCase().includes(q) &&
        !a.cameraName.toLowerCase().includes(q) &&
        !a.location.name.toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });
  return { alerts, filtered };
}
