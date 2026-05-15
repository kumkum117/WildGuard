// @ts-nocheck
import { motion } from 'framer-motion';
import AlertManagement from '../components/Alerts/AlertManagement';

export default function AlertsPage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-5 max-w-[1500px] mx-auto"
      data-testid="alerts-page"
    >
      <div className="glass rounded-3xl p-5 sm:p-6 border border-white/8">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">
          Triage queue
        </div>
        <div className="font-display text-xl sm:text-2xl font-semibold tracking-tight mt-1">
          Acknowledge, dispatch, resolve
        </div>
        <div className="mt-2 text-sm text-white/55 max-w-xl">
          Every confirmed detection becomes a tracked alert. Acknowledge to claim ownership,
          resolve once the threat is cleared from the field.
        </div>
      </div>
      <AlertManagement />
    </motion.div>
  );
}