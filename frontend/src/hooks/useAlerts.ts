import { useMemo } from 'react';
import { useAlertStore } from '../store/alertStore';
import { groupAlerts } from '../utils/alertGroups';

export function useAlerts() {
  const alerts = useAlertStore((s) => s.alerts);
  const filter = useAlertStore((s) => s.filter);
  const statusFilter = useAlertStore((s) => s.statusFilter);
  const search = useAlertStore((s) => s.search);

  const filtered = useMemo(
    () =>
      alerts.filter((a) => {
        if (filter !== 'all' && a.threatLevel !== filter) return false;
        if (statusFilter === 'open' && a.status === 'resolved') return false;
        if (statusFilter === 'resolved' && a.status !== 'resolved') return false;
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
      }),
    [alerts, filter, statusFilter, search]
  );

  const groups = useMemo(() => groupAlerts(filtered), [filtered]);
  const counts = useMemo(
    () => ({
      open: groupAlerts(alerts.filter((a) => a.status !== 'resolved')).length,
      resolved: groupAlerts(alerts.filter((a) => a.status === 'resolved')).length,
      all: groupAlerts(alerts).length,
    }),
    [alerts]
  );

  return { alerts, filtered, groups, counts };
}
