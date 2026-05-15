// @ts-nocheck
import { motion } from 'framer-motion';
import DeterrenceControl from '../components/Deterrence/DeterrenceControl';

export default function DeterrencePage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-5 max-w-[1500px] mx-auto"
      data-testid="deterrence-page"
    >
      <div className="glass rounded-3xl p-5 sm:p-6 border border-white/8">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">
          Active deterrence
        </div>
        <div className="font-display text-xl sm:text-2xl font-semibold tracking-tight mt-1">
          Non-lethal animal repulsion
        </div>
        <div className="mt-2 text-sm text-white/55 max-w-xl">
          Drive wildlife back into the forest with sirens, strobes, and warning broadcasts.
          Auto-mode follows the response matrix; manual mode hands control to the ranger.
        </div>
      </div>
      <DeterrenceControl />
    </motion.div>
  );
}