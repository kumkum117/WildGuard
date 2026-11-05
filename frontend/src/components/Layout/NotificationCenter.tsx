import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  BellOff,
  CheckCheck,
  Trash2,
  X,
  ShieldAlert,
  Eye,
  Siren,
  ScanSearch,
  Server,
  ArrowUpRight,
  SlidersHorizontal,
} from 'lucide-react';
import { useNotificationStore, unreadCount, type AppNotification } from '../../store/notificationStore';
import { formatRelative } from '../../utils/formatters';
import { cn } from '../../utils/cn';

type Filter = 'all' | 'threats' | 'system';

const kindIcon = {
  alert: ShieldAlert,
  threat: Eye,
  deterrence: Siren,
  analysis: ScanSearch,
  system: Server,
} as const;

const levelTone = {
  danger: 'bg-threat-500/15 text-threat-300 border-threat-500/25',
  warning: 'bg-amber2-500/15 text-amber2-300 border-amber2-500/25',
  success: 'bg-moss-500/15 text-moss-300 border-moss-500/25',
  info: 'bg-white/5 text-white/60 border-white/10',
} as const;

const matches = (n: AppNotification, f: Filter) =>
  f === 'all' || (f === 'threats' ? n.kind === 'alert' || n.kind === 'threat' : n.kind !== 'alert' && n.kind !== 'threat');

export default function NotificationCenter() {
  const items = useNotificationStore((s) => s.items);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const markRead = useNotificationStore((s) => s.markRead);
  const remove = useNotificationStore((s) => s.remove);
  const clear = useNotificationStore((s) => s.clear);
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const rootRef = useRef<HTMLDivElement | null>(null);

  const unread = unreadCount(items);
  const urgent = items.some((i) => !i.read && i.level === 'danger');

  const close = () => {
    setOpen(false);
    markAllRead(); // everything shown has now been seen
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const sections = useMemo(() => {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const shown = items.filter((i) => matches(i, filter));
    return [
      { title: 'Today', items: shown.filter((i) => i.lastAt >= midnight.getTime()) },
      { title: 'Earlier', items: shown.filter((i) => i.lastAt < midnight.getTime()) },
    ].filter((s) => s.items.length);
  }, [items, filter]);

  const openItem = (n: AppNotification) => {
    markRead(n.id);
    setOpen(false);
    if (n.link) nav(n.link);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        data-testid="alerts-bell"
        aria-label={unread ? `${unread} unread notifications` : 'Notifications'}
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        className={cn(
          'relative h-8 w-8 grid place-items-center rounded-md transition',
          open ? 'bg-white/[0.08] text-white' : 'hover:bg-white/[0.06] text-white/50 hover:text-white/90'
        )}
      >
        <motion.span
          key={unread}
          animate={unread && urgent ? { rotate: [0, -14, 12, -8, 6, 0] } : { rotate: 0 }}
          transition={{ duration: 0.6 }}
          className="grid place-items-center"
        >
          <Bell size={15} />
        </motion.span>
        <AnimatePresence>
          {unread > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              data-testid="bell-badge"
              className={cn(
                'absolute -top-0.5 -right-0.5 min-w-[16px] h-4 grid place-items-center px-1 rounded-full font-mono text-[9px] font-bold',
                urgent ? 'bg-threat-500 text-white' : 'bg-moss-400 text-forest-900'
              )}
            >
              {unread > 9 ? '9+' : unread}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="fixed sm:absolute inset-x-3 sm:inset-x-auto top-16 sm:top-11 sm:right-0 sm:w-[380px] z-50 bg-[#0d110e] rounded-2xl border border-white/10 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.8)] overflow-hidden origin-top-right"
            data-testid="notification-center"
            role="dialog"
            aria-label="Notifications"
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-3">
              <div>
                <div className="font-display text-[15px] font-semibold tracking-tight">Notifications</div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-white/40">
                  {unread ? `${unread} new` : 'All caught up'}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <IconButton title="Mark all read" onClick={markAllRead} disabled={!unread}>
                  <CheckCheck size={14} />
                </IconButton>
                <IconButton title="Clear all" onClick={clear} disabled={!items.length}>
                  <Trash2 size={13} />
                </IconButton>
              </div>
            </div>

            <div className="flex gap-1 px-4 pb-3">
              {(['all', 'threats', 'system'] as Filter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-[11px] font-medium capitalize transition',
                    filter === f ? 'bg-moss-500/20 text-moss-200' : 'text-white/50 hover:text-white hover:bg-white/5'
                  )}
                >
                  {f === 'threats' ? 'Animals' : f}
                </button>
              ))}
            </div>

            <div className="max-h-[min(440px,60vh)] overflow-y-auto border-t border-white/[0.06]">
              {sections.length === 0 ? (
                <div className="py-12 px-6 text-center">
                  <BellOff size={22} className="mx-auto text-white/25" />
                  <div className="mt-2 text-sm text-white/60">You're all caught up</div>
                  <div className="mt-1 text-xs text-white/35">New sightings, alerts and system events appear here.</div>
                </div>
              ) : (
                sections.map((section) => (
                  <div key={section.title}>
                    <div className="px-4 pt-3 pb-1 font-mono text-[9px] uppercase tracking-[0.22em] text-white/30">
                      {section.title}
                    </div>
                    <AnimatePresence initial={false}>
                      {section.items.map((n) => (
                        <NotificationRow key={n.id} n={n} onOpen={() => openItem(n)} onRemove={() => remove(n.id)} />
                      ))}
                    </AnimatePresence>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center justify-between px-4 py-2.5 border-t border-white/[0.06] text-[11px]">
              <button
                onClick={() => {
                  close();
                  nav('/alerts');
                }}
                className="inline-flex items-center gap-1 text-moss-300 hover:text-moss-200"
              >
                Alert queue <ArrowUpRight size={11} />
              </button>
              <button
                onClick={() => {
                  close();
                  nav('/settings');
                }}
                className="inline-flex items-center gap-1 text-white/45 hover:text-white/80"
              >
                <SlidersHorizontal size={11} /> Preferences
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NotificationRow({ n, onOpen, onRemove }: { n: AppNotification; onOpen: () => void; onRemove: () => void }) {
  const Icon = kindIcon[n.kind] ?? Bell;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="group relative"
    >
      <button
        onClick={onOpen}
        className={cn(
          'w-full text-left flex items-start gap-3 px-4 py-2.5 transition',
          n.read ? 'hover:bg-white/[0.03]' : 'bg-moss-500/[0.04] hover:bg-moss-500/[0.08]'
        )}
      >
        <div className={cn('h-7 w-7 grid place-items-center rounded-lg border shrink-0 mt-0.5', levelTone[n.level])}>
          <Icon size={13} />
        </div>
        <div className="min-w-0 flex-1 pr-5">
          <div className="flex items-center gap-1.5">
            <span className={cn('text-[13px] tracking-tight truncate', n.read ? 'text-white/70' : 'text-white font-medium')}>
              {n.title}
            </span>
            {n.count > 1 && (
              <span className="shrink-0 font-mono text-[9px] px-1.5 py-0.5 rounded bg-white/8 text-white/60">×{n.count}</span>
            )}
          </div>
          <div className="text-[12px] text-white/45 leading-snug line-clamp-2">{n.message}</div>
          <div className="mt-0.5 font-mono text-[10px] text-white/30">{formatRelative(new Date(n.lastAt).toISOString())}</div>
        </div>
        {!n.read && <span className="absolute right-4 top-3.5 h-1.5 w-1.5 rounded-full bg-moss-400" />}
      </button>
      <button
        onClick={onRemove}
        aria-label="Remove notification"
        className="absolute right-2.5 bottom-2.5 h-6 w-6 grid place-items-center rounded-md text-white/30 hover:text-white/80 hover:bg-white/10 opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
      >
        <X size={12} />
      </button>
    </motion.div>
  );
}

function IconButton({ title, onClick, disabled, children }: { title: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className="h-7 w-7 grid place-items-center rounded-md text-white/45 hover:text-white hover:bg-white/10 transition disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
