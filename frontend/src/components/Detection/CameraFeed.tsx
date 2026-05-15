// @ts-nocheck
import { motion, AnimatePresence } from 'framer-motion';
import { useDetectionStore } from '../../store/detectionStore';
import { cn } from '../../utils/cn';
import { Camera as CameraIcon, MapPin } from 'lucide-react';

interface Props {
  cameraId: string;
}

export default function CameraFeed({ cameraId }: Props) {
  const cameras = useDetectionStore((s) => s.cameras);
  const detections = useDetectionStore((s) => s.detections);
  const cam = cameras.find((c) => c.id === cameraId);
  if (!cam) return null;

  const latest = detections.find((d) => d.cameraId === cameraId);
  const isThreat = latest?.threatLevel === 'high';
  const isMid = latest?.threatLevel === 'medium';

  return (
    <motion.div
      layout
      className={cn(
        'relative noise rounded-2xl overflow-hidden border group transition-all',
        isThreat
          ? 'border-threat-500/45 glow-threat-strong'
          : isMid
          ? 'border-amber2-500/30 shadow-glow-amber'
          : 'border-white/8'
      )}
      data-testid={`camera-feed-${cameraId}`}
    >
      <div className="relative aspect-[4/3]">
        <img src={cam.imageUrl} alt={cam.name} className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-forest-900/95 via-forest-900/30 to-transparent" />
        <div className="scanline" />

        <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-black/40 backdrop-blur-md border border-white/8">
            <span className="h-1.5 w-1.5 rounded-full bg-threat-500 animate-blink" />
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/80">Live</span>
          </div>
          <span className="font-mono text-[10px] text-white/70 bg-black/40 px-2 py-0.5 rounded">
            {cam.id}
          </span>
        </div>

        {/* Bounding box */}
        <AnimatePresence>
          {latest && (
            <motion.div
              key={latest.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="absolute border-2"
              style={{
                left: `${latest.bbox.x * 100}%`,
                top: `${latest.bbox.y * 100}%`,
                width: `${latest.bbox.w * 100}%`,
                height: `${latest.bbox.h * 100}%`,
                borderColor:
                  latest.threatLevel === 'high'
                    ? '#EF4444'
                    : latest.threatLevel === 'medium'
                    ? '#F59E0B'
                    : '#10B981',
              }}
            >
              <div
                className="absolute -top-6 left-0 px-1.5 py-0.5 rounded text-[9px] font-mono"
                style={{
                  background:
                    latest.threatLevel === 'high'
                      ? 'rgba(239,68,68,0.9)'
                      : latest.threatLevel === 'medium'
                      ? 'rgba(245,158,11,0.9)'
                      : 'rgba(16,185,129,0.9)',
                  color: '#0A0E0C',
                }}
              >
                {latest.species} {latest.confidence}%
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom info */}
        <div className="absolute bottom-3 left-3 right-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="inline-flex items-center gap-1.5 text-[11px] text-white/70 font-medium">
                <CameraIcon size={11} /> {cam.name.split('—')[1]?.trim() || cam.name}
              </div>
              <div className="mt-0.5 inline-flex items-center gap-1.5 font-mono text-[10px] text-white/45">
                <MapPin size={9} /> {cam.location.lat.toFixed(3)}°, {cam.location.lng.toFixed(3)}°
              </div>
            </div>
            {latest && (
              <div
                className={cn(
                  'px-2 py-0.5 rounded font-mono text-[9px] uppercase tracking-wider',
                  latest.threatLevel === 'high'
                    ? 'bg-threat-500/20 text-threat-300 border border-threat-500/40'
                    : latest.threatLevel === 'medium'
                    ? 'bg-amber2-500/20 text-amber2-300 border border-amber2-500/40'
                    : 'bg-moss-500/15 text-moss-300 border border-moss-500/30'
                )}
              >
                {latest.threatLevel}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
