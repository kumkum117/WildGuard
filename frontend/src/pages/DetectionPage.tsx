// @ts-nocheck
import { motion } from 'framer-motion';
import DetectionMonitor from '../components/Detection/DetectionMonitor';
import DetectionTimeline from '../components/Detection/DetectionTimeline';
import EventStream from '../components/Detection/EventStream';
import { useDetectionStore } from '../store/detectionStore';

const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

export default function DetectionPage() {
  const cameras = useDetectionStore((s) => s.cameras);
  const online = cameras.filter((c) => c.status === 'online').length;
  const count = NUMBER_WORDS[cameras.length] ?? String(cameras.length);
  const nightCams = cameras.filter((c) => c.lighting?.is_night).length;
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
              {count} camera{cameras.length === 1 ? '' : 's'} · scanning in realtime
            </div>
            <div className="mt-2 text-sm text-white/55 max-w-xl">
              Every feed is analysed by the on-edge neural network — dark and infrared frames are
              enhanced automatically for night detection. High-threat events arm deterrence.
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2">
            {nightCams > 0 && (
              <span className="pill bg-moss-500/10 border border-moss-500/30 text-moss-300">
                Night vision · {nightCams}
              </span>
            )}
            <span className="pill bg-moss-500/10 border border-moss-500/30 text-moss-300">
              <span className="h-1.5 w-1.5 rounded-full bg-moss-400 animate-blink" /> {online}/{cameras.length} online
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
