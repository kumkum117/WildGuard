// @ts-nocheck
import { motion } from 'framer-motion';
import { useDetectionStore } from '../../store/detectionStore';
import { useAlertStore } from '../../store/alertStore';
import { MapPin, Shield, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../../utils/cn';

// Project (lat, lng) into 0–100% map coordinates.
const LAT_MIN = 12.958;
const LAT_MAX = 12.978;
const LNG_MIN = 77.578;
const LNG_MAX = 77.600;

const project = (lat: number, lng: number) => ({
  x: ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * 100,
  y: ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * 100,
});

const ZONES = [
  {
    id: 'safe',
    name: 'Village Safe Zone',
    type: 'safe' as const,
    points: [
      { lat: 12.967, lng: 77.587 },
      { lat: 12.967, lng: 77.593 },
      { lat: 12.962, lng: 77.593 },
      { lat: 12.962, lng: 77.587 },
    ],
  },
  {
    id: 'buffer',
    name: 'Forest Buffer',
    type: 'caution' as const,
    points: [
      { lat: 12.974, lng: 77.582 },
      { lat: 12.974, lng: 77.598 },
      { lat: 12.967, lng: 77.598 },
      { lat: 12.967, lng: 77.582 },
    ],
  },
  {
    id: 'wild',
    name: 'Deep Wild · Restricted',
    type: 'wild' as const,
    points: [
      { lat: 12.978, lng: 77.579 },
      { lat: 12.978, lng: 77.600 },
      { lat: 12.974, lng: 77.600 },
      { lat: 12.974, lng: 77.579 },
    ],
  },
];

const zoneStyle = {
  safe: { fill: 'rgba(16, 185, 129, 0.10)', stroke: 'rgba(16, 185, 129, 0.55)' },
  caution: { fill: 'rgba(245, 158, 11, 0.10)', stroke: 'rgba(245, 158, 11, 0.55)' },
  wild: { fill: 'rgba(239, 68, 68, 0.07)', stroke: 'rgba(239, 68, 68, 0.45)' },
};

export default function MapSection() {
  const cameras = useDetectionStore((s) => s.cameras);
  const alerts = useAlertStore((s) => s.alerts);
  const activeAlerts = alerts.filter((a) => a.status === 'active').slice(0, 6);
  const [showZones, setShowZones] = useState(true);

  return (
    <div data-testid="map-section" className="glass rounded-3xl border border-white/8 overflow-hidden">
      <div className="flex items-center justify-between p-5 sm:p-6 pb-4 flex-wrap gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">
            Geo overview · live pinpoints
          </div>
          <div className="font-display text-lg font-semibold tracking-tight mt-1">
            Forest perimeter map
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            data-testid="toggle-zones"
            onClick={() => setShowZones((v) => !v)}
            className={cn(
              'pill border text-[10px] uppercase tracking-wider transition',
              showZones
                ? 'bg-moss-500/15 border-moss-500/40 text-moss-300'
                : 'bg-white/3 border-white/10 text-white/45'
            )}
          >
            <Shield size={11} /> Geo-fence
          </button>
          <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-wider text-white/40">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-moss-400" /> Safe
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber2-500" /> Buffer
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-threat-500 animate-blink" /> Breach
            </span>
          </div>
        </div>
      </div>

      <div className="relative aspect-[16/9] mx-5 sm:mx-6 mb-6 rounded-2xl overflow-hidden border border-white/8 bg-forest-950">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <defs>
            <pattern id="topo" x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M0 5 Q 5 2.5 10 5 T 20 5" fill="none" stroke="rgba(16,185,129,0.12)" strokeWidth="0.12" />
              <path d="M0 7.5 Q 5 10 10 7.5 T 20 7.5" fill="none" stroke="rgba(16,185,129,0.06)" strokeWidth="0.12" />
            </pattern>
            <radialGradient id="forest" cx="50%" cy="50%" r="65%">
              <stop offset="0%" stopColor="#0F1E18" />
              <stop offset="100%" stopColor="#060908" />
            </radialGradient>
          </defs>
          <rect width="100" height="100" fill="url(#forest)" />
          <rect width="100" height="100" fill="url(#topo)" />
          <path d="M -2 70 C 20 62, 40 78, 60 64 S 95 45, 102 53" stroke="rgba(96,165,250,0.35)" strokeWidth="0.4" fill="none" />
          <ellipse cx="22" cy="35" rx="15" ry="8" fill="rgba(16,185,129,0.08)" />
          <ellipse cx="72" cy="26" rx="20" ry="9" fill="rgba(16,185,129,0.06)" />
          <ellipse cx="80" cy="77" rx="18" ry="8" fill="rgba(16,185,129,0.08)" />

          {showZones &&
            ZONES.map((z) => {
              const pts = z.points
                .map((p) => {
                  const { x, y } = project(p.lat, p.lng);
                  return `${x},${y}`;
                })
                .join(' ');
              const s = zoneStyle[z.type];
              return (
                <polygon
                  key={z.id}
                  points={pts}
                  fill={s.fill}
                  stroke={s.stroke}
                  strokeWidth="0.2"
                  strokeDasharray="0.6 0.4"
                />
              );
            })}

          <rect x="44" y="50" width="12" height="10" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.18)" strokeWidth="0.15" rx="0.6" />
          <text x="50" y="56" textAnchor="middle" fill="rgba(255,255,255,0.55)" fontSize="2.2" fontFamily="JetBrains Mono">
            VILLAGE
          </text>
        </svg>

        {showZones && (
          <>
            <ZoneLabel name="Village Safe Zone" lat={12.9645} lng={77.59} tone="safe" />
            <ZoneLabel name="Forest Buffer" lat={12.9705} lng={77.583} tone="caution" />
            <ZoneLabel name="Deep Wild" lat={12.976} lng={77.585} tone="wild" />
          </>
        )}

        {cameras.map((c) => {
          const { x, y } = project(c.location.lat, c.location.lng);
          return (
            <div key={c.id} className="absolute -translate-x-1/2 -translate-y-1/2 group" style={{ left: `${x}%`, top: `${y}%` }}>
              <div className="relative h-2 w-2 rounded-full bg-moss-400 ring-4 ring-moss-400/15" />
              <div className="absolute left-3 -top-1 opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap">
                <div className="glass-strong rounded px-1.5 py-0.5 font-mono text-[9px]">
                  <span className="text-white/80">{c.id}</span> <span className="text-white/40">{c.location.name}</span>
                </div>
              </div>
            </div>
          );
        })}

        {activeAlerts.map((a) => {
          const { x, y } = project(a.location.lat, a.location.lng);
          const isHigh = a.threatLevel === 'high';
          return (
            <motion.div
              key={a.id}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.4 }}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              <span
                className={cn('absolute inset-0 rounded-full animate-ping', isHigh ? 'bg-threat-500/40' : 'bg-amber2-500/40')}
                style={{ width: 18, height: 18, left: -9, top: -9 }}
              />
              <div
                className={cn(
                  'relative h-2.5 w-2.5 rounded-full ring-4',
                  isHigh ? 'bg-threat-500 ring-threat-500/25 animate-blink' : 'bg-amber2-500 ring-amber2-500/25'
                )}
              />
              <div className="absolute left-4 -top-0.5 pointer-events-none whitespace-nowrap">
                <div
                  className={cn(
                    'rounded px-1.5 py-0.5 font-mono text-[9px] backdrop-blur-md',
                    isHigh ? 'bg-threat-500/20 border border-threat-500/40 text-threat-200' : 'bg-amber2-500/20 border border-amber2-500/40 text-amber2-200'
                  )}
                >
                  <AlertTriangle size={8} className="inline mr-1" />
                  {a.animal} · {a.location.lat.toFixed(4)}°N
                </div>
              </div>
            </motion.div>
          );
        })}

        <div className="absolute bottom-2 left-3 font-mono text-[9px] text-white/30 uppercase tracking-wider">
          {LAT_MIN.toFixed(3)}–{LAT_MAX.toFixed(3)}°N · {LNG_MIN.toFixed(3)}–{LNG_MAX.toFixed(3)}°E
        </div>
        <div className="absolute bottom-2 right-3 font-mono text-[9px] text-moss-300 uppercase tracking-wider inline-flex items-center gap-1">
          <MapPin size={9} /> {activeAlerts.length} active
        </div>
      </div>
    </div>
  );
}

const ZoneLabel = ({ name, lat, lng, tone }: { name: string; lat: number; lng: number; tone: 'safe' | 'caution' | 'wild' }) => {
  const { x, y } = project(lat, lng);
  const toneClass = tone === 'safe' ? 'text-moss-300/80' : tone === 'caution' ? 'text-amber2-300/80' : 'text-threat-300/70';
  return (
    <div className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none" style={{ left: `${x}%`, top: `${y}%` }}>
      <div className={`font-mono text-[9px] uppercase tracking-[0.2em] ${toneClass}`}>{name}</div>
    </div>
  );
};