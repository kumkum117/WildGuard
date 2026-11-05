import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Siren, VolumeX, Volume2, Square } from 'lucide-react';
import type { SirenPattern } from '../../types';
import { useDeterrenceStore } from '../../store/deterrenceStore';
import { useAudioState } from '../../hooks/useNow';
import { sirenEngine, PATTERN_INFO } from '../../utils/sirenEngine';
import HoldButton from './HoldButton';
import { cn } from '../../utils/cn';

const PATTERNS: SirenPattern[] = ['wail', 'yelp', 'hilo', 'pulse', 'bee'];

// Tiny waveform glyph per pattern (16×10 viewBox paths).
const GLYPH: Record<SirenPattern, string> = {
  wail: 'M0 8 Q4 0 8 5 T16 2',
  yelp: 'M0 5 Q2 0 4 5 T8 5 T12 5 T16 5',
  hilo: 'M0 7 H4 V3 H8 V7 H12 V3 H16',
  pulse: 'M0 8 H3 V2 H5 V8 H8 V2 H10 V8 H13 V2 H15 V8',
  bee: 'M0 5 L1 3 L2 7 L3 2 L4 8 L5 4 L6 6 L7 2 L8 8 L9 3 L10 7 L11 4 L12 6 L13 2 L14 8 L15 5 L16 4',
};

export const Glyph = ({ pattern, className }: { pattern: SirenPattern; className?: string }) => (
  <svg viewBox="0 0 16 10" className={cn('h-2.5 w-5', className)} fill="none" stroke="currentColor" strokeWidth="1.3">
    <path d={GLYPH[pattern]} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

interface Props {
  zones: string[];
}

export default function SirenCard({ zones }: Props) {
  const server = useDeterrenceStore((s) => s.server);
  const pending = useDeterrenceStore((s) => s.pending);
  const playHere = useDeterrenceStore((s) => s.playHere);
  const volume = useDeterrenceStore((s) => s.volume);
  const { fire, setStyle, setPlayHere, setVolume } = useDeterrenceStore.getState();
  const active = server.siren;
  const reduce = useReducedMotion();

  return (
    <div
      data-testid="siren-card"
      className={cn(
        'relative glass rounded-2xl p-5 border overflow-hidden transition-colors',
        active ? 'border-threat-500/45 shadow-glow-threat' : 'border-white/8'
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <motion.div
            animate={active && !reduce ? { rotate: [-8, 8, -8] } : { rotate: 0 }}
            transition={{ duration: 0.5, repeat: active && !reduce ? Infinity : 0 }}
            className={cn(
              'h-11 w-11 grid place-items-center rounded-xl border',
              active ? 'bg-threat-500/15 border-threat-500/40 text-threat-300' : 'bg-white/5 border-white/10 text-white/60'
            )}
          >
            <Siren size={20} />
          </motion.div>
          <div>
            <div className="font-display text-base font-semibold tracking-tight">Siren</div>
            <div className="text-xs text-white/45 mt-0.5">{PATTERN_INFO[server.pattern].hint}</div>
          </div>
        </div>
        <span
          className={cn(
            'pill border text-[10px] uppercase tracking-wider',
            active ? 'bg-threat-500/15 border-threat-500/40 text-threat-300' : 'bg-white/5 border-white/10 text-white/45'
          )}
        >
          {active ? 'Sounding' : 'Off'}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-5 gap-1 p-1 rounded-xl bg-white/3 border border-white/8" role="radiogroup" aria-label="Siren pattern">
        {PATTERNS.map((p) => (
          <button
            key={p}
            role="radio"
            aria-checked={server.pattern === p}
            title={PATTERN_INFO[p].hint}
            disabled={pending.style}
            onClick={() => setStyle({ pattern: p })}
            className={cn(
              'flex flex-col items-center gap-1 px-1 py-1.5 rounded-lg text-[10px] font-medium transition',
              server.pattern === p ? 'bg-threat-500/20 text-threat-200' : 'text-white/50 hover:text-white hover:bg-white/5'
            )}
          >
            <Glyph pattern={p} />
            {PATTERN_INFO[p].label}
          </button>
        ))}
      </div>

      <Waveform active={active && playHere} />

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => setPlayHere(!playHere)}
          title={playHere ? 'Mute on this device only' : 'Play the siren on this device'}
          className={cn(
            'h-8 w-8 grid place-items-center rounded-lg border transition shrink-0',
            playHere ? 'bg-moss-500/15 border-moss-500/30 text-moss-300' : 'bg-white/5 border-white/10 text-white/45'
          )}
        >
          {playHere ? <Volume2 size={14} /> : <VolumeX size={14} />}
        </button>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(volume * 100)}
          onChange={(e) => setVolume(Number(e.target.value) / 100)}
          disabled={!playHere}
          aria-label="Siren volume on this device"
          className="flex-1 accent-threat-500 disabled:opacity-40"
        />
        <span className="font-mono text-[10px] text-white/40 w-16 text-right">this device</span>
      </div>

      <div className="mt-4">
        {active ? (
          <button
            onClick={() => fire({ siren: false })}
            disabled={pending.fire}
            data-testid="siren-off"
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/12 text-sm transition disabled:opacity-50"
          >
            <Square size={13} /> Silence siren
          </button>
        ) : (
          <HoldButton
            testId="siren-hold"
            onConfirm={() => fire({ siren: true, pattern: server.pattern, zones })}
            disabled={pending.fire}
            hint="Hold to sound the siren"
            className="w-full py-2.5 rounded-xl bg-threat-500/12 hover:bg-threat-500/20 border border-threat-500/35 text-threat-200 text-sm font-medium"
          >
            <Siren size={14} /> Hold to sound siren
          </HoldButton>
        )}
      </div>
    </div>
  );
}

function Waveform({ active }: { active: boolean }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const audio = useAudioState();
  const live = active && audio === 'playing';

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const buf = new Uint8Array(new ArrayBuffer(128));
    let raf = 0;
    const draw = () => {
      const w = (el.width = el.clientWidth * devicePixelRatio);
      const h = (el.height = el.clientHeight * devicePixelRatio);
      ctx.clearRect(0, 0, w, h);
      const bars = 40;
      if (live) sirenEngine.waveform(buf);
      for (let i = 0; i < bars; i++) {
        const v = live ? Math.abs(buf[Math.floor((i / bars) * buf.length)] - 128) / 128 : 0;
        const bh = Math.max(2 * devicePixelRatio, v * h * 1.6);
        ctx.fillStyle = live ? `rgba(248,113,113,${0.35 + v})` : 'rgba(255,255,255,0.12)';
        const bw = (w / bars) * 0.6;
        ctx.fillRect(i * (w / bars), (h - bh) / 2, bw, bh);
      }
      if (live && !document.hidden) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [live]);

  return (
    <div className="mt-3 relative">
      <canvas ref={canvas} className="w-full h-10 block" aria-hidden />
      {active && audio === 'locked' && (
        <button
          onClick={() => sirenEngine.unlock()}
          className="absolute inset-0 grid place-items-center text-[11px] text-amber2-300 bg-forest-950/60 rounded-lg"
        >
          Browser blocked audio — tap to hear the siren here
        </button>
      )}
      {!active && (
        <div className="absolute inset-0 grid place-items-center font-mono text-[10px] uppercase tracking-wider text-white/30 pointer-events-none">
          silent
        </div>
      )}
    </div>
  );
}
