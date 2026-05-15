// @ts-nocheck
import { motion } from 'framer-motion';
import { cn } from '../../utils/cn';
import type { ReactNode } from 'react';

interface Props {
  icon?: ReactNode;
  title: string;
  message: string;
  level?: 'info' | 'success' | 'warning' | 'danger';
  time?: string;
  className?: string;
}

const palette = {
  info: 'border-white/10 text-white/80',
  success: 'border-moss-500/30 text-moss-300',
  warning: 'border-amber2-500/30 text-amber2-300',
  danger: 'border-threat-500/40 text-threat-300 shadow-glow-threat',
};

export default function NotificationCard({ icon, title, message, level = 'info', time, className }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.25 }}
      className={cn('glass rounded-2xl p-4 border', palette[level], className)}
    >
      <div className="flex items-start gap-3">
        <div className="h-8 w-8 grid place-items-center rounded-lg bg-white/5 border border-white/10 shrink-0">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <div className="font-medium text-sm tracking-tight truncate">{title}</div>
            {time && <div className="font-mono text-[10px] text-white/40 shrink-0">{time}</div>}
          </div>
          <div className="text-sm text-white/60 mt-0.5">{message}</div>
        </div>
      </div>
    </motion.div>
  );
}
