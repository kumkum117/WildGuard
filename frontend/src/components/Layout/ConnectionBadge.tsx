import { useConnectionStore } from '../../store/connectionStore';
import { cn } from '../../utils/cn';

// Header pill showing whether the dashboard runs on the live backend or the
// built-in simulation.
export default function ConnectionBadge() {
  const mode = useConnectionStore((s) => s.mode);
  const online = useConnectionStore((s) => s.online);

  const state =
    mode === 'live'
      ? online
        ? { label: 'Live', tone: 'moss', title: 'Connected to the WildGuard detection server' }
        : { label: 'Reconnecting', tone: 'threat', title: 'Connection to the detection server lost — retrying' }
      : mode === 'demo'
      ? { label: 'Demo', tone: 'amber', title: 'Backend not reachable — showing simulated data. Start backend/server.py to go live.' }
      : { label: 'Connecting', tone: 'mute', title: 'Looking for the detection server…' };

  return (
    <div
      data-testid="connection-badge"
      title={state.title}
      className={cn(
        'hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono font-medium uppercase tracking-wider border',
        state.tone === 'moss' && 'bg-moss-500/10 border-moss-500/30 text-moss-300',
        state.tone === 'threat' && 'bg-threat-500/10 border-threat-500/30 text-threat-400',
        state.tone === 'amber' && 'bg-amber2-500/10 border-amber2-500/30 text-amber2-400',
        state.tone === 'mute' && 'bg-white/[0.03] border-white/[0.08] text-white/40'
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          state.tone === 'moss' && 'bg-moss-400 animate-blink',
          state.tone === 'threat' && 'bg-threat-500 animate-blink',
          state.tone === 'amber' && 'bg-amber2-500',
          state.tone === 'mute' && 'bg-white/40'
        )}
      />
      {state.label}
    </div>
  );
}
