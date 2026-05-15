// @ts-nocheck
import { cn } from '../../utils/cn';
import type { ThreatLevel } from '../../types';

interface GlowingBadgeProps {
  level: ThreatLevel | 'safe' | 'info';
  children: React.ReactNode;
  pulse?: boolean;
  className?: string;
}

const styles: Record<string, string> = {
  high: 'bg-threat-500/15 border-threat-500/40 text-threat-400 shadow-glow-threat',
  medium: 'bg-amber2-500/15 border-amber2-500/40 text-amber2-400 shadow-glow-amber',
  low: 'bg-moss-500/15 border-moss-500/40 text-moss-300',
  safe: 'bg-moss-500/15 border-moss-500/40 text-moss-300 shadow-glow-safe',
  info: 'bg-white/8 border-white/10 text-white/70',
};

export default function GlowingBadge({ level, children, pulse, className }: GlowingBadgeProps) {
  return (
    <span
      className={cn(
        'pill border',
        styles[level],
        pulse && 'animate-pulse-slow',
        className
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          level === 'high' && 'bg-threat-500',
          level === 'medium' && 'bg-amber2-500',
          (level === 'low' || level === 'safe') && 'bg-moss-400',
          level === 'info' && 'bg-white/50',
          pulse && 'animate-blink'
        )}
      />
      {children}
    </span>
  );
}
