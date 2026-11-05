// @ts-nocheck
import type { Alert } from '../../types';
import { cn } from '../../utils/cn';
import GlowingBadge from '../Common/GlowingBadge';
import { formatRelative, formatGps } from '../../utils/formatters';
import { Check, MapPin, Camera as CameraIcon, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';

interface Props {
  alert: Alert;
  onOpen: () => void;
  onAcknowledge: () => void;
  onResolve: () => void;
}

export default function AlertCard({ alert, onOpen, onAcknowledge, onResolve }: Props) {
  const isHigh = alert.threatLevel === 'high';
  return (
    <motion.div
      whileHover={{ y: -3 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'glass rounded-2xl overflow-hidden border transition-colors',
        isHigh && alert.status === 'active'
          ? 'border-threat-500/40 shadow-glow-threat'
          : 'border-white/8 hover:border-white/20'
      )}
      data-testid={`alert-card-${alert.id}`}
    >
      <div className="flex">
        <div className="relative w-32 sm:w-40 shrink-0">
          <img src={alert.imageUrl} alt={alert.animal} className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent to-forest-900/60" />
          <div className="absolute top-2 left-2">
            <GlowingBadge level={alert.threatLevel}>{alert.threatLevel}</GlowingBadge>
          </div>
        </div>
        <div className="p-4 flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-display text-lg font-semibold tracking-tight">{alert.animal}</div>
              <div className="text-xs text-white/45 mt-0.5">{alert.message}</div>
            </div>
            <span
              className={cn(
                'pill border text-[10px] uppercase tracking-wider',
                alert.status === 'active'
                  ? 'bg-threat-500/10 border-threat-500/30 text-threat-300'
                  : alert.status === 'acknowledged'
                  ? 'bg-amber2-500/10 border-amber2-500/30 text-amber2-300'
                  : 'bg-moss-500/10 border-moss-500/30 text-moss-300'
              )}
            >
              {alert.status}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] font-mono text-white/45">
            <div className="inline-flex items-center gap-1.5">
              <CameraIcon size={11} /> {alert.cameraId}
            </div>
            <div className="inline-flex items-center gap-1.5">
              <MapPin size={11} /> {alert.location.name}
            </div>
            <div>{formatGps(alert.location.lat, alert.location.lng)}</div>
            <div>{formatRelative(alert.timestamp)} · {alert.confidence}%</div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={onOpen}
              className="text-xs px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition"
              data-testid={`alert-view-${alert.id}`}
            >
              View
            </button>
            {alert.status === 'active' && (
              <button
                onClick={onAcknowledge}
                className="text-xs px-3 py-1.5 rounded-lg bg-amber2-500/15 hover:bg-amber2-500/25 border border-amber2-500/30 text-amber2-300 inline-flex items-center gap-1.5 transition"
                data-testid={`alert-ack-${alert.id}`}
              >
                <Check size={12} /> Acknowledge
              </button>
            )}
            {alert.status !== 'resolved' && (
              <button
                onClick={onResolve}
                className="text-xs px-3 py-1.5 rounded-lg bg-moss-500/15 hover:bg-moss-500/25 border border-moss-500/30 text-moss-300 inline-flex items-center gap-1.5 transition"
                data-testid={`alert-resolve-${alert.id}`}
              >
                <ShieldCheck size={12} /> Resolve
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
