import { AnimatePresence, motion } from 'framer-motion';
import { History, PawPrint, Hand } from 'lucide-react';
import type { DeterrenceEpisode } from '../../types';
import { useDeterrenceStore } from '../../store/deterrenceStore';
import { formatRelative } from '../../utils/formatters';
import { mmss } from '../../hooks/useNow';
import { cn } from '../../utils/cn';

const OUTCOME: Record<string, { label: string; cls: string }> = {
  active: { label: 'Active', cls: 'bg-threat-500/15 border-threat-500/35 text-threat-300' },
  repelled: { label: 'Repelled', cls: 'bg-moss-500/15 border-moss-500/30 text-moss-300' },
  returned: { label: 'Returned', cls: 'bg-amber2-500/15 border-amber2-500/30 text-amber2-300' },
  persisted: { label: 'Still present', cls: 'bg-threat-500/10 border-threat-500/30 text-threat-300' },
  stopped: { label: 'Stopped', cls: 'bg-white/5 border-white/12 text-white/60' },
  completed: { label: 'Timer ended', cls: 'bg-white/5 border-white/12 text-white/60' },
};

export default function EngagementLog() {
  const episodes = useDeterrenceStore((s) => s.episodes);
  const dayAgo = Date.now() / 1000 - 86400;
  const recent = episodes.filter((e) => e.started_at >= dayAgo && e.source !== 'test');
  const finished = recent.filter((e) => e.duration_s !== null).map((e) => e.duration_s as number).sort((a, b) => a - b);
  const median = finished.length ? finished[Math.floor(finished.length / 2)] : null;
  const repelled = recent.filter((e) => e.outcome === 'repelled').length;

  return (
    <section data-testid="engagement-log" className="glass rounded-3xl p-5 sm:p-6 border border-white/8">
      <div className="flex items-end justify-between gap-3 mb-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">History</div>
          <div className="font-display text-lg font-semibold tracking-tight mt-1">Engagement log</div>
        </div>
        <div className="font-mono text-[10px] text-white/45 text-right">
          24 h · {recent.length} engagement{recent.length === 1 ? '' : 's'} · {repelled} repelled
          {median !== null && ` · median ${mmss(median)}`}
        </div>
      </div>
      <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1">
        {episodes.length === 0 && (
          <div className="py-10 text-center">
            <History size={20} className="mx-auto text-white/25" />
            <div className="mt-2 text-sm text-white/40">No engagements yet.</div>
          </div>
        )}
        <AnimatePresence initial={false}>
          {episodes.slice(0, 20).map((e) => (
            <EpisodeRow key={e.id} e={e} />
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
}

function EpisodeRow({ e }: { e: DeterrenceEpisode }) {
  const o = OUTCOME[e.outcome] ?? { label: e.outcome, cls: 'bg-white/5 border-white/12 text-white/60' };
  const duration = e.duration_s ?? Math.max(0, Date.now() / 1000 - e.started_at);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="flex items-center gap-3 px-3 py-2 rounded-xl border border-white/5"
    >
      <div className="h-7 w-7 grid place-items-center rounded-lg bg-white/5 border border-white/10 shrink-0">
        {e.trigger ? <PawPrint size={12} className="text-white/60" /> : <Hand size={12} className="text-white/60" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] truncate">
          <span className="font-medium">{e.trigger?.label ?? 'Operator activation'}</span>
          {e.trigger && <span className="text-white/45"> · {e.trigger.camera}</span>}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <div className="h-1 w-24 rounded-full bg-white/6 overflow-hidden">
            <div className={cn('h-full', e.max_stage >= 2 ? 'bg-threat-500' : 'bg-amber2-500')} style={{ width: `${Math.min(100, (duration / 300) * 100)}%` }} />
          </div>
          <span className="font-mono text-[10px] text-white/40">
            {mmss(duration)} · {formatRelative(new Date(e.started_at * 1000).toISOString())}
            {e.patterns.length > 0 && ` · ${e.patterns.join(', ')}`}
          </span>
        </div>
      </div>
      <span className={cn('pill border text-[10px] uppercase tracking-wider shrink-0', o.cls)}>
        {e.outcome === 'returned' && e.returned_after_s ? `Returned ${mmss(e.returned_after_s)} later` : e.outcome === 'stopped' && e.stopped_by ? `Stopped · ${e.stopped_by}` : o.label}
      </span>
    </motion.div>
  );
}
