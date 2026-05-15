// @ts-nocheck
import { motion } from 'framer-motion';
import { Siren } from 'lucide-react';
import { cn } from '../../utils/cn';

interface Props {
  active: boolean;
  onToggle: (v: boolean) => void;
}

export default function SirenToggle({ active, onToggle }: Props) {
  return (
    <button
      data-testid="siren-toggle"
      onClick={() => onToggle(!active)}
      className={cn(
        'relative group glass rounded-2xl p-5 border text-left w-full overflow-hidden transition-all',
        active
          ? 'border-threat-500/45 shadow-glow-threat'
          : 'border-white/8 hover:border-white/20'
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <motion.div
            animate={
              active
                ? { rotate: [-8, 8, -8], scale: [1, 1.05, 1] }
                : { rotate: 0, scale: 1 }
            }
            transition={{ duration: 0.6, repeat: active ? Infinity : 0 }}
            className={cn(
              'h-11 w-11 grid place-items-center rounded-xl border',
              active
                ? 'bg-threat-500/15 border-threat-500/40 text-threat-300'
                : 'bg-white/5 border-white/10 text-white/60'
            )}
          >
            <Siren size={20} />
          </motion.div>
          <div>
            <div className="font-display text-base font-semibold tracking-tight">Siren</div>
            <div className="text-xs text-white/45 mt-0.5">120 dB perimeter sweep</div>
          </div>
        </div>
        <Switch active={active} />
      </div>
      {active && (
        <>
          <motion.div
            className="absolute -inset-1 rounded-2xl pointer-events-none"
            animate={{ boxShadow: ['0 0 0 0 rgba(239,68,68,0.45)', '0 0 0 22px rgba(239,68,68,0)'] }}
            transition={{ duration: 1.6, repeat: Infinity }}
          />
          <div className="mt-4 font-mono text-[10px] uppercase tracking-[0.2em] text-threat-300">
            Broadcasting · 4 zones
          </div>
        </>
      )}
    </button>
  );
}

export const Switch = ({ active }: { active: boolean }) => (
  <div
    className={cn(
      'relative h-7 w-12 rounded-full border transition-colors',
      active ? 'bg-threat-500/40 border-threat-500/50' : 'bg-white/5 border-white/10'
    )}
  >
    <motion.div
      layout
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className={cn(
        'absolute top-0.5 h-6 w-6 rounded-full',
        active ? 'right-0.5 bg-threat-300' : 'left-0.5 bg-white/40'
      )}
    />
  </div>
);
