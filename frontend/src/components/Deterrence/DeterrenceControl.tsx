// @ts-nocheck
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Volume2, VolumeX, Cog } from 'lucide-react';
import { useDeterrenceStore } from '../../store/deterrenceStore';
import { useDetectionStore } from '../../store/detectionStore';
import SirenToggle from './SirenToggle';
import LightToggle from './LightToggle';
import SystemStatus from './SystemStatus';
import { cn } from '../../utils/cn';

export default function DeterrenceControl() {
  const { siren, lights, sound, mode, countdownSec, setSiren, setLights, setSound, setMode, setCountdown } =
    useDeterrenceStore();
  const threatState = useDetectionStore((s) => s.threatState);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioFailed, setAudioFailed] = useState(false);

  // Countdown timer when active
  useEffect(() => {
    if (!siren && !lights) {
      setCountdown(0);
      return;
    }
    setCountdown(30);
    const i = setInterval(() => {
      setCountdown(Math.max(0, useDeterrenceStore.getState().countdownSec - 1));
      if (useDeterrenceStore.getState().countdownSec <= 0) {
        setSiren(false);
        setLights(false);
        clearInterval(i);
      }
    }, 1000);
    return () => clearInterval(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siren, lights]);

  // Audio (no autoplay; only on siren + sound + high threat)
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const shouldPlay = siren && sound && threatState === 'alert';
    if (shouldPlay) {
      el.volume = 0.4;
      el.play().catch(() => setAudioFailed(true));
    } else {
      el.pause();
      el.currentTime = 0;
    }
  }, [siren, sound, threatState]);

  return (
    <div data-testid="deterrence-control" className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <div className="glass rounded-3xl p-5 sm:p-6 border border-white/8">
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">
                  Manual override
                </div>
                <div className="font-display text-lg font-semibold tracking-tight mt-1">
                  Control deck
                </div>
              </div>

              <div className="flex items-center gap-1 p-1 rounded-xl bg-white/3 border border-white/8">
                {(['auto', 'manual'] as const).map((m) => (
                  <button
                    key={m}
                    data-testid={`mode-${m}`}
                    onClick={() => setMode(m)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-medium uppercase tracking-wider transition',
                      mode === m ? 'bg-moss-500/20 text-moss-200' : 'text-white/55 hover:text-white'
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <SirenToggle active={siren} onToggle={setSiren} />
              <LightToggle active={lights} onToggle={setLights} />
            </div>

            <div className="mt-4 flex items-center gap-3 p-3 rounded-2xl glass border border-white/5">
              <button
                data-testid="sound-toggle"
                onClick={() => setSound(!sound)}
                className={cn(
                  'h-10 w-10 grid place-items-center rounded-xl border transition',
                  sound
                    ? 'bg-moss-500/15 border-moss-500/30 text-moss-300'
                    : 'bg-white/3 border-white/8 text-white/45'
                )}
              >
                {sound ? <Volume2 size={16} /> : <VolumeX size={16} />}
              </button>
              <div className="flex-1">
                <div className="text-sm font-medium">Audio playback</div>
                <div className="text-xs text-white/45">
                  {sound
                    ? 'Plays on high-threat events only (no autoplay)'
                    : 'Muted — system events run silently'}
                  {audioFailed && ' · ⚠ browser blocked audio'}
                </div>
              </div>
            </div>
          </div>

          {/* Countdown display */}
          <CountdownPanel siren={siren} lights={lights} seconds={countdownSec} />
        </div>

        <div className="lg:col-span-1 space-y-4">
          <SystemStatus />
          <ProtocolCard threatState={threatState} mode={mode} />
        </div>
      </div>
      {/* Audio — file optional. Browser will fail silently if missing. */}
      <audio ref={audioRef} src="/siren.mp3" loop preload="none" />
    </div>
  );
}

const CountdownPanel = ({ siren, lights, seconds }: { siren: boolean; lights: boolean; seconds: number }) => {
  const active = siren || lights;
  return (
    <div
      className={cn(
        'glass rounded-3xl p-5 sm:p-6 border transition-colors',
        active ? 'border-threat-500/35 shadow-glow-threat' : 'border-white/8'
      )}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">
            Deterrence
          </div>
          <div className="font-display text-lg font-semibold tracking-tight mt-1">
            {active ? 'Activation in progress' : 'Standby — no active sequence'}
          </div>
        </div>
        <Cog size={18} className={active ? 'animate-spin text-threat-300' : 'text-white/40'} />
      </div>

      <div className="mt-5 flex items-end gap-6">
        <div className="font-mono tabular-nums">
          <motion.div
            key={seconds}
            initial={{ opacity: 0.5, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              'text-6xl sm:text-7xl font-semibold tracking-tight',
              active ? 'text-threat-300' : 'text-white/30'
            )}
          >
            {String(Math.floor(seconds / 60)).padStart(2, '0')}:
            {String(seconds % 60).padStart(2, '0')}
          </motion.div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/40 mt-1">
            Auto-disarm timer
          </div>
        </div>

        <div className="flex-1 mb-2 space-y-2">
          <Bar label="Siren intensity" value={siren ? 92 : 0} color="threat" />
          <Bar label="Light strobe" value={lights ? 70 : 0} color="amber" />
          <Bar label="Signal mesh" value={86} color="moss" />
        </div>
      </div>
    </div>
  );
};

const Bar = ({ label, value, color }: { label: string; value: number; color: 'threat' | 'amber' | 'moss' }) => (
  <div>
    <div className="flex justify-between font-mono text-[10px] uppercase tracking-wider text-white/40 mb-1">
      <span>{label}</span>
      <span className="tabular-nums">{value}%</span>
    </div>
    <div className="h-1 rounded-full bg-white/6 overflow-hidden">
      <motion.div
        initial={false}
        animate={{ width: `${value}%` }}
        transition={{ duration: 0.5 }}
        className={cn(
          'h-full',
          color === 'threat' && 'bg-threat-500',
          color === 'amber' && 'bg-amber2-500',
          color === 'moss' && 'bg-moss-400'
        )}
      />
    </div>
  </div>
);

const ProtocolCard = ({ threatState, mode }: { threatState: string; mode: string }) => (
  <div className="glass rounded-3xl p-5 sm:p-6 border border-white/8">
    <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">
      Auto protocol
    </div>
    <div className="font-display text-lg font-semibold tracking-tight mt-1">Response matrix</div>
    <div className="mt-4 space-y-2 text-sm">
      <ProtoRow label="High threat" action="Siren + lights" tone="threat" active={mode === 'auto' && threatState === 'alert'} />
      <ProtoRow label="Medium threat" action="Lights only" tone="amber" active={mode === 'auto' && threatState === 'detected'} />
      <ProtoRow label="Low threat" action="Monitor & log" tone="moss" active={mode === 'auto'} />
    </div>
    <div className="mt-4 text-[11px] text-white/40 leading-relaxed">
      Switch to <span className="text-moss-300 font-medium">Manual</span> to override automation
      during ranger field operations.
    </div>
  </div>
);

const ProtoRow = ({ label, action, tone, active }: { label: string; action: string; tone: 'threat' | 'amber' | 'moss'; active?: boolean }) => (
  <div
    className={cn(
      'flex items-center justify-between px-3 py-2 rounded-lg border',
      tone === 'threat' && 'border-threat-500/20 bg-threat-500/5',
      tone === 'amber' && 'border-amber2-500/20 bg-amber2-500/5',
      tone === 'moss' && 'border-moss-500/20 bg-moss-500/5',
      active && 'ring-1 ring-white/20'
    )}
  >
    <div className="flex items-center gap-2">
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          tone === 'threat' && 'bg-threat-500',
          tone === 'amber' && 'bg-amber2-500',
          tone === 'moss' && 'bg-moss-400'
        )}
      />
      <span className="text-white/75 font-medium">{label}</span>
    </div>
    <span className="font-mono text-[10px] uppercase tracking-wider text-white/45">{action}</span>
  </div>
);
