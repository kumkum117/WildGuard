// @ts-nocheck
import { motion } from 'framer-motion';
import { useDetectionStore } from '../../store/detectionStore';
import { cn } from '../../utils/cn';
import { ShieldAlert, ShieldCheck, Eye } from 'lucide-react';

const config = {
  safe: {
    label: 'All clear',
    accent: 'moss',
    ring: 'stroke-moss-400',
    fill: '#10B981',
    glow: 'shadow-glow-safe',
    Icon: ShieldCheck,
    sub: 'No threats detected',
    progress: 100,
  },
  monitoring: {
    label: 'Monitoring',
    accent: 'moss',
    ring: 'stroke-moss-400',
    fill: '#10B981',
    glow: 'shadow-glow-safe',
    Icon: Eye,
    sub: 'AI vision active across feeds',
    progress: 85,
  },
  detected: {
    label: 'Motion detected',
    accent: 'amber',
    ring: 'stroke-amber2-500',
    fill: '#F59E0B',
    glow: 'shadow-glow-amber',
    Icon: Eye,
    sub: 'Verifying species & threat level',
    progress: 60,
  },
  alert: {
    label: 'THREAT ACTIVE',
    accent: 'threat',
    ring: 'stroke-threat-500',
    fill: '#EF4444',
    glow: 'shadow-glow-threat',
    Icon: ShieldAlert,
    sub: 'Immediate response required',
    progress: 100,
  },
} as const;

export default function StatusIndicator() {
  const threat = useDetectionStore((s) => s.threatState);
  const c = config[threat];

  return (
    <div
      data-testid="status-indicator"
      className={cn('glass rounded-3xl p-6 sm:p-7 border border-white/8 relative overflow-hidden', c.glow)}
    >
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">
        System status
      </div>

      <div className="mt-5 flex items-center gap-6">
        <div className="relative h-32 w-32 shrink-0">
          <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
            <circle
              cx="50"
              cy="50"
              r="44"
              className="stroke-white/8"
              strokeWidth="6"
              fill="transparent"
            />
            <motion.circle
              cx="50"
              cy="50"
              r="44"
              className={c.ring}
              strokeWidth="6"
              fill="transparent"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 44}
              initial={{ strokeDashoffset: 2 * Math.PI * 44 }}
              animate={{
                strokeDashoffset: 2 * Math.PI * 44 * (1 - c.progress / 100),
              }}
              transition={{ duration: 0.9, ease: 'easeOut' }}
            />
          </svg>
          <motion.div
            key={threat}
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="absolute inset-0 grid place-items-center"
          >
            <div className="text-center">
              <c.Icon size={26} style={{ color: c.fill }} className="mx-auto" />
              <div
                className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.18em]"
                style={{ color: c.fill }}
              >
                {c.label}
              </div>
            </div>
          </motion.div>
          {threat === 'alert' && (
            <motion.div
              className="absolute inset-0 rounded-full"
              animate={{ boxShadow: ['0 0 0 0 rgba(239,68,68,0.5)', '0 0 0 30px rgba(239,68,68,0)'] }}
              transition={{ duration: 1.4, repeat: Infinity }}
            />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="font-display text-2xl font-semibold tracking-tight" style={{ color: c.fill }}>
            {c.label}
          </div>
          <div className="text-sm text-white/55 mt-1.5">{c.sub}</div>
          <div className="mt-4 space-y-1.5">
            <Row label="Cameras online" value="5 / 6" tone="moss" />
            <Row label="AI confidence" value="98.4%" tone="moss" />
            <Row label="Last scan" value="just now" tone="white" />
          </div>
        </div>
      </div>
    </div>
  );
}

const Row = ({ label, value, tone }: { label: string; value: string; tone: 'moss' | 'white' }) => (
  <div className="flex items-center justify-between text-xs">
    <span className="text-white/45 font-mono uppercase tracking-wider text-[10px]">{label}</span>
    <span
      className={cn(
        'font-mono tabular-nums',
        tone === 'moss' ? 'text-moss-300' : 'text-white/80'
      )}
    >
      {value}
    </span>
  </div>
);
