import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Siren, FlaskConical, CheckCircle2, XCircle, Loader, MinusCircle, Camera as CameraIcon, Crosshair } from 'lucide-react';
import { useDeterrenceStore } from '../../store/deterrenceStore';
import { useDetectionStore } from '../../store/detectionStore';
import { useConnectionStore } from '../../store/connectionStore';
import { backend } from '../../services/backend';
import { mmss, useAudioState, useNow } from '../../hooks/useNow';
import { sirenEngine } from '../../utils/sirenEngine';
import SirenCard from './SirenToggle';
import LightsCard from './LightToggle';
import HoldButton from './HoldButton';
import { cn } from '../../utils/cn';

type Check = 'idle' | 'running' | 'ok' | 'fail' | 'skip';

// Operator control deck: mode, target zones, siren + lights, emergency and
// self-test. Every action goes to the controller (server) — nothing here keeps
// its own timer.
export default function DeterrenceControl() {
  const server = useDeterrenceStore((s) => s.server);
  const pending = useDeterrenceStore((s) => s.pending);
  const offset = useDeterrenceStore((s) => s.clockOffset);
  const { fire, setMode } = useDeterrenceStore.getState();
  const cameras = useDetectionStore((s) => s.cameras);
  const [target, setTarget] = useState<string>('*');
  const zones = target === '*' ? ['*'] : [target];
  const now = useNow(1000, server.mode === 'manual');
  const manualLeft = server.manual_until ? server.manual_until - (now + offset) / 1000 : 0;

  return (
    <section data-testid="deterrence-control" className="glass rounded-3xl p-5 sm:p-6 border border-white/8 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">Output deck</div>
          <div className="font-display text-lg font-semibold tracking-tight mt-1">Siren, lights & targets</div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-white/3 border border-white/8">
            {(['auto', 'manual'] as const).map((m) => (
              <button
                key={m}
                data-testid={`mode-${m}`}
                onClick={() => setMode(m)}
                disabled={pending.mode}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium uppercase tracking-wider transition',
                  server.mode === m ? 'bg-moss-500/20 text-moss-200' : 'text-white/55 hover:text-white'
                )}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="text-[11px] text-white/40 text-right">
            {server.mode === 'auto' ? (
              'Sightings trigger the species playbook automatically'
            ) : (
              <span className="inline-flex items-center gap-2">
                Auto resumes in <span className="font-mono text-white/60">{mmss(manualLeft)}</span>
                <button onClick={() => setMode('manual', true)} className="text-moss-300 hover:text-moss-200">
                  +30 min
                </button>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Target zones */}
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40 mb-2 inline-flex items-center gap-1.5">
          <Crosshair size={11} /> Target for manual activation
        </div>
        <div className="flex flex-wrap gap-1.5">
          <ZoneChip label="All zones" selected={target === '*'} active={server.engaged && server.zones.includes('*')} onClick={() => setTarget('*')} />
          {cameras.map((c) => (
            <ZoneChip
              key={c.id}
              label={`${c.id} · ${c.location.name}`}
              status={c.status}
              selected={target === c.id}
              active={server.engaged && server.zones.includes(c.id)}
              onClick={() => setTarget(c.id)}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <SirenCard zones={zones} />
        <LightsCard zones={zones} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr,auto] gap-3 items-stretch">
        {!server.engaged ? (
          <HoldButton
            testId="emergency-deter"
            onConfirm={() => fire({ siren: true, lights: true, light_mode: 'strobe', pattern: server.pattern, zones })}
            disabled={pending.fire}
            holdMs={1100}
            hint="Hold to fire siren and strobe at the target"
            className="py-3.5 rounded-2xl bg-gradient-to-b from-threat-500/30 to-threat-700/30 border border-threat-500/45 text-threat-100 font-semibold text-sm shadow-glow-threat"
          >
            <Siren size={16} /> Hold to deter — siren + strobe {target === '*' ? 'everywhere' : `at ${target}`}
          </HoldButton>
        ) : (
          <div className="py-3.5 px-4 rounded-2xl bg-threat-500/10 border border-threat-500/30 text-sm text-threat-200 text-center">
            Engaged — use Stop or +30 s on the dial above (or Shift+S anywhere)
          </div>
        )}
        <SelfTest />
      </div>
    </section>
  );
}

function ZoneChip({ label, selected, active, status, onClick }: {
  label: string; selected: boolean; active: boolean; status?: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] transition',
        active
          ? 'bg-threat-500/15 border-threat-500/40 text-threat-200'
          : selected
          ? 'bg-moss-500/15 border-moss-500/35 text-moss-200'
          : 'bg-white/3 border-white/10 text-white/55 hover:text-white'
      )}
    >
      {active && (
        <motion.span
          className="absolute inset-0 rounded-lg border border-threat-400/50"
          animate={{ scale: [1, 1.12], opacity: [0.6, 0] }}
          transition={{ duration: 1.4, repeat: Infinity }}
        />
      )}
      {status ? (
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            status === 'online' ? 'bg-moss-400' : status === 'maintenance' ? 'bg-amber2-500' : 'bg-threat-500'
          )}
        />
      ) : (
        <CameraIcon size={11} />
      )}
      {label}
    </button>
  );
}

function SelfTest() {
  const server = useDeterrenceStore((s) => s.server);
  const live = useConnectionStore((s) => s.mode === 'live');
  const audio = useAudioState();
  const [steps, setSteps] = useState<{ audio: Check; controller: Check; relay: Check } | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    setSteps({ audio: 'running', controller: 'idle', relay: 'idle' });
    sirenEngine.unlock();
    sirenEngine.preview(server.pattern, 2, 0.15);
    await new Promise((r) => setTimeout(r, 700));
    const audioOk: Check = sirenEngine.state === 'locked' ? 'fail' : 'ok';
    setSteps({ audio: audioOk, controller: 'running', relay: 'idle' });
    let configured = false;
    let controller: Check = 'ok';
    if (live) {
      try {
        configured = (await backend.testDeterrence('all', server.pattern)).configured;
      } catch {
        controller = 'fail';
      }
    }
    setSteps({ audio: audioOk, controller, relay: configured ? 'running' : 'skip' });
    if (configured) {
      await new Promise((r) => setTimeout(r, 2500));
      const hw = useDeterrenceStore.getState().server.hardware;
      setSteps({ audio: audioOk, controller, relay: hw.ok ? 'ok' : 'fail' });
    }
    setRunning(false);
    window.setTimeout(() => setSteps(null), 9000);
  };

  const hw = server.hardware;
  return (
    <div className="relative">
      <button
        onClick={run}
        disabled={running}
        className="h-full w-full md:w-auto inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm transition disabled:opacity-60"
        data-testid="self-test"
      >
        {running ? <Loader size={14} className="animate-spin" /> : <FlaskConical size={14} />} Self-test
      </button>
      <AnimatePresence>
        {steps && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="absolute right-0 bottom-full mb-2 w-64 z-20 bg-[#0d110e] border border-white/10 rounded-xl p-3 shadow-2xl space-y-1.5 text-[12px]"
          >
            <CheckRow state={steps.audio} label="Browser audio" detail={audio === 'locked' ? 'blocked — click anywhere' : 'playing preview'} />
            <CheckRow state={steps.controller} label="Controller" detail={live ? 'WildGuard server' : 'demo mode'} />
            <CheckRow
              state={steps.relay}
              label="Relay / PA"
              detail={
                steps.relay === 'skip'
                  ? 'not configured — browser only'
                  : steps.relay === 'ok'
                  ? `${hw.latency_ms ?? '?'} ms`
                  : steps.relay === 'fail'
                  ? hw.error ?? 'no response'
                  : 'pinging…'
              }
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CheckRow({ state, label, detail }: { state: Check; label: string; detail: string }) {
  const icon =
    state === 'running' ? (
      <Loader size={13} className="animate-spin text-white/50" />
    ) : state === 'ok' ? (
      <CheckCircle2 size={13} className="text-moss-400" />
    ) : state === 'fail' ? (
      <XCircle size={13} className="text-threat-400" />
    ) : state === 'skip' ? (
      <MinusCircle size={13} className="text-white/35" />
    ) : (
      <span className="h-3 w-3 rounded-full border border-white/20" />
    );
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5">{icon}</span>
      <div>
        <div className="text-white/80">{label}</div>
        <div className="text-[11px] text-white/40">{detail}</div>
      </div>
    </div>
  );
}
