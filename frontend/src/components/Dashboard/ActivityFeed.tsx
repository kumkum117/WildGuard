// @ts-nocheck
import { AnimatePresence, motion } from 'framer-motion';
import { useActivityStore } from '../../store/activityStore';
import { formatRelative } from '../../utils/formatters';
import { CheckCircle2, AlertTriangle, Activity, Siren as SirenIcon, Eye } from 'lucide-react';
import { cn } from '../../utils/cn';

const iconMap = {
  detection: Eye,
  alert: AlertTriangle,
  system: CheckCircle2,
  deterrence: SirenIcon,
  auth: Activity,
} as const;

const levelTone = {
  info: 'text-white/65',
  success: 'text-moss-300',
  warning: 'text-amber2-300',
  danger: 'text-threat-300',
} as const;

export default function ActivityFeed() {
  const events = useActivityStore((s) => s.events).slice(0, 10);

  return (
    <div data-testid="activity-feed" className="glass rounded-3xl p-5 sm:p-6 border border-white/8 h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">
            Realtime stream
          </div>
          <div className="font-display text-lg font-semibold tracking-tight mt-1">Activity feed</div>
        </div>
        <div className="inline-flex items-center gap-1.5 pill bg-moss-500/10 border border-moss-500/30 text-moss-300">
          <span className="h-1.5 w-1.5 rounded-full bg-moss-400 animate-blink" /> Live
        </div>
      </div>

      <div className="relative space-y-2 max-h-[420px] overflow-y-auto pr-1">
        <AnimatePresence initial={false}>
          {events.map((e, i) => {
            const Icon = iconMap[e.type] || Activity;
            const highlighted = i === 0;
            return (
              <motion.div
                key={e.id}
                layout
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className={cn(
                  'relative flex items-start gap-3 p-3 rounded-xl border',
                  highlighted
                    ? 'border-moss-400/30 bg-moss-500/5'
                    : 'border-white/5 hover:border-white/15 hover:bg-white/3 transition'
                )}
              >
                <div
                  className={cn(
                    'h-7 w-7 grid place-items-center rounded-lg shrink-0',
                    e.level === 'danger'
                      ? 'bg-threat-500/15 text-threat-300'
                      : e.level === 'warning'
                      ? 'bg-amber2-500/15 text-amber2-300'
                      : e.level === 'success'
                      ? 'bg-moss-500/15 text-moss-300'
                      : 'bg-white/5 text-white/60'
                  )}
                >
                  <Icon size={13} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className={cn('text-sm leading-snug tracking-tight', levelTone[e.level])}>
                    {e.message}
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] text-white/35 uppercase tracking-wider">
                    {formatRelative(e.timestamp)} · {e.type}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
