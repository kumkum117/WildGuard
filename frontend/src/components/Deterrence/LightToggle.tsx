// @ts-nocheck
import { motion } from 'framer-motion';
import { Lightbulb } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Switch } from './SirenToggle';

interface Props {
  active: boolean;
  onToggle: (v: boolean) => void;
}

export default function LightToggle({ active, onToggle }: Props) {
  return (
    <button
      data-testid="light-toggle"
      onClick={() => onToggle(!active)}
      className={cn(
        'relative group glass rounded-2xl p-5 border text-left w-full overflow-hidden transition-all',
        active ? 'border-amber2-500/45 shadow-glow-amber' : 'border-white/8 hover:border-white/20'
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <motion.div
            animate={active ? { scale: [1, 1.08, 1] } : { scale: 1 }}
            transition={{ duration: 1.2, repeat: active ? Infinity : 0 }}
            className={cn(
              'h-11 w-11 grid place-items-center rounded-xl border',
              active
                ? 'bg-amber2-500/15 border-amber2-500/40 text-amber2-300'
                : 'bg-white/5 border-white/10 text-white/60'
            )}
          >
            <Lightbulb size={20} />
          </motion.div>
          <div>
            <div className="font-display text-base font-semibold tracking-tight">Warning Lights</div>
            <div className="text-xs text-white/45 mt-0.5">Strobe + flood illumination</div>
          </div>
        </div>
        <Switch active={active} />
      </div>
      {active && (
        <div className="mt-4 flex items-center gap-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <motion.span
              key={i}
              animate={{ opacity: [0.2, 1, 0.2] }}
              transition={{
                duration: 0.6,
                repeat: Infinity,
                delay: i * 0.08,
              }}
              className="h-1 flex-1 rounded-full bg-amber2-500"
            />
          ))}
        </div>
      )}
    </button>
  );
}
