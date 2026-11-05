import { motion } from 'framer-motion';
import { FileVideo, Image as ImageIcon, Loader, XCircle, History } from 'lucide-react';
import { mediaUrl } from '../../services/api';
import { useAnalysisStore } from '../../store/analysisStore';
import { formatRelative } from '../../utils/formatters';
import { cn } from '../../utils/cn';
import { SectionTitle, threatColor, titleCase } from './shared';

export default function AnalysisHistory() {
  const items = useAnalysisStore((s) => s.items);
  const selectedId = useAnalysisStore((s) => s.selectedId);
  const select = useAnalysisStore((s) => s.select);

  return (
    <div data-testid="analysis-history" className="glass rounded-3xl p-5 sm:p-6 border border-white/8">
      <SectionTitle
        eyebrow="Saved on the server"
        title="Analysis history"
        right={<span className="font-mono text-[10px] text-white/40 uppercase tracking-wider">{items.length} items</span>}
      />
      <div className="space-y-2 max-h-[760px] overflow-y-auto pr-1">
        {items.length === 0 && (
          <div className="py-10 text-center">
            <History size={22} className="mx-auto text-white/25" />
            <div className="mt-2 text-sm text-white/40">Nothing analysed yet.</div>
          </div>
        )}
        {items.map((a, i) => {
          const running = a.status === 'queued' || a.status === 'processing';
          const species = a.species ?? [];
          return (
            <motion.button
              key={a.id}
              layout
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25, delay: Math.min(i, 8) * 0.03 }}
              onClick={() => select(a.id)}
              className={cn(
                'w-full text-left flex items-center gap-3 p-2.5 rounded-xl border transition',
                selectedId === a.id
                  ? 'border-moss-400/40 bg-moss-500/[0.07]'
                  : 'border-white/5 hover:border-white/15 hover:bg-white/[0.03]'
              )}
            >
              <div className="relative h-12 w-16 rounded-lg overflow-hidden border border-white/8 shrink-0 bg-forest-950 grid place-items-center">
                {a.urls.thumbnail ? (
                  <img src={mediaUrl(a.urls.thumbnail)} alt="" className="absolute inset-0 h-full w-full object-cover" />
                ) : a.kind === 'video' ? (
                  <FileVideo size={16} className="text-white/30" />
                ) : (
                  <ImageIcon size={16} className="text-white/30" />
                )}
                <div className="absolute bottom-0.5 right-0.5 h-4 w-4 grid place-items-center rounded bg-black/60 text-white/70">
                  {a.kind === 'video' ? <FileVideo size={9} /> : <ImageIcon size={9} />}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium truncate">{a.filename}</div>
                <div className="mt-0.5 flex items-center gap-2 text-[10px] font-mono text-white/40 uppercase tracking-wider">
                  {running ? (
                    <span className="inline-flex items-center gap-1 text-moss-300">
                      <Loader size={10} className="animate-spin" />
                      {a.status === 'queued' ? 'queued' : `${Math.round((a.progress ?? 0) * 100)}%`}
                    </span>
                  ) : a.status === 'completed' ? (
                    species.length ? (
                      <span className="inline-flex items-center gap-1.5 normal-case tracking-normal font-sans text-[11px] text-white/60 truncate">
                        <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', threatColor(species[0].threat_level))} />
                        {species
                          .slice(0, 2)
                          .map((s) => `${titleCase(s.label)}${s.count > 1 ? ` ×${s.count}` : ''}`)
                          .join(', ')}
                        {species.length > 2 && ` +${species.length - 2}`}
                      </span>
                    ) : (
                      <span>no animals</span>
                    )
                  ) : (
                    <span className="inline-flex items-center gap-1 text-threat-400">
                      <XCircle size={10} /> {a.status}
                    </span>
                  )}
                </div>
              </div>
              <div className="font-mono text-[10px] text-white/30 shrink-0">
                {formatRelative(new Date(a.created_at * 1000).toISOString())}
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
