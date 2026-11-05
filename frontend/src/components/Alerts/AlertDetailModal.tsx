// @ts-nocheck
import { AnimatePresence, motion } from 'framer-motion';
import type { Alert } from '../../types';
import {
  X,
  MapPin,
  Camera as CameraIcon,
  Calendar,
  Check,
  ShieldCheck,
  FileText,
  User,
  PlayCircle,
  Send,
} from 'lucide-react';
import GlowingBadge from '../Common/GlowingBadge';
import { formatTime, formatGps } from '../../utils/formatters';
import { useState } from 'react';
import { cn } from '../../utils/cn';

interface Props {
  alert: Alert | null;
  onClose: () => void;
  onAcknowledge: () => void;
  onResolve: () => void;
}

type ReportView = 'officer' | 'civilian';

const isWildArea = (alert: Alert) => alert.location.lat > 12.9695;

export default function AlertDetailModal({ alert, onClose, onAcknowledge, onResolve }: Props) {
  const [view, setView] = useState<ReportView>('officer');
  const [authoritiesNotified, setAuthoritiesNotified] = useState(false);

  const frames = alert
    ? Array.from({ length: 4 }).map((_, i) => ({
        id: `f-${i}`,
        url: alert.imageUrl!,
        offsetMs: i * 240,
        scale: 1 + i * 0.04,
        translateX: -2 + i * 1.5,
      }))
    : [];

  return (
    <AnimatePresence>
      {alert && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm grid place-items-center p-4 overflow-y-auto"
          onClick={onClose}
          data-testid="alert-detail-modal"
        >
          <motion.div
            initial={{ y: 16, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 12, opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.25 }}
            onClick={(e) => e.stopPropagation()}
            className="glass-strong rounded-3xl max-w-3xl w-full overflow-hidden border border-white/10 my-8"
          >
            <div className="relative aspect-[16/9]">
              <img src={alert.imageUrl} alt={alert.animal} className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-forest-900/95 via-forest-900/40 to-transparent" />
              <button
                onClick={onClose}
                className="absolute top-4 right-4 h-8 w-8 grid place-items-center rounded-full bg-black/50 backdrop-blur-md border border-white/10 hover:bg-black/70"
                data-testid="alert-modal-close"
              >
                <X size={15} />
              </button>
              <div className="absolute bottom-4 left-5 right-5 flex items-end justify-between">
                <div>
                  <GlowingBadge level={alert.threatLevel}>{alert.threatLevel} threat</GlowingBadge>
                  <div className="font-display text-3xl font-semibold tracking-tight mt-2">{alert.animal}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-2xl text-moss-300">{alert.confidence}%</div>
                  <div className="font-mono text-[10px] text-white/40 uppercase tracking-wider">confidence</div>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1 p-1 rounded-xl bg-white/3 border border-white/8">
                  <ViewBtn active={view === 'officer'} onClick={() => setView('officer')} icon={<FileText size={12} />} label="Officer report" testid="view-officer" />
                  <ViewBtn active={view === 'civilian'} onClick={() => setView('civilian')} icon={<User size={12} />} label="Civilian alert" testid="view-civilian" />
                </div>
                {isWildArea(alert) && (
                  <span className="pill bg-threat-500/12 border border-threat-500/30 text-threat-300 text-[10px] uppercase tracking-wider">
                    Wild area · authority dispatch advised
                  </span>
                )}
              </div>

              <AnimatePresence mode="wait">
                {view === 'officer' ? (
                  <motion.div key="officer" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }} className="space-y-5">
                    <p className="text-sm text-white/65 leading-relaxed">
                      {alert.message}. Detected via thermal + visual AI on <span className="text-white/90">{alert.cameraName}</span>. Ranger response recommended within 5 minutes.{' '}
                      {isWildArea(alert) ? 'Location is inside the Forest Buffer — escalate to Forest Department.' : 'Location is near the village perimeter — initiate non-lethal deterrence.'}
                    </p>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/45 inline-flex items-center gap-1.5">
                          <PlayCircle size={11} /> Video log · capture sequence
                        </div>
                        <span className="font-mono text-[10px] text-white/40">4 frames · 960ms</span>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        {frames.map((f, i) => (
                          <motion.div
                            key={f.id}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: i * 0.06 }}
                            className="relative aspect-video rounded-lg overflow-hidden border border-white/8 group"
                            data-testid={`video-frame-${i}`}
                          >
                            <img src={f.url} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ transform: `scale(${f.scale}) translateX(${f.translateX}%)` }} />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                            <div className="absolute bottom-1 left-1.5 font-mono text-[8px] text-white/80 uppercase tracking-wider">T+{f.offsetMs}ms</div>
                            {i === 1 && <div className="absolute top-1 right-1 px-1 py-0.5 rounded bg-threat-500/90 text-forest-900 font-mono text-[8px] font-semibold">LOCK</div>}
                          </motion.div>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Info icon={<CameraIcon size={13} />} label="Source" value={alert.cameraId} />
                      <Info icon={<MapPin size={13} />} label="Location" value={alert.location.name} />
                      <Info icon={<MapPin size={13} />} label="GPS pinpoint" value={formatGps(alert.location.lat, alert.location.lng)} />
                      <Info icon={<Calendar size={13} />} label="Time" value={formatTime(alert.timestamp)} />
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="civilian" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }} className="space-y-4">
                    <div className="rounded-2xl p-5 border border-threat-500/35 bg-threat-500/8 shadow-glow-threat">
                      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-threat-300">Public safety advisory</div>
                      <div className="font-display text-2xl font-semibold tracking-tight mt-2">⚠ {alert.animal} sighted near {alert.location.name}</div>
                      <p className="mt-3 text-sm text-white/80 leading-relaxed">
                        Wildlife has been detected close to your area. Please <strong className="text-white">stay indoors</strong>, keep livestock secured, and avoid outdoor movement. Officers have been notified and the situation is being managed.
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-mono uppercase tracking-wider">
                        <span className="pill bg-white/5 border border-white/10 text-white/70">Time {formatTime(alert.timestamp)}</span>
                        <span className="pill bg-white/5 border border-white/10 text-white/70">Area {alert.location.name}</span>
                      </div>
                    </div>
                    <div className="text-xs text-white/45 leading-relaxed">
                      This advisory hides technical details (GPS, confidence %, frame data) — those are visible only to authorised rangers in the Officer report tab.
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex flex-wrap gap-2 pt-1">
                {alert.status === 'active' && (
                  <button onClick={() => onAcknowledge()} className="px-4 py-2.5 rounded-xl bg-amber2-500/15 hover:bg-amber2-500/25 border border-amber2-500/30 text-amber2-300 text-sm inline-flex items-center gap-2 transition" data-testid="modal-acknowledge">
                    <Check size={14} /> Acknowledge
                  </button>
                )}
                {isWildArea(alert) && (
                  <button
                    onClick={() => setAuthoritiesNotified(true)}
                    disabled={authoritiesNotified}
                    className={cn('px-4 py-2.5 rounded-xl text-sm inline-flex items-center gap-2 transition border', authoritiesNotified ? 'bg-moss-500/15 border-moss-500/30 text-moss-300' : 'bg-threat-500/15 hover:bg-threat-500/25 border-threat-500/30 text-threat-300')}
                    data-testid="modal-notify-authority"
                  >
                    <Send size={14} /> {authoritiesNotified ? 'Forest Dept. notified' : 'Notify Forest Dept.'}
                  </button>
                )}
                {alert.status !== 'resolved' && (
                  <button onClick={() => { onResolve(); onClose(); }} className="px-4 py-2.5 rounded-xl bg-moss-500/15 hover:bg-moss-500/25 border border-moss-500/30 text-moss-300 text-sm inline-flex items-center gap-2 transition" data-testid="modal-resolve">
                    <ShieldCheck size={14} /> Mark resolved
                  </button>
                )}
                <button onClick={onClose} className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm transition ml-auto" data-testid="modal-dismiss">
                  Dismiss
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const Info = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
  <div className="glass rounded-xl p-3 border border-white/5">
    <div className="font-mono text-[10px] uppercase tracking-wider text-white/40 inline-flex items-center gap-1.5">
      {icon} {label}
    </div>
    <div className="mt-1 text-sm font-medium">{value}</div>
  </div>
);

const ViewBtn = ({ active, onClick, icon, label, testid }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; testid: string }) => (
  <button data-testid={testid} onClick={onClick} className={cn('px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition', active ? 'bg-moss-500/20 text-moss-200' : 'text-white/55 hover:text-white')}>
    {icon} {label}
  </button>
);
