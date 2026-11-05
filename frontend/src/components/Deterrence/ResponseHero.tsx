import { useMemo, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Hand, Plus, ShieldCheck, Siren, Lightbulb, PawPrint, Zap, X, Radar } from 'lucide-react';
import type { DeterrenceServer } from '../../types';
import { remainingSeconds, useDeterrenceStore } from '../../store/deterrenceStore';
import { useDetectionStore } from '../../store/detectionStore';
import { mmss, useNow } from '../../hooks/useNow';
import { PATTERN_INFO } from '../../utils/sirenEngine';
import { formatRelative } from '../../utils/formatters';
import LiveFeed from '../Common/LiveFeed';
import { cn } from '../../utils/cn';

type Tone = 'idle' | 'lights' | 'siren';

const tint: Record<Tone, string> = {
  idle: 'radial-gradient(120% 120% at 0% 0%, rgba(16,185,129,0.10), transparent 60%)',
  lights: 'radial-gradient(120% 120% at 0% 0%, rgba(245,158,11,0.16), transparent 60%)',
  siren: 'radial-gradient(120% 120% at 0% 0%, rgba(239,68,68,0.20), transparent 60%)',
};

export default function ResponseHero() {
  const server = useDeterrenceStore((s) => s.server);
  const episodes = useDeterrenceStore((s) => s.episodes);
  const cameras = useDetectionStore((s) => s.cameras);
  const now = useNow(1000);
  const tone: Tone = !server.engaged ? 'idle' : server.siren ? 'siren' : 'lights';
  const trigger = server.last_trigger;
  const cam = trigger ? cameras.find((c) => c.id === trigger.camera_id) : undefined;
  const lastDone = episodes.find((e) => e.ended_at);
  const online = cameras.filter((c) => c.status === 'online').length;

  const word = !server.engaged
    ? 'Standby'
    : (server.stage ?? 0) >= 2
    ? 'Escalated'
    : server.siren
    ? 'Repelling'
    : 'Warning';

  return (
    <motion.section
      layout
      data-testid="response-hero"
      className={cn(
        'relative overflow-hidden glass rounded-3xl border transition-colors',
        tone === 'siren' ? 'border-threat-500/35' : tone === 'lights' ? 'border-amber2-500/30' : 'border-white/8'
      )}
    >
      <AnimatePresence initial={false}>
        <motion.div
          key={tone}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
          className="absolute inset-0 pointer-events-none"
          style={{ background: tint[tone] }}
        />
      </AnimatePresence>
      {server.engaged && <div className="scanline" />}

      <div className="relative p-5 sm:p-6 grid grid-cols-1 lg:grid-cols-[1.2fr,1fr,auto] gap-5 items-center">
        {/* State + trigger */}
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">Response console</div>
          <div className="mt-1 flex items-center gap-3">
            <motion.div
              key={word}
              initial={{ y: 6, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className={cn(
                'font-display text-3xl sm:text-4xl font-semibold tracking-tight',
                tone === 'siren' ? 'text-threat-300' : tone === 'lights' ? 'text-amber2-300' : 'text-white'
              )}
            >
              {word}
            </motion.div>
            <span
              className={cn(
                'pill border text-[10px] uppercase tracking-wider',
                server.mode === 'auto' ? 'bg-moss-500/10 border-moss-500/30 text-moss-300' : 'bg-amber2-500/10 border-amber2-500/30 text-amber2-300'
              )}
            >
              {server.mode === 'auto' ? 'Auto' : 'Manual'}
            </span>
          </div>

          {server.engaged && trigger ? (
            <div className="mt-3 inline-flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5 rounded-xl bg-black/30 border border-white/10 text-[12px]">
              <PawPrint size={13} className={tone === 'siren' ? 'text-threat-300' : 'text-amber2-300'} />
              <span className="font-medium">{trigger.label}</span>
              <span className="font-mono text-white/50">{Math.round(trigger.confidence * 100)}%</span>
              <span className="text-white/40">·</span>
              <span className="font-mono text-white/70">{trigger.camera_id}</span>
              <span className="text-white/60">{trigger.camera}</span>
              {server.last_seen_at && (
                <span className="font-mono text-white/40">· seen {formatRelative(new Date(server.last_seen_at * 1000).toISOString())}</span>
              )}
            </div>
          ) : server.engaged ? (
            <div className="mt-3 text-sm text-white/60">Started by an operator</div>
          ) : (
            <div className="mt-3 text-sm text-white/55 max-w-md">
              All quiet · {online}/{cameras.length} cameras watching.
              {lastDone && (
                <span className="text-white/40">
                  {' '}
                  Last engagement {formatRelative(new Date((lastDone.ended_at ?? lastDone.started_at) * 1000).toISOString())}:{' '}
                  {lastDone.trigger?.label ?? 'operator'} {lastDone.outcome} in {Math.round(lastDone.duration_s ?? 0)} s.
                </span>
              )}
            </div>
          )}
          {server.engaged && server.profile?.note && (
            <div className="mt-2 text-[12px] text-white/45 max-w-md leading-snug">{server.profile.note}</div>
          )}
        </div>

        {/* Trigger camera */}
        <div className="relative aspect-[16/10] rounded-2xl overflow-hidden border border-white/10 bg-forest-950">
          {server.engaged && cam ? (
            <>
              <LiveFeed camera={cam} mode="poll" intervalMs={1500} />
              <div className="absolute top-2 left-2 font-mono text-[10px] px-2 py-0.5 rounded bg-black/55 text-white/80">
                {cam.id} · {cam.location.name}
              </div>
            </>
          ) : (
            <IdleRadar active={server.engaged} />
          )}
        </div>

        <EngagementDial server={server} now={now} />
      </div>

      <div className="relative px-5 sm:px-6 pb-5">
        <EscalationLadder server={server} now={now} />
      </div>

      <AnimatePresence>{server.suggestion?.type === 'deter' && <SuggestionCard />}</AnimatePresence>
    </motion.section>
  );
}

function IdleRadar({ active }: { active: boolean }) {
  const reduce = useReducedMotion();
  return (
    <div className="absolute inset-0 grid place-items-center grid-bg">
      <div className="relative h-24 w-24 rounded-full border border-moss-500/25">
        <div className="absolute inset-3 rounded-full border border-moss-500/15" />
        {!reduce && (
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{ background: 'conic-gradient(from 0deg, rgba(52,211,153,0.35), transparent 25%)' }}
            animate={{ rotate: 360 }}
            transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
          />
        )}
        <Radar size={18} className="absolute inset-0 m-auto text-moss-300/70" />
      </div>
      <div className="absolute bottom-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white/35">
        {active ? 'Operator engagement' : 'Watching all feeds'}
      </div>
    </div>
  );
}

function EngagementDial({ server, now }: { server: DeterrenceServer; now: number }) {
  const offset = useDeterrenceStore((s) => s.clockOffset);
  const pending = useDeterrenceStore((s) => s.pending);
  const { stop, extend } = useDeterrenceStore.getState();
  const reduce = useReducedMotion();
  const remaining = remainingSeconds(server, offset, now);
  // Scale the ring to the longest window seen in this engagement (extensions refill it).
  const maxRef = useRef<{ id: string | null; max: number }>({ id: null, max: server.window_s });
  if (maxRef.current.id !== server.episode_id) maxRef.current = { id: server.episode_id, max: server.window_s };
  maxRef.current.max = Math.max(maxRef.current.max, remaining);
  const fraction = server.engaged ? remaining / maxRef.current.max : 0;
  const R = 52;
  const C = 2 * Math.PI * R;
  const engagedFor = server.engagement_started_at ? (now + offset) / 1000 - server.engagement_started_at : 0;
  const color = server.siren ? '#EF4444' : server.lights ? '#F59E0B' : '#10B981';

  return (
    <div className="flex lg:flex-col items-center gap-4 justify-center" data-testid="engagement-dial">
      <div className="relative h-[136px] w-[136px] shrink-0" role="timer" aria-label={`${Math.round(remaining)} seconds left`}>
        {server.siren && !reduce &&
          [0, 0.4, 0.8].map((d) => (
            <motion.span
              key={d}
              className="absolute inset-0 rounded-full border border-threat-400/40"
              animate={{ scale: [1, 1.45], opacity: [0.5, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, delay: d }}
            />
          ))}
        <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90">
          <circle cx="60" cy="60" r={R} stroke="rgba(255,255,255,0.08)" strokeWidth="7" fill="none" />
          <motion.circle
            cx="60"
            cy="60"
            r={R}
            stroke={color}
            strokeWidth="7"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={C}
            animate={{ strokeDashoffset: C * (1 - fraction) }}
            transition={{ type: 'spring', stiffness: 120, damping: 24 }}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <div className={cn('font-mono text-2xl tabular-nums', server.engaged ? 'text-white' : 'text-white/30')}>
              {mmss(remaining)}
            </div>
            <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/40 mt-0.5">
              {server.engaged ? `on for ${mmss(engagedFor)}` : 'idle'}
            </div>
          </div>
        </div>
      </div>
      {server.engaged && (
        <div className="flex lg:w-full gap-2">
          <button
            onClick={() => extend(30)}
            disabled={pending.extend}
            className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs transition disabled:opacity-50"
          >
            <Plus size={12} /> 30 s
          </button>
          <button
            data-testid="deterrence-stop"
            onClick={() => stop()}
            disabled={pending.stop}
            className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-threat-500/20 hover:bg-threat-500/30 border border-threat-500/40 text-threat-200 text-xs font-medium transition disabled:opacity-50"
          >
            <Hand size={12} /> Stop
          </button>
        </div>
      )}
    </div>
  );
}

function EscalationLadder({ server, now }: { server: DeterrenceServer; now: number }) {
  const offset = useDeterrenceStore((s) => s.clockOffset);
  const reduce = useReducedMotion();
  const current = server.engaged ? server.stage : null;
  const paused = server.mode === 'manual';
  const nextIn = server.next_step_at ? server.next_step_at - (now + offset) / 1000 : null;
  const icons = [Lightbulb, Siren, Zap, ShieldCheck];

  return (
    <div data-testid="escalation-ladder">
      <div className="flex items-center justify-between mb-2">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">Escalation</div>
        <div className="font-mono text-[10px] text-white/40">
          {paused
            ? 'Auto escalation paused (manual)'
            : server.engaged && server.source === 'auto' && nextIn !== null && nextIn > 0
            ? `next step in ${mmss(nextIn)} if still in view`
            : server.engaged && server.source === 'operator'
            ? 'Operator control — no auto escalation'
            : 'Steps up only while the animal stays'}
        </div>
      </div>
      <div className="relative grid grid-cols-4 gap-2">
        <div className="absolute left-[12.5%] right-[12.5%] top-4 h-0.5 bg-white/8" />
        {current !== null && (
          <motion.div
            className={cn('absolute left-[12.5%] top-4 h-0.5', server.siren ? 'bg-threat-500/70' : 'bg-amber2-500/70')}
            animate={{ width: `${(Math.min(current, 3) / 4) * 100}%` }}
            transition={{ type: 'spring', stiffness: 160, damping: 26 }}
          />
        )}
        {server.stages.map((name, i) => {
          const Icon = icons[i] ?? Zap;
          const done = current !== null && i < current;
          const active = current === i;
          return (
            <div key={name} className="relative flex flex-col items-center text-center">
              <div className="relative">
                {active && !reduce && !paused && (
                  <motion.span
                    className={cn('absolute inset-0 rounded-full', server.siren ? 'bg-threat-500/40' : 'bg-amber2-500/40')}
                    animate={{ scale: [1, 1.6], opacity: [0.6, 0] }}
                    transition={{ duration: 1.6, repeat: Infinity }}
                  />
                )}
                <div
                  className={cn(
                    'relative h-8 w-8 grid place-items-center rounded-full border transition-colors',
                    paused
                      ? 'bg-white/5 border-white/10 text-white/30'
                      : active
                      ? server.siren
                        ? 'bg-threat-500/25 border-threat-500/60 text-threat-200'
                        : 'bg-amber2-500/25 border-amber2-500/60 text-amber2-200'
                      : done
                      ? 'bg-white/10 border-white/25 text-white/70'
                      : 'bg-forest-900 border-white/10 text-white/35'
                  )}
                >
                  <Icon size={13} />
                </div>
              </div>
              <div className={cn('mt-1.5 text-[11px] font-medium', active ? 'text-white' : 'text-white/45')}>{name}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SuggestionCard() {
  const suggestion = useDeterrenceStore((s) => s.server.suggestion);
  const pending = useDeterrenceStore((s) => s.pending);
  const { fire, dismissSuggestion } = useDeterrenceStore.getState();
  const now = useNow(500);
  const offset = useDeterrenceStore((s) => s.clockOffset);
  const life = useMemo(() => (suggestion ? suggestion.expires_at - (now + offset) / 1000 : 0), [suggestion, now, offset]);
  if (!suggestion) return null;
  const rec = suggestion.recommended;
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="relative border-t border-amber2-500/25 bg-amber2-500/[0.07]"
      data-testid="suggestion-card"
    >
      <div className="px-5 sm:px-6 py-4 flex flex-wrap items-center gap-3">
        <Zap size={16} className="text-amber2-300" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">
            {suggestion.label} at {suggestion.camera} — manual mode is on
          </div>
          <div className="text-xs text-white/55">
            Recommended:{' '}
            {[rec?.lights && `${rec.lights} lights`, rec?.sound && `${PATTERN_INFO[rec.sound].label} siren`].filter(Boolean).join(' + ') ||
              'warning lights'}
            {suggestion.note && ` · ${suggestion.note}`}
          </div>
        </div>
        <button
          onClick={() =>
            fire({
              lights: true,
              light_mode: rec?.lights ?? 'strobe',
              siren: !!rec?.sound,
              pattern: rec?.sound ?? undefined,
              zones: suggestion.camera_id ? [suggestion.camera_id] : undefined,
            })
          }
          disabled={pending.fire}
          className="px-3 py-2 rounded-xl bg-threat-500/20 hover:bg-threat-500/30 border border-threat-500/40 text-threat-200 text-xs font-medium"
        >
          Deter now
        </button>
        <button onClick={() => dismissSuggestion()} className="h-8 w-8 grid place-items-center rounded-lg hover:bg-white/10 text-white/50">
          <X size={14} />
        </button>
      </div>
      <motion.div
        className="absolute bottom-0 left-0 h-0.5 bg-amber2-500/70"
        animate={{ width: `${Math.max(0, Math.min(1, life / 90)) * 100}%` }}
        transition={{ duration: 0.5 }}
      />
    </motion.div>
  );
}
