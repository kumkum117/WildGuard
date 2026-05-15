// @ts-nocheck
import { motion } from 'framer-motion';
import { useDetectionStore } from '../../store/detectionStore';
import { formatTime } from '../../utils/formatters';
import { cn } from '../../utils/cn';

export default function DetectionTimeline() {
  const detections = useDetectionStore((s) => s.detections).slice(0, 14);

  return (
    <div data-testid="detection-timeline" className="glass rounded-3xl border border-white/8 p-5 sm:p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">
            Frame analysis
          </div>
          <div className="font-display text-lg font-semibold tracking-tight mt-1">
            Detection timeline
          </div>
        </div>
        <span className="font-mono text-[10px] text-white/40 uppercase tracking-wider">
          last 5 min
        </span>
      </div>

      <div className="relative pl-3">
        <div className="absolute left-1 top-1 bottom-1 w-px bg-gradient-to-b from-moss-400/40 via-white/8 to-transparent" />
        <div className="space-y-3">
          {detections.map((d, i) => (
            <motion.div
              key={d.id}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              className="relative pl-5"
            >
              <span
                className={cn(
                  'absolute left-0 top-2.5 -translate-x-1/2 h-2 w-2 rounded-full ring-4 ring-forest-900',
                  d.threatLevel === 'high'
                    ? 'bg-threat-500'
                    : d.threatLevel === 'medium'
                    ? 'bg-amber2-500'
                    : 'bg-moss-400'
                )}
              />
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm">
                  <span className="font-medium">{d.species}</span>{' '}
                  <span className="text-white/40 font-mono text-xs">on {d.cameraId}</span>
                </div>
                <div className="font-mono text-[10px] text-white/40">{formatTime(d.timestamp)}</div>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="flex-1 h-1 rounded-full bg-white/6 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${d.confidence}%` }}
                    transition={{ duration: 0.6 }}
                    className={cn(
                      'h-full',
                      d.threatLevel === 'high'
                        ? 'bg-threat-500'
                        : d.threatLevel === 'medium'
                        ? 'bg-amber2-500'
                        : 'bg-moss-400'
                    )}
                  />
                </div>
                <span className="font-mono text-[10px] text-white/60 tabular-nums w-8 text-right">
                  {d.confidence}%
                </span>
              </div>
            </motion.div>
          ))}
          {detections.length === 0 && (
            <div className="py-8 text-center text-sm text-white/40">
              Waiting for detections…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
