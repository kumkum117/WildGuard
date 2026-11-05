import { Cpu, Radio, Volume2, Moon, Camera as CameraIcon, Hand } from 'lucide-react';
import { useDeterrenceStore } from '../../store/deterrenceStore';
import { useDetectionStore } from '../../store/detectionStore';
import { useConnectionStore } from '../../store/connectionStore';
import { mmss, useAudioState, useNow } from '../../hooks/useNow';
import { sirenEngine } from '../../utils/sirenEngine';
import { cn } from '../../utils/cn';

// Readiness: is everything needed for deterrence actually working right now?
export default function SystemStatus() {
  const server = useDeterrenceStore((s) => s.server);
  const offset = useDeterrenceStore((s) => s.clockOffset);
  const playHere = useDeterrenceStore((s) => s.playHere);
  const cameras = useDetectionStore((s) => s.cameras);
  const live = useConnectionStore((s) => s.mode === 'live');
  const health = useConnectionStore((s) => s.health);
  const settings = useConnectionStore((s) => s.settings);
  const audio = useAudioState();
  const now = useNow(1000, server.mode === 'manual');
  const online = cameras.filter((c) => c.status === 'online').length;
  const hw = server.hardware;
  const manualLeft = server.manual_until ? server.manual_until - (now + offset) / 1000 : 0;

  const tiles = [
    {
      icon: <Hand size={13} />,
      label: 'Mode',
      value: server.mode === 'auto' ? 'Automatic' : 'Manual override',
      hint: server.mode === 'manual' ? `auto in ${mmss(manualLeft)}` : 'playbook armed',
      tone: server.mode === 'auto' ? 'ok' : 'warn',
    },
    {
      icon: <Radio size={13} />,
      label: 'Relay / PA',
      value: !hw.configured ? 'Browser only' : hw.ok === false ? 'Failing' : hw.ok ? 'Connected' : 'Configured',
      hint: !hw.configured ? 'set DETERRENCE_WEBHOOK_URL' : hw.ok === false ? hw.error ?? 'no response' : hw.latency_ms ? `${hw.latency_ms} ms` : 'not tested yet',
      tone: !hw.configured ? 'mute' : hw.ok === false ? 'bad' : 'ok',
    },
    {
      icon: <Volume2 size={13} />,
      label: 'Audio here',
      value: !playHere ? 'Muted' : audio === 'locked' ? 'Blocked' : audio === 'playing' ? 'Playing' : 'Ready',
      hint: !playHere ? 'this device only' : audio === 'locked' ? 'click to enable' : 'siren plays in browser',
      tone: !playHere ? 'mute' : audio === 'locked' ? 'warn' : 'ok',
      onClick: audio === 'locked' ? () => sirenEngine.unlock() : undefined,
    },
    {
      icon: <CameraIcon size={13} />,
      label: 'Cameras',
      value: `${online} / ${cameras.length} online`,
      hint: online ? 'watching for sightings' : 'no live feeds',
      tone: online ? 'ok' : 'bad',
    },
    {
      icon: <Moon size={13} />,
      label: 'Night vision',
      value: live ? (settings?.night_mode ?? 'auto').toUpperCase() : 'AUTO',
      hint: `${cameras.filter((c) => c.lighting?.is_night).length} feed(s) in night mode`,
      tone: 'ok',
    },
    {
      icon: <Cpu size={13} />,
      label: 'AI engine',
      value: live && health ? health.engine.model_type.split(' (')[0] : 'Simulated',
      hint: live && health ? `${health.engine.device.toUpperCase()} · ${Math.round(health.engine.avg_inference_ms)} ms` : 'demo mode',
      tone: live ? 'ok' : 'warn',
    },
  ] as const;

  return (
    <section data-testid="system-status" className="glass rounded-3xl p-5 sm:p-6 border border-white/8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">Readiness</div>
          <div className="font-display text-lg font-semibold tracking-tight mt-1">System status</div>
        </div>
        {!live && (
          <span className="pill bg-amber2-500/10 border border-amber2-500/30 text-amber2-300 text-[10px] uppercase tracking-wider">
            Simulated
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {tiles.map((t) => (
          <button
            key={t.label}
            type="button"
            onClick={'onClick' in t ? t.onClick : undefined}
            className={cn('text-left rounded-xl p-3 border bg-white/[0.02]', 'onClick' in t && t.onClick ? 'cursor-pointer hover:bg-white/5' : 'cursor-default', 'border-white/5')}
          >
            <div className="font-mono text-[10px] uppercase tracking-wider text-white/40 inline-flex items-center gap-1.5">
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  t.tone === 'ok' ? 'bg-moss-400' : t.tone === 'warn' ? 'bg-amber2-500' : t.tone === 'bad' ? 'bg-threat-500' : 'bg-white/30'
                )}
              />
              {t.icon} {t.label}
            </div>
            <div className="mt-1 text-sm font-medium tracking-tight truncate">{t.value}</div>
            <div className="text-[10px] text-white/35 font-mono truncate">{t.hint}</div>
          </button>
        ))}
      </div>
    </section>
  );
}
