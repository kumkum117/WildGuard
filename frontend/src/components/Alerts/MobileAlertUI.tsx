// @ts-nocheck
import { motion } from 'framer-motion';
import { AlertTriangle, Smartphone } from 'lucide-react';

interface Props {
  animal?: string;
  location?: string;
}

export default function MobileAlertUI({ animal = 'Leopard', location = 'Village Gate' }: Props) {
  return (
    <div data-testid="mobile-alert-ui" className="relative mx-auto w-full max-w-[260px]">
      <div className="relative aspect-[9/19] glass-strong rounded-[2.5rem] border border-white/15 overflow-hidden p-2 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]">
        {/* Notch */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-20 h-5 rounded-full bg-black/80 border border-white/10 z-20" />
        <div className="absolute inset-1 rounded-[2.2rem] bg-forest-950 overflow-hidden">
          {/* Lockscreen wallpaper */}
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage:
                "url('https://images.unsplash.com/photo-1511497584788-876760111969?auto=format&fit=crop&w=900&q=70')",
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-forest-950/40 via-forest-950/30 to-forest-950/90" />

          {/* Status bar */}
          <div className="relative pt-7 px-4 flex items-center justify-between text-[10px] font-mono text-white/80">
            <span>9:42</span>
            <div className="flex items-center gap-1 text-white/70">
              <span>5G</span>
              <Smartphone size={9} />
            </div>
          </div>

          {/* Time */}
          <div className="relative mt-2 text-center">
            <div className="font-display text-5xl font-light tracking-tight text-white/95">
              09:42
            </div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-white/60 mt-0.5">
              Tuesday, Feb 17
            </div>
          </div>

          {/* Alert notification */}
          <motion.div
            initial={{ y: -10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="absolute left-3 right-3 top-32"
          >
            <motion.div
              animate={{ boxShadow: ['0 0 0 0 rgba(239,68,68,0.3)', '0 0 0 12px rgba(239,68,68,0)'] }}
              transition={{ duration: 1.8, repeat: Infinity }}
              className="rounded-2xl bg-gradient-to-b from-threat-500/30 to-threat-700/40 border border-threat-500/50 backdrop-blur-xl p-3 text-left"
            >
              <div className="flex items-start gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-threat-500 grid place-items-center shrink-0">
                  <AlertTriangle size={14} className="text-forest-900" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-[12px] text-white">WildGuard AI</div>
                    <div className="font-mono text-[8px] text-white/50 uppercase">now</div>
                  </div>
                  <div className="text-[11px] text-white/85 mt-0.5 leading-snug">
                    ⚠ ALERT: {animal} detected near {location}. Stay indoors.
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>

          {/* Bottom hint */}
          <div className="absolute bottom-2 inset-x-0 flex justify-center">
            <div className="h-1 w-24 rounded-full bg-white/40" />
          </div>
        </div>
      </div>
    </div>
  );
}
