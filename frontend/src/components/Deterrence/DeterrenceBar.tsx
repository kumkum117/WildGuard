import { useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import { Siren, Lightbulb, Hand, ArrowUpRight, Volume2, Megaphone, Zap, X } from 'lucide-react';
import { remainingSeconds, useDeterrenceStore } from '../../store/deterrenceStore';
import { mmss, useAudioState, useNow } from '../../hooks/useNow';
import { sirenEngine, PATTERN_INFO } from '../../utils/sirenEngine';
import { cn } from '../../utils/cn';

// Slim status strip under the header, visible on every page while deterrence
// is engaged, a suggestion awaits a ranger, or manual override is on.
export default function DeterrenceBar() {
  const server = useDeterrenceStore((s) => s.server);
  const offset = useDeterrenceStore((s) => s.clockOffset);
  const playHere = useDeterrenceStore((s) => s.playHere);
  const pending = useDeterrenceStore((s) => s.pending);
  const { stop, extend, fire, setMode, dismissSuggestion } = useDeterrenceStore.getState();
  const audio = useAudioState();
  const loc = useLocation();
  const nav = useNavigate();
  const reduce = useReducedMotion();
  const visible = server.engaged || !!server.suggestion || server.mode === 'manual';
  const now = useNow(500, visible);

  // Shift+S stops everything, from any page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest?.('input, textarea, select, [contenteditable]');
      if (e.shiftKey && (e.key === 'S' || e.key === 's') && !typing && useDeterrenceStore.getState().server.engaged) {
        e.preventDefault();
        useDeterrenceStore.getState().stop();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onConsole = loc.pathname === '/deterrence';
  const remaining = remainingSeconds(server, offset, now);
  const trigger = server.last_trigger;
  const suggestion = server.suggestion;
  const manualLeft = server.manual_until ? server.manual_until - (now + offset) / 1000 : 0;

  let content: React.ReactNode = null;
  let tone: 'threat' | 'amber' | 'moss' = 'moss';

  if (server.engaged) {
    tone = server.siren ? 'threat' : 'amber';
    const outputs = [server.siren && `Siren · ${PATTERN_INFO[server.pattern].label}`, server.lights && `${server.light_mode} lights`]
      .filter(Boolean)
      .join(' + ');
    content = (
      <>
        <span className="relative grid place-items-center h-6 w-6 shrink-0">
          {server.siren && !reduce && (
            <motion.span
              className="absolute inset-0 rounded-full border border-threat-400/60"
              animate={{ scale: [1, 1.8], opacity: [0.7, 0] }}
              transition={{ duration: 1.2, repeat: Infinity }}
            />
          )}
          {server.siren ? <Siren size={14} className="text-threat-300" /> : <Lightbulb size={14} className="text-amber2-300" />}
        </span>
        <span className="min-w-0 truncate text-[12px]">
          <span className="font-mono uppercase tracking-wider">{outputs}</span>
          {trigger && (
            <span className="text-white/60">
              {' '}
              · {trigger.label} at {trigger.camera}
            </span>
          )}
          {server.stage !== null && server.source === 'auto' && (
            <span className="hidden md:inline text-white/45"> · {server.stages[server.stage]}</span>
          )}
        </span>
        <span className="ml-auto font-mono text-[13px] tabular-nums" role="timer" aria-live="off">
          {mmss(remaining)}
        </span>
        {server.siren && playHere && audio === 'locked' && (
          <button
            onClick={() => sirenEngine.unlock()}
            className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber2-500/15 border border-amber2-500/30 text-amber2-300 text-[11px]"
          >
            <Volume2 size={11} /> Tap to hear siren
          </button>
        )}
        <BarButton onClick={() => extend(30)} disabled={pending.extend}>
          +30 s
        </BarButton>
        <BarButton onClick={() => stop()} disabled={pending.stop} danger title="Stop all (Shift+S)">
          <Hand size={11} /> Stop
        </BarButton>
      </>
    );
  } else if (suggestion?.type === 'deter') {
    tone = 'amber';
    const rec = suggestion.recommended;
    content = (
      <>
        <Zap size={14} className="text-amber2-300 shrink-0" />
        <span className="min-w-0 truncate text-[12px]">
          <span className="font-medium">{suggestion.label}</span>
          <span className="text-white/60">
            {' '}
            at {suggestion.camera} — manual mode, recommended:{' '}
            {[rec?.lights && `${rec.lights} lights`, rec?.sound && `${PATTERN_INFO[rec.sound].label} siren`].filter(Boolean).join(' + ') || 'lights'}
          </span>
        </span>
        <BarButton
          className="ml-auto"
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
          danger
        >
          Deter now
        </BarButton>
        <BarButton onClick={() => dismissSuggestion()} title="Dismiss">
          <X size={11} />
        </BarButton>
      </>
    );
  } else if (suggestion?.type === 'broadcast') {
    tone = 'amber';
    content = (
      <>
        <Megaphone size={14} className="text-amber2-300 shrink-0" />
        <span className="min-w-0 truncate text-[12px] text-white/75">
          {suggestion.label} still near {suggestion.camera} — warn the village?
        </span>
        <BarButton className="ml-auto" onClick={() => nav('/deterrence#broadcast')}>
          Review broadcast
        </BarButton>
        <BarButton onClick={() => dismissSuggestion()} title="Dismiss">
          <X size={11} />
        </BarButton>
      </>
    );
  } else if (server.mode === 'manual') {
    content = (
      <>
        <Hand size={13} className="text-moss-300 shrink-0" />
        <span className="text-[12px] text-white/70">
          Manual override — automatic deterrence paused
          {manualLeft > 0 && <span className="font-mono text-white/45"> · auto resumes in {mmss(manualLeft)}</span>}
        </span>
        <BarButton className="ml-auto" onClick={() => setMode('auto')} disabled={pending.mode}>
          Resume auto
        </BarButton>
      </>
    );
  }

  return (
    <AnimatePresence initial={false}>
      {visible && content && !(onConsole && server.engaged) && (
        <motion.div
          key="deterrence-bar"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 34 }}
          className="sticky top-14 z-10 overflow-hidden"
          data-testid="deterrence-bar"
        >
          <div
            className={cn(
              'flex items-center gap-2.5 px-4 sm:px-6 lg:px-8 py-2 border-b backdrop-blur-md',
              tone === 'threat' && 'bg-threat-500/[0.12] border-threat-500/25',
              tone === 'amber' && 'bg-amber2-500/[0.10] border-amber2-500/25',
              tone === 'moss' && 'bg-moss-500/[0.08] border-moss-500/20'
            )}
          >
            {content}
            {!onConsole && (
              <BarButton onClick={() => nav('/deterrence')} title="Open deterrence console">
                <ArrowUpRight size={11} />
              </BarButton>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function BarButton({ children, onClick, disabled, danger, title, className }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean; title?: string; className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border transition disabled:opacity-50',
        danger
          ? 'bg-threat-500/20 border-threat-500/40 text-threat-200 hover:bg-threat-500/30'
          : 'bg-white/5 border-white/12 text-white/75 hover:bg-white/10',
        className
      )}
    >
      {children}
    </button>
  );
}
