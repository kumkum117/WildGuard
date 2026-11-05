import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Info, ShieldAlert, X, ArrowUpRight } from 'lucide-react';
import { useToastStore, type Toast } from '../../store/toastStore';
import { cn } from '../../utils/cn';

const tone = {
  danger: { ring: 'border-threat-500/40', icon: 'bg-threat-500/15 text-threat-300', bar: 'bg-threat-500', Icon: ShieldAlert },
  warning: { ring: 'border-amber2-500/35', icon: 'bg-amber2-500/15 text-amber2-300', bar: 'bg-amber2-500', Icon: ShieldAlert },
  success: { ring: 'border-moss-500/35', icon: 'bg-moss-500/15 text-moss-300', bar: 'bg-moss-400', Icon: CheckCircle2 },
  info: { ring: 'border-white/12', icon: 'bg-white/8 text-white/70', bar: 'bg-white/40', Icon: Info },
} as const;

export default function ToastOverlay() {
  const toasts = useToastStore((s) => s.toasts);
  return (
    <div
      aria-live="polite"
      className="fixed z-[60] bottom-4 inset-x-3 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[340px] flex flex-col gap-2 pointer-events-none"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const nav = useNavigate();
  const [paused, setPaused] = useState(false);
  const duration = toast.duration ?? 5000;
  const remaining = useRef(duration);
  const version = useRef(toast.version);
  const t = tone[toast.level] ?? tone.info;

  useEffect(() => {
    if (version.current !== toast.version) {
      version.current = toast.version;
      remaining.current = duration;     // updated in place → full time again
    }
    if (paused) return;
    const started = Date.now();
    const id = window.setTimeout(() => dismiss(toast.id), remaining.current);
    return () => {
      window.clearTimeout(id);
      remaining.current = Math.max(800, remaining.current - (Date.now() - started));
    };
  }, [paused, toast.version, toast.id, duration, dismiss]);

  const open = () => {
    if (toast.link) nav(toast.link);
    dismiss(toast.id);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, scale: 0.97, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={cn('pointer-events-auto relative overflow-hidden glass-strong rounded-2xl border shadow-2xl', t.ring)}
      role={toast.level === 'danger' ? 'alert' : 'status'}
      data-testid="toast"
    >
      <div className="flex items-start gap-3 p-3.5 pr-9">
        <div className={cn('h-8 w-8 grid place-items-center rounded-lg shrink-0', t.icon)}>
          <t.Icon size={15} />
        </div>
        <button onClick={open} className="min-w-0 flex-1 text-left" disabled={!toast.link}>
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm tracking-tight truncate">{toast.title}</span>
            {(toast.count ?? 1) > 1 && (
              <motion.span
                key={toast.count}
                initial={{ scale: 1.4 }}
                animate={{ scale: 1 }}
                className="shrink-0 font-mono text-[10px] px-1.5 py-0.5 rounded-md bg-white/10 text-white/70"
              >
                ×{toast.count}
              </motion.span>
            )}
          </div>
          <div className="text-[13px] text-white/60 mt-0.5 leading-snug">{toast.message}</div>
          {toast.link && (
            <div className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-moss-300">
              View <ArrowUpRight size={11} />
            </div>
          )}
        </button>
      </div>
      <button
        onClick={() => dismiss(toast.id)}
        aria-label="Dismiss"
        className="absolute top-2.5 right-2.5 h-6 w-6 grid place-items-center rounded-md text-white/35 hover:text-white/80 hover:bg-white/10 transition"
      >
        <X size={13} />
      </button>
      <div className="absolute bottom-0 inset-x-0 h-0.5 bg-white/5">
        <div
          key={toast.version}
          className={cn('h-full origin-left', t.bar)}
          style={{
            animation: `wg-toast-progress ${duration}ms linear forwards`,
            animationPlayState: paused ? 'paused' : 'running',
            opacity: 0.7,
          }}
        />
      </div>
    </motion.div>
  );
}

