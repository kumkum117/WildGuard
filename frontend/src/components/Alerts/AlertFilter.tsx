// @ts-nocheck
import { Search } from 'lucide-react';
import { useAlertStore } from '../../store/alertStore';
import { cn } from '../../utils/cn';

const filters = [
  { key: 'all', label: 'All' },
  { key: 'high', label: 'High' },
  { key: 'medium', label: 'Medium' },
  { key: 'low', label: 'Low' },
] as const;

const statusTabs = [
  { key: 'open', label: 'Open' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'all', label: 'All' },
] as const;

export default function AlertFilter({ counts }: { counts?: { open: number; resolved: number; all: number } }) {
  const statusFilter = useAlertStore((s) => s.statusFilter);
  const setStatusFilter = useAlertStore((s) => s.setStatusFilter);
  const filter = useAlertStore((s) => s.filter);
  const setFilter = useAlertStore((s) => s.setFilter);
  const search = useAlertStore((s) => s.search);
  const setSearch = useAlertStore((s) => s.setSearch);

  return (
    <div data-testid="alert-filter" className="glass rounded-2xl p-3 border border-white/8 flex flex-wrap items-center gap-2">
      <div className="flex gap-1 p-1 rounded-xl bg-white/3 border border-white/8">
        {statusTabs.map((t) => (
          <button
            key={t.key}
            data-testid={`status-${t.key}`}
            onClick={() => setStatusFilter(t.key)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition inline-flex items-center gap-1.5',
              statusFilter === t.key ? 'bg-moss-500/20 text-moss-200' : 'text-white/55 hover:text-white'
            )}
          >
            {t.label}
            {counts && (
              <span className="font-mono text-[10px] text-white/40">{counts[t.key]}</span>
            )}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/8 flex-1 min-w-[200px]">
        <Search size={14} className="text-white/40" />
        <input
          data-testid="alert-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search animals, locations…"
          className="bg-transparent outline-none text-sm w-full placeholder-white/30"
        />
      </div>
      <div className="flex gap-1">
        {filters.map((f) => (
          <button
            key={f.key}
            data-testid={`filter-${f.key}`}
            onClick={() => setFilter(f.key)}
            className={cn(
              'px-3 py-2 rounded-lg text-xs font-medium uppercase tracking-wider transition border',
              filter === f.key
                ? 'bg-moss-500/15 border-moss-500/40 text-moss-300'
                : 'bg-white/3 border-white/8 text-white/55 hover:text-white hover:border-white/15'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}
