import { Moon, Sun, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import type { Lighting, ThreatLevel } from '../../types';
import { cn } from '../../utils/cn';

export { titleCase } from '../../services/backend';

export const toThreat = (t: string) => t.toLowerCase() as ThreatLevel;

export const clock = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
};

export const threatColor = (t: string) =>
  t.toUpperCase() === 'HIGH' ? 'bg-threat-500' : t.toUpperCase() === 'MEDIUM' ? 'bg-amber2-500' : 'bg-moss-400';

export function LightingBadge({ lighting, enhanced }: { lighting?: Partial<Lighting> & { dominant?: string }; enhanced?: boolean }) {
  if (!lighting) return null;
  const night = lighting.is_night ?? lighting.dominant === 'night';
  const label = !night ? 'Daylight' : lighting.mode === 'infrared' ? 'Night · infrared' : 'Night · low light';
  return (
    <span
      className={cn(
        'pill border text-[10px] uppercase tracking-wider',
        night ? 'bg-moss-500/10 border-moss-500/30 text-moss-300' : 'bg-amber2-500/10 border-amber2-500/25 text-amber2-300'
      )}
    >
      {night ? <Moon size={11} /> : <Sun size={11} />}
      {label}
      {enhanced && (
        <>
          <span className="opacity-40">·</span>
          <Sparkles size={10} /> enhanced
        </>
      )}
    </span>
  );
}

export function ConfidenceBar({ value, threat }: { value: number; threat: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 rounded-full bg-white/6 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.round(value * 100)}%` }}
          transition={{ duration: 0.6 }}
          className={cn('h-full', threatColor(threat))}
        />
      </div>
      <span className="font-mono text-[11px] text-white/70 tabular-nums w-9 text-right">{Math.round(value * 100)}%</span>
    </div>
  );
}

export function SectionTitle({ eyebrow, title, right }: { eyebrow: string; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">{eyebrow}</div>
        <div className="font-display text-lg font-semibold tracking-tight mt-1">{title}</div>
      </div>
      {right}
    </div>
  );
}
