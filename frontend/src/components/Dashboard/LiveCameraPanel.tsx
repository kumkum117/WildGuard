// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera as CameraIcon, Radio, MapPin } from 'lucide-react';
import { useDetectionStore } from '../../store/detectionStore';
import { formatTime } from '../../utils/formatters';
import { cn } from '../../utils/cn';

export default function LiveCameraPanel() {
  const cameras = useDetectionStore((s) => s.cameras);
  const detections = useDetectionStore((s) => s.detections);
  const threatState = useDetectionStore((s) => s.threatState);
  const [activeCamId, setActiveCamId] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(i);
  }, []);

  const activeCam = cameras.find((c) => c.id === activeCamId) || cameras[0];
  const latestDet = useMemo(
    () => detections.find((d) => d.cameraId === activeCam?.id) || detections[0],
    [detections, activeCam]
  );

  if (!activeCam) return null;

  const isThreat = threatState === 'alert';
  const isDetected = threatState === 'detected';

  return (
    <div
      data-testid="live-camera-panel"
      className={cn(
        'relative noise glass rounded-3xl overflow-hidden border transition-all',
        isThreat
          ? 'border-threat-500/40 glow-threat-strong'
          : isDetected
          ? 'border-amber2-500/30 shadow-glow-amber'
          : 'border-white/8'
      )}
    >
      {/* Image */}
      <div className="relative aspect-[16/10] overflow-hidden group">
        <motion.img
          key={activeCam.id}
          src={activeCam.imageUrl}
          alt={activeCam.name}
          initial={{ scale: 1.06, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.7 }}
          className="absolute inset-0 h-full w-full object-cover group-hover:scale-105 transition-transform duration-[1.6s]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-forest-900/95 via-forest-900/30 to-transparent" />
        <div className="scanline" />

        {/* HUD top */}
        <div className="absolute inset-x-0 top-0 p-5 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-threat-500/15 border border-threat-500/40">
              <span className="h-1.5 w-1.5 rounded-full bg-threat-500 animate-blink" />
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-threat-300">
                Live
              </span>
            </div>
            <div className="font-mono text-[11px] text-white/70 tracking-wide">
              {activeCam.id} · {activeCam.name.split('—')[1]?.trim() || activeCam.name}
            </div>
          </div>
          <div className="text-right font-mono text-[11px] text-white/60">
            <div>{formatTime(now.toISOString())}</div>
            <div className="text-white/35 mt-0.5">{now.toDateString()}</div>
          </div>
        </div>

        {/* Bounding box overlay */}
        <AnimatePresence>
          {latestDet && (
            <motion.div
              key={latestDet.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.35 }}
              className="absolute border-2"
              style={{
                left: `${latestDet.bbox.x * 100}%`,
                top: `${latestDet.bbox.y * 100}%`,
                width: `${latestDet.bbox.w * 100}%`,
                height: `${latestDet.bbox.h * 100}%`,
                borderColor:
                  latestDet.threatLevel === 'high'
                    ? '#EF4444'
                    : latestDet.threatLevel === 'medium'
                    ? '#F59E0B'
                    : '#10B981',
                boxShadow:
                  latestDet.threatLevel === 'high'
                    ? '0 0 32px rgba(239,68,68,0.45)'
                    : '0 0 16px rgba(16,185,129,0.25)',
              }}
            >
              <div
                className="absolute -top-7 left-0 px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider"
                style={{
                  background:
                    latestDet.threatLevel === 'high'
                      ? 'rgba(239,68,68,0.9)'
                      : latestDet.threatLevel === 'medium'
                      ? 'rgba(245,158,11,0.9)'
                      : 'rgba(16,185,129,0.9)',
                  color: '#0A0E0C',
                }}
              >
                {latestDet.species} · {latestDet.confidence}%
              </div>
              {/* corner ticks */}
              {['tl', 'tr', 'bl', 'br'].map((c) => (
                <span
                  key={c}
                  className="absolute h-2.5 w-2.5 border-current"
                  style={{
                    [c.includes('t') ? 'top' : 'bottom']: -1,
                    [c.includes('l') ? 'left' : 'right']: -1,
                    borderTopWidth: c.includes('t') ? 2 : 0,
                    borderBottomWidth: c.includes('b') ? 2 : 0,
                    borderLeftWidth: c.includes('l') ? 2 : 0,
                    borderRightWidth: c.includes('r') ? 2 : 0,
                  }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* HUD bottom info */}
        <div className="absolute inset-x-0 bottom-0 p-5 flex items-end justify-between gap-4">
          <div className="space-y-1">
            {latestDet && (
              <div className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">
                {latestDet.species}{' '}
                <span className="text-moss-300 font-mono text-base align-middle">
                  · {latestDet.confidence}% confidence
                </span>
              </div>
            )}
            <div className="flex items-center gap-3 text-xs text-white/60">
              <span className="inline-flex items-center gap-1 font-mono">
                <MapPin size={12} />
                {activeCam.location.lat.toFixed(4)}°N, {activeCam.location.lng.toFixed(4)}°E
              </span>
              <span className="inline-flex items-center gap-1">
                <Radio size={12} /> 4G · 78%
              </span>
            </div>
          </div>
          {isThreat && (
            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              className="px-3 py-2 rounded-xl bg-threat-500/15 border border-threat-500/40 shadow-glow-threat"
            >
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-threat-300">
                Threat detected
              </div>
              <div className="text-sm font-medium text-threat-200">Auto-deterrence armed</div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Strip selector */}
      <div className="flex overflow-x-auto gap-2 p-4 border-t border-white/5">
        {cameras.map((c) => {
          const isActive = c.id === activeCam.id;
          return (
            <button
              key={c.id}
              onClick={() => setActiveCamId(c.id)}
              data-testid={`cam-thumb-${c.id}`}
              className={cn(
                'group relative shrink-0 w-32 h-20 rounded-lg overflow-hidden border transition',
                isActive
                  ? 'border-moss-400/60 shadow-glow-safe'
                  : 'border-white/8 hover:border-white/20 opacity-75 hover:opacity-100'
              )}
            >
              <img src={c.imageUrl} alt={c.name} className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-forest-900/90 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 px-2 py-1 text-left">
                <div className="flex items-center gap-1.5">
                  <CameraIcon size={10} className="text-white/70" />
                  <span className="font-mono text-[9px] uppercase tracking-wider text-white/70">
                    {c.id}
                  </span>
                </div>
              </div>
              {c.status === 'maintenance' && (
                <div className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-amber2-500" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
