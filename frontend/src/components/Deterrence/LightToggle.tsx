import { motion, useReducedMotion } from 'framer-motion';
import { Lightbulb, Zap, Sun, Square } from 'lucide-react';
import type { LightMode } from '../../types';
import { useDeterrenceStore } from '../../store/deterrenceStore';
import { cn } from '../../utils/cn';

const MODES: { id: LightMode; label: string; hint: string; Icon: typeof Zap }[] = [
  { id: 'strobe', label: 'Strobe', hint: 'Flashing — startles most animals at night', Icon: Zap },
  { id: 'flood', label: 'Flood', hint: 'Steady flood light — calmer, used first for elephants', Icon: Sun },
];

interface Props {
  zones: string[];
}

export default function LightsCard({ zones }: Props) {
  const server = useDeterrenceStore((s) => s.server);
  const pending = useDeterrenceStore((s) => s.pending);
  const { fire, setStyle } = useDeterrenceStore.getState();
  const active = server.lights;
  const reduce = useReducedMotion();
  const mode = MODES.find((m) => m.id === server.light_mode) ?? MODES[0];

  return (
    <div
      data-testid="lights-card"
      className={cn(
        'relative glass rounded-2xl p-5 border overflow-hidden transition-colors',
        active ? 'border-amber2-500/45 shadow-glow-amber' : 'border-white/8'
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'h-11 w-11 grid place-items-center rounded-xl border',
              active ? 'bg-amber2-500/15 border-amber2-500/40 text-amber2-300' : 'bg-white/5 border-white/10 text-white/60'
            )}
          >
            <Lightbulb size={20} />
          </div>
          <div>
            <div className="font-display text-base font-semibold tracking-tight">Warning lights</div>
            <div className="text-xs text-white/45 mt-0.5">{mode.hint}</div>
          </div>
        </div>
        <span
          className={cn(
            'pill border text-[10px] uppercase tracking-wider',
            active ? 'bg-amber2-500/15 border-amber2-500/40 text-amber2-300' : 'bg-white/5 border-white/10 text-white/45'
          )}
        >
          {active ? mode.label : 'Off'}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-1 p-1 rounded-xl bg-white/3 border border-white/8" role="radiogroup" aria-label="Light mode">
        {MODES.map(({ id, label, Icon }) => (
          <button
            key={id}
            role="radio"
            aria-checked={server.light_mode === id}
            disabled={pending.style}
            onClick={() => setStyle({ light_mode: id })}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition',
              server.light_mode === id ? 'bg-amber2-500/20 text-amber2-200' : 'text-white/50 hover:text-white hover:bg-white/5'
            )}
          >
            <Icon size={12} /> {label}
          </button>
        ))}
      </div>

      {/* Beacon: a rotating wedge (strobe) or a steady glow (flood); never a full-card flash. */}
      <div className="mt-3 h-10 relative rounded-lg bg-black/25 border border-white/5 overflow-hidden grid place-items-center">
        <div className="relative h-7 w-7 rounded-full bg-forest-950 border border-white/10 overflow-hidden">
          {active && server.light_mode === 'strobe' && !reduce && (
            <motion.div
              className="absolute -inset-2"
              style={{ background: 'conic-gradient(from 0deg, rgba(251,191,36,0.95), transparent 30%)' }}
              animate={{ rotate: 360 }}
              transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
            />
          )}
          {active && (server.light_mode === 'flood' || reduce) && <div className="absolute inset-0 bg-amber2-400/80" />}
        </div>
        {active && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(60% 120% at 50% 50%, rgba(245,158,11,0.18), transparent 70%)' }}
          />
        )}
      </div>

      <div className="mt-4">
        {active ? (
          <button
            onClick={() => fire({ lights: false })}
            disabled={pending.fire}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/12 text-sm transition disabled:opacity-50"
          >
            <Square size={13} /> Lights off
          </button>
        ) : (
          <button
            data-testid="lights-on"
            onClick={() => fire({ lights: true, light_mode: server.light_mode, zones })}
            disabled={pending.fire}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber2-500/12 hover:bg-amber2-500/20 border border-amber2-500/35 text-amber2-200 text-sm font-medium transition disabled:opacity-50"
          >
            <Lightbulb size={14} /> Turn on {mode.label.toLowerCase()} lights
          </button>
        )}
      </div>
    </div>
  );
}
