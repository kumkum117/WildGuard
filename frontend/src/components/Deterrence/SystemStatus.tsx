// @ts-nocheck
import { motion } from 'framer-motion';
import { useDeterrenceStore } from '../../store/deterrenceStore';
import { useDetectionStore } from '../../store/detectionStore';
import { Cpu, Radio, Wifi, Battery } from 'lucide-react';
import { cn } from '../../utils/cn';

export default function SystemStatus() {
  const { siren, lights, sound, mode } = useDeterrenceStore();
  const threatState = useDetectionStore((s) => s.threatState);

  const armed = siren || lights;
  return (
    <div data-testid="system-status" className="glass rounded-3xl p-5 sm:p-6 border border-white/8">
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">
            Telemetry
          </div>
          <div className="font-display text-lg font-semibold tracking-tight mt-1">
            System status
          </div>
        </div>
        <div
          className={cn(
            'pill border',
            armed
              ? 'bg-threat-500/12 border-threat-500/35 text-threat-300'
              : 'bg-moss-500/10 border-moss-500/30 text-moss-300'
          )}
        >
          <motion.span
            animate={{ opacity: [1, 0.4, 1] }}
            transition={{ duration: 1.2, repeat: Infinity }}
            className={cn('h-1.5 w-1.5 rounded-full', armed ? 'bg-threat-500' : 'bg-moss-400')}
          />
          {armed ? 'DETERRENCE ARMED' : 'Standby'}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatusTile icon={<Cpu size={13} />} label="AI compute" value="6.2 TOPS" hint="Edge unit" />
        <StatusTile icon={<Radio size={13} />} label="LoRa mesh" value="strong" hint="12 nodes" />
        <StatusTile icon={<Wifi size={13} />} label="Uplink" value="4G · 78%" hint="Tower A" />
        <StatusTile icon={<Battery size={13} />} label="Power" value="grid + solar" hint="6.4 kWh" />
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2 text-center">
        <Pill label="Mode" value={mode.toUpperCase()} tone="moss" />
        <Pill label="Threat" value={threatState.toUpperCase()} tone={threatState === 'alert' ? 'threat' : 'moss'} />
        <Pill label="Sound" value={sound ? 'ON' : 'OFF'} tone={sound ? 'moss' : 'mute'} />
      </div>
    </div>
  );
}

const StatusTile = ({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint: string }) => (
  <div className="glass rounded-xl p-3 border border-white/5">
    <div className="font-mono text-[10px] uppercase tracking-wider text-white/40 inline-flex items-center gap-1.5">
      {icon} {label}
    </div>
    <div className="mt-1 text-sm font-medium tracking-tight">{value}</div>
    <div className="text-[10px] text-white/35 font-mono">{hint}</div>
  </div>
);

const Pill = ({ label, value, tone }: { label: string; value: string; tone: 'moss' | 'threat' | 'mute' }) => {
  const styles =
    tone === 'threat'
      ? 'bg-threat-500/12 border-threat-500/35 text-threat-300'
      : tone === 'mute'
      ? 'bg-white/3 border-white/8 text-white/45'
      : 'bg-moss-500/10 border-moss-500/30 text-moss-300';
  return (
    <div className={`rounded-lg border px-2 py-2 ${styles}`}>
      <div className="font-mono text-[9px] uppercase tracking-wider opacity-80">{label}</div>
      <div className="font-mono text-xs mt-0.5">{value}</div>
    </div>
  );
};
