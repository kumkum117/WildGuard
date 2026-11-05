// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera as CameraIcon, Radio, MapPin, Moon, Cpu, CameraOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDetectionStore } from '../../store/detectionStore';
import { formatTime, formatGps } from '../../utils/formatters';
import { cn } from '../../utils/cn';
import LiveFeed from '../Common/LiveFeed';
import { useDeterrenceStore } from '../../store/deterrenceStore';

const RECENT_MS = 2 * 60 * 1000;

export default function LiveCameraPanel() {
  const cameras = useDetectionStore((s) => s.cameras);
  const detections = useDetectionStore((s) => s.detections);
  const threatState = useDetectionStore((s) => s.threatState);
  const deterrence = useDeterrenceStore((s) => s.server);
  const [activeCamId, setActiveCamId] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  const nav = useNavigate();

  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(i);
  }, []);

  const activeCam = cameras.find((c) => c.id === activeCamId) || cameras[0];
  const latestDet = useMemo(() => {
    if (!activeCam?.live) return detections.find((d) => d.cameraId === activeCam?.id) || detections[0];
    // Live: only this camera's recent sightings (boxes are drawn by the server).
    const d = detections.find((x) => x.cameraId === activeCam.id);
    return d && Date.now() - new Date(d.timestamp).getTime() < RECENT_MS ? d : undefined;
  }, [detections, activeCam]);

  if (!activeCam) {
    return (
      <div className="glass rounded-3xl border border-white/8 aspect-[16/10] grid place-items-center text-center p-6">
        <div>
          <CameraOff size={28} className="mx-auto text-white/30" />
          <div className="mt-3 font-display text-lg font-semibold tracking-tight">No cameras in the fleet</div>
          <div className="mt-1 text-sm text-white/45">Add a webcam, RTSP camera or video feed to start monitoring.</div>
          <button
            onClick={() => nav('/settings')}
            className="mt-4 text-xs px-3 py-2 rounded-lg bg-moss-500/15 hover:bg-moss-500/25 border border-moss-500/30 text-moss-300 transition"
          >
            Open camera settings
          </button>
        </div>
      </div>
    );
  }
  const night = activeCam.lighting?.is_night;

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
        {activeCam.live ? (
          <LiveFeed key={activeCam.id} camera={activeCam} mode="stream" />
        ) : (
          <motion.img
            key={activeCam.id}
            src={activeCam.imageUrl}
            alt={activeCam.name}
            initial={{ scale: 1.06, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.7 }}
            className="absolute inset-0 h-full w-full object-cover group-hover:scale-105 transition-transform duration-[1.6s]"
          />
        )}
        <div
          className={cn(
            'absolute inset-0 bg-gradient-to-t pointer-events-none',
            activeCam.live ? 'from-forest-900/90 via-transparent to-forest-900/40' : 'from-forest-900/95 via-forest-900/30 to-transparent'
          )}
        />
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
              {activeCam.id} · {activeCam.location.name}
            </div>
          </div>
          <div className="text-right font-mono text-[11px] text-white/60">
            <div>{formatTime(now.toISOString())}</div>
            <div className="text-white/35 mt-0.5">{now.toDateString()}</div>
          </div>
        </div>

        {/* Bounding box overlay (demo only — live frames arrive annotated) */}
        <AnimatePresence>
          {latestDet && !activeCam.live && (
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
                {formatGps(activeCam.location.lat, activeCam.location.lng)}
              </span>
              {activeCam.live ? (
                <>
                  <span className="inline-flex items-center gap-1 font-mono">
                    <Cpu size={12} /> {activeCam.fps?.toFixed(0) ?? 0} fps · AI {Math.round(activeCam.inferenceMs ?? 0)} ms
                  </span>
                  {night && (
                    <span className="inline-flex items-center gap-1 font-mono text-moss-300">
                      <Moon size={12} /> {activeCam.lighting?.mode === 'infrared' ? 'IR night vision' : 'Low-light enhanced'}
                    </span>
                  )}
                </>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <Radio size={12} /> 4G · 78%
                </span>
              )}
            </div>
          </div>
          {(deterrence.engaged || isThreat) && (
            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              className={cn(
                'px-3 py-2 rounded-xl border',
                deterrence.siren || (isThreat && !deterrence.engaged)
                  ? 'bg-threat-500/15 border-threat-500/40 shadow-glow-threat'
                  : 'bg-amber2-500/15 border-amber2-500/40'
              )}
            >
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-threat-300">
                {deterrence.engaged ? `Deterrence · ${deterrence.last_trigger?.label ?? 'operator'}` : 'Threat detected'}
              </div>
              <div className="text-sm font-medium text-threat-200">
                {deterrence.engaged
                  ? [deterrence.siren && 'Siren', deterrence.lights && `${deterrence.light_mode} lights`].filter(Boolean).join(' + ')
                  : deterrence.mode === 'manual'
                  ? 'Manual mode — no auto response'
                  : 'Auto-deterrence armed'}
              </div>
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
              {c.live ? (
                <LiveFeed camera={c} mode="poll" intervalMs={3000} />
              ) : (
                <img src={c.imageUrl} alt={c.name} className="absolute inset-0 h-full w-full object-cover" />
              )}
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
              {c.live && c.status === 'offline' && (
                <div className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-threat-500" />
              )}
              {c.live && c.lighting?.is_night && (
                <Moon size={10} className="absolute top-1 left-1 text-moss-300" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
