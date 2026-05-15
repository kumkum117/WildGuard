// @ts-nocheck
import { motion } from 'framer-motion';
import { useAlertStore } from '../../store/alertStore';
import { formatRelative } from '../../utils/formatters';
import GlowingBadge from '../Common/GlowingBadge';
import { MapPin, ArrowUpRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function RecentAlerts() {
  const alerts = useAlertStore((s) => s.alerts);
  const nav = useNavigate();
  const recent = alerts.slice(0, 5);

  return (
    <div data-testid="recent-alerts" className="glass rounded-3xl p-5 sm:p-6 border border-white/8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">
            Recent activity
          </div>
          <div className="font-display text-lg font-semibold tracking-tight mt-1">Latest alerts</div>
        </div>
        <button
          onClick={() => nav('/alerts')}
          className="inline-flex items-center gap-1 text-xs text-moss-300 hover:text-moss-200 transition"
          data-testid="view-all-alerts"
        >
          View all <ArrowUpRight size={12} />
        </button>
      </div>

      <div className="space-y-2">
        {recent.map((a, i) => (
          <motion.div
            key={a.id}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25, delay: i * 0.04 }}
            whileHover={{ x: 2 }}
            className="group flex items-center gap-3 p-3 rounded-xl border border-white/5 hover:border-white/15 hover:bg-white/3 transition cursor-pointer"
            onClick={() => nav('/alerts')}
          >
            <div className="h-12 w-16 rounded-lg overflow-hidden border border-white/8 shrink-0 relative">
              <img src={a.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-forest-900/80 to-transparent" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="font-medium text-sm tracking-tight truncate">{a.animal}</div>
                <GlowingBadge level={a.threatLevel}>{a.threatLevel}</GlowingBadge>
              </div>
              <div className="mt-1 flex items-center gap-3 text-[11px] text-white/45 font-mono">
                <span className="inline-flex items-center gap-1">
                  <MapPin size={10} />
                  {a.location.name}
                </span>
                <span>{a.confidence}%</span>
                <span>{formatRelative(a.timestamp)}</span>
              </div>
            </div>
          </motion.div>
        ))}
        {recent.length === 0 && (
          <div className="py-8 text-center text-sm text-white/40">No alerts yet — all calm.</div>
        )}
      </div>
    </div>
  );
}
