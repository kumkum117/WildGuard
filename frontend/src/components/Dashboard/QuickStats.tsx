// @ts-nocheck
import { Camera, Bell, Cpu, Activity } from 'lucide-react';
import { motion } from 'framer-motion';
import AnimatedCounter from '../Common/AnimatedCounter';
import { useAlertStore } from '../../store/alertStore';
import { useDetectionStore } from '../../store/detectionStore';
import { useConnectionStore } from '../../store/connectionStore';

export default function QuickStats() {
  const alerts = useAlertStore((s) => s.alerts);
  const cameras = useDetectionStore((s) => s.cameras);
  const detections = useDetectionStore((s) => s.detections);
  const live = useConnectionStore((s) => s.mode === 'live');
  const health = useConnectionStore((s) => s.health);
  const online = cameras.filter((c) => c.status === 'online').length;

  let stats;
  if (live) {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const today = alerts.filter((a) => new Date(a.timestamp) >= midnight).length;
    const recent = detections.slice(0, 10);
    const confidence = recent.length
      ? Math.round(recent.reduce((sum, d) => sum + d.confidence, 0) / recent.length)
      : null;
    const uptimeMin = Math.floor((health?.uptime_s ?? 0) / 60);
    stats = [
      { label: 'Active cameras', value: online, suffix: `/${cameras.length}`, Icon: Camera },
      { label: 'Alerts today', value: today, suffix: '', Icon: Bell },
      { label: 'AI confidence', value: confidence, suffix: '%', Icon: Cpu },
      uptimeMin < 120
        ? { label: 'System uptime', value: uptimeMin, suffix: ' min', Icon: Activity }
        : { label: 'System uptime', value: Math.floor(uptimeMin / 60), suffix: ' h', Icon: Activity },
    ];
  } else {
    stats = [
      { label: 'Active cameras', value: online, suffix: `/${cameras.length}`, Icon: Camera },
      { label: 'Alerts today', value: alerts.length, suffix: '', Icon: Bell },
      { label: 'AI confidence', value: 98, suffix: '%', Icon: Cpu },
      { label: 'System uptime', value: 99, suffix: '.94%', Icon: Activity },
    ];
  }

  return (
    <div data-testid="quick-stats" className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {stats.map((s, i) => (
        <motion.div
          key={s.label}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: i * 0.05 }}
          whileHover={{ y: -3 }}
          className="glass rounded-2xl p-4 sm:p-5 border border-white/8 hover:border-moss-400/30 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">
              {s.label}
            </div>
            <div className="h-8 w-8 grid place-items-center rounded-lg bg-moss-500/8 border border-moss-500/20 text-moss-300">
              <s.Icon size={14} />
            </div>
          </div>
          <div className="mt-3 font-display text-3xl font-semibold tracking-tight">
            {s.value === null ? (
              <span className="font-mono text-white/40">—</span>
            ) : (
              <>
                <AnimatedCounter value={s.value} />
                <span className="text-white/40 text-xl">{s.suffix}</span>
              </>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  );
}
