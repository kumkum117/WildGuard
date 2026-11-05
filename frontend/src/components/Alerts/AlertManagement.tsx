// @ts-nocheck
import { motion } from 'framer-motion';
import { useAlerts } from '../../hooks/useAlerts';
import { alertService } from '../../services/alertService';
import AlertCard from './AlertCard';
import AlertFilter from './AlertFilter';
import { useState } from 'react';
import AlertDetailModal from './AlertDetailModal';
import type { Alert } from '../../types';

export default function AlertManagement() {
  const { alerts, filtered } = useAlerts();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Look the alert up on every render so the modal reflects status changes.
  const selected = alerts.find((a) => a.id === selectedId) || null;

  return (
    <div data-testid="alert-management" className="space-y-5">
      <AlertFilter />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        {filtered.map((a, i) => (
          <motion.div
            key={a.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.03 }}
          >
            <AlertCard
              alert={a}
              onOpen={() => setSelectedId(a.id)}
              onAcknowledge={() => alertService.acknowledge(a)}
              onResolve={() => alertService.resolve(a)}
            />
          </motion.div>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full py-16 text-center text-sm text-white/40">
            No alerts match your filters.
          </div>
        )}
      </div>
      <AlertDetailModal
        alert={selected}
        onClose={() => setSelectedId(null)}
        onAcknowledge={() => selected && alertService.acknowledge(selected)}
        onResolve={() => selected && alertService.resolve(selected)}
      />
    </div>
  );
}
