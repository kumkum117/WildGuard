import { useEffect, useRef, useState } from 'react';
import { motion, useAnimationControls } from 'framer-motion';
import { cn } from '../../utils/cn';

interface Props {
  onConfirm: () => void;
  holdMs?: number;
  disabled?: boolean;
  tone?: 'threat' | 'amber' | 'moss';
  className?: string;
  hint?: string;
  children: React.ReactNode;
  testId?: string;
}

const fill = {
  threat: 'bg-threat-500/35',
  amber: 'bg-amber2-500/35',
  moss: 'bg-moss-500/35',
} as const;

// Press-and-hold to confirm (mouse, touch, or Space/Enter held). Used for
// anything loud or alarming so a stray click can't fire a siren at night.
export default function HoldButton({ onConfirm, holdMs = 900, disabled, tone = 'threat', className, hint, children, testId }: Props) {
  const [progress, setProgress] = useState(0);
  const started = useRef<number | null>(null);
  const raf = useRef<number | null>(null);
  const shake = useAnimationControls();

  const cancel = (early: boolean) => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
    if (early && started.current !== null && progress > 0.05 && progress < 1) {
      shake.start({ x: [0, -4, 4, -2, 0], transition: { duration: 0.25 } });
    }
    started.current = null;
    setProgress(0);
  };

  const start = () => {
    if (disabled || started.current !== null) return;
    started.current = performance.now();
    const tick = (t: number) => {
      if (started.current === null) return;
      const p = Math.min(1, (t - started.current) / holdMs);
      setProgress(p);
      if (p >= 1) {
        started.current = null;
        raf.current = null;
        setProgress(0);
        onConfirm();
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };

  useEffect(() => () => {
    if (raf.current) cancelAnimationFrame(raf.current);
  }, []);

  return (
    <motion.button
      type="button"
      animate={shake}
      disabled={disabled}
      data-testid={testId}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        start();
      }}
      onPointerUp={() => cancel(true)}
      onPointerCancel={() => cancel(true)}
      onPointerLeave={() => cancel(true)}
      onKeyDown={(e) => {
        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
          e.preventDefault();
          start();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === ' ' || e.key === 'Enter') cancel(true);
      }}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={hint}
      className={cn('relative overflow-hidden select-none touch-none disabled:opacity-50', className)}
    >
      <span
        aria-hidden
        className={cn('absolute inset-y-0 left-0 pointer-events-none', fill[tone])}
        style={{ width: `${progress * 100}%` }}
      />
      <span className="relative inline-flex items-center justify-center gap-2 w-full">{children}</span>
      {hint && progress === 0 && (
        <span className="sr-only">{hint}</span>
      )}
    </motion.button>
  );
}
