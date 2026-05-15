// @ts-nocheck
import { motion } from 'framer-motion';
import DetectionMonitor from '../components/Detection/DetectionMonitor';
import DetectionTimeline from '../components/Detection/DetectionTimeline';
import EventStream from '../components/Detection/EventStream';

export default function DetectionPage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-5 max-w-[1500px] mx-auto"
      data-testid="detection-page"
    >
      <div className="glass rounded-3xl p-5 sm:p-6 border border-white/8">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">
              AI vision · multi-feed
            </div>
            <div className="font-display text-xl sm:text-2xl font-semibold tracking-tight mt-1">
              Six cameras · scanning in realtime
            </div>
            <div className="mt-2 text-sm text-white/55 max-w-xl">
              Every frame is analyzed by the on-edge neural network. Bounding boxes update live
              when species are detected. High-threat events automatically arm deterrence.
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2">
            <span className="pill bg-moss-500/10 border border-moss-500/30 text-moss-300">
              <span className="h-1.5 w-1.5 rounded-full bg-moss-400 animate-blink" /> 6/6 online
            </span>
          </div>
        </div>
      </div>

      <DetectionMonitor />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
        <DetectionTimeline />
        <EventStream />
      </div>
    </motion.div>
  );
}
