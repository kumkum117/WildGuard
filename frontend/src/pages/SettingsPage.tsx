// @ts-nocheck
import { motion } from 'framer-motion';
import SettingsPageInner from '../components/Settings/SettingsPage';

export default function SettingsPage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-5 max-w-[1500px] mx-auto"
      data-testid="settings-page"
    >
      <div className="glass rounded-3xl p-5 sm:p-6 border border-white/8">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">
          Preferences
        </div>
        <div className="font-display text-xl sm:text-2xl font-semibold tracking-tight mt-1">
          Tune your sentinel
        </div>
        <div className="mt-2 text-sm text-white/55 max-w-xl">
          Configure how WildGuard notifies you, manage hardware, and personalize the operator
          interface.
        </div>
      </div>
      <SettingsPageInner />
    </motion.div>
  );
}