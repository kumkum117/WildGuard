// @ts-nocheck
import { AnimatePresence, motion } from 'framer-motion';
import { useActivityStore } from '../../store/activityStore';
import { formatTime } from '../../utils/formatters';

export default function EventStream() {
  const events = useActivityStore((s) => s.events).slice(0, 18);

  return (
    <div data-testid="event-stream" className="glass rounded-3xl border border-white/8 p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">
            System log
          </div>
          <div className="font-display text-lg font-semibold tracking-tight mt-1">Event stream</div>
        </div>
        <span className="font-mono text-[10px] text-moss-300 uppercase tracking-wider">streaming</span>
      </div>
      <div className="font-mono text-xs space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
        <AnimatePresence initial={false}>
          {events.map((e) => (
            <motion.div
              key={e.id}
              layout
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-[auto,1fr] gap-3 items-baseline"
            >
              <span className="text-white/30">{formatTime(e.timestamp)}</span>
              <span
                className={
                  e.level === 'danger'
                    ? 'text-threat-300'
                    : e.level === 'warning'
                    ? 'text-amber2-300'
                    : e.level === 'success'
                    ? 'text-moss-300'
                    : 'text-white/65'
                }
              >
                [{e.type.toUpperCase()}] {e.message}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
