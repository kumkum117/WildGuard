import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCheck, ShieldCheck, Check } from 'lucide-react';
import { useAlerts } from '../../hooks/useAlerts';
import { useAlertStore } from '../../store/alertStore';
import { alertService } from '../../services/alertService';
import AlertCard from './AlertCard';
import AlertFilter from './AlertFilter';
import AlertDetailModal from './AlertDetailModal';
import { cn } from '../../utils/cn';

export default function AlertManagement() {
  const { alerts, filtered, groups, counts } = useAlerts();
  const statusFilter = useAlertStore((s) => s.statusFilter);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmResolve, setConfirmResolve] = useState(false);
  const [busy, setBusy] = useState(false);
  // Look the alert up on every render so the modal reflects status changes.
  const selected = alerts.find((a) => a.id === selectedId) || null;
  const selectedGroup = groups.find((g) => g.alerts.some((a) => a.id === selectedId));

  const openAlerts = filtered.filter((a) => a.status !== 'resolved');
  const unacknowledged = filtered.filter((a) => a.status === 'active');

  const bulk = async (action: 'acknowledge' | 'resolve') => {
    if (action === 'resolve' && !confirmResolve) {
      setConfirmResolve(true);
      window.setTimeout(() => setConfirmResolve(false), 3500);
      return;
    }
    setBusy(true);
    setConfirmResolve(false);
    if (action === 'acknowledge') await alertService.acknowledgeMany(unacknowledged);
    else await alertService.resolveMany(openAlerts);
    setBusy(false);
  };

  return (
    <div data-testid="alert-management" className="space-y-4">
      <AlertFilter counts={counts} />

      {statusFilter !== 'resolved' && openAlerts.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center gap-2 px-4 py-2.5 rounded-2xl border border-white/8 bg-white/[0.02]"
          data-testid="bulk-bar"
        >
          <span className="text-[12px] text-white/55">
            <span className="text-white/85 font-medium">{groups.filter((g) => g.status !== 'resolved').length}</span> open incident
            {groups.length === 1 ? '' : 's'}
            {openAlerts.length > groups.length && <span className="text-white/40"> · {openAlerts.length} alerts grouped</span>}
          </span>
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => bulk('acknowledge')}
              disabled={busy || unacknowledged.length === 0}
              className="text-xs px-3 py-1.5 rounded-lg bg-amber2-500/12 hover:bg-amber2-500/22 border border-amber2-500/30 text-amber2-300 inline-flex items-center gap-1.5 transition disabled:opacity-40"
              data-testid="ack-all"
            >
              <Check size={12} /> Acknowledge all
            </button>
            <button
              onClick={() => bulk('resolve')}
              disabled={busy}
              className={cn(
                'text-xs px-3 py-1.5 rounded-lg border inline-flex items-center gap-1.5 transition disabled:opacity-40',
                confirmResolve
                  ? 'bg-moss-500/30 border-moss-400/50 text-moss-100'
                  : 'bg-moss-500/12 hover:bg-moss-500/22 border-moss-500/30 text-moss-300'
              )}
              data-testid="resolve-all"
            >
              <CheckCheck size={12} /> {confirmResolve ? `Resolve ${openAlerts.length}? Click again` : 'Resolve all'}
            </button>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        <AnimatePresence initial={false}>
          {groups.map((g, i) => (
            <motion.div
              key={g.key}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.25, delay: Math.min(i, 10) * 0.025 }}
            >
              <AlertCard
                alert={g.latest}
                group={g}
                onOpen={() => setSelectedId(g.latest.id)}
                onAcknowledge={() => alertService.acknowledgeMany(g.alerts)}
                onResolve={() => alertService.resolveMany(g.alerts)}
              />
            </motion.div>
          ))}
        </AnimatePresence>
        {groups.length === 0 && (
          <div className="col-span-full py-16 text-center">
            <ShieldCheck size={26} className="mx-auto text-moss-400/70" />
            <div className="mt-3 text-sm text-white/70">
              {statusFilter === 'open' ? 'All clear — no open alerts' : 'No alerts match your filters'}
            </div>
            <div className="mt-1 text-xs text-white/40">
              {statusFilter === 'open' && alerts.length > 0 ? 'Resolved alerts are under the "Resolved" tab.' : 'New incidents will appear here.'}
            </div>
          </div>
        )}
      </div>
      <AlertDetailModal
        alert={selected}
        onClose={() => setSelectedId(null)}
        onAcknowledge={() => selectedGroup && alertService.acknowledgeMany(selectedGroup.alerts)}
        onResolve={() => selectedGroup && alertService.resolveMany(selectedGroup.alerts)}
      />
    </div>
  );
}
