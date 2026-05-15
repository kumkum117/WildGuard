// @ts-nocheck
import { motion } from 'framer-motion';
import { Leaf } from 'lucide-react';
import { APP_NAME, APP_TAGLINE } from '../../utils/constants';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen relative overflow-hidden bg-forest-900">
      {/* Backdrop forest photo */}
      <div
        className="absolute inset-0 bg-cover bg-center scale-110"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=2400&q=80')",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-br from-forest-900/80 via-forest-900/85 to-forest-950/95" />
      <div className="absolute inset-0 grid-bg opacity-50" />

      {/* Floating ambient blobs */}
      <motion.div
        className="absolute -left-32 top-1/3 h-96 w-96 rounded-full bg-moss-500/15 blur-3xl"
        animate={{ x: [0, 40, 0], y: [0, -30, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -right-32 bottom-1/4 h-[28rem] w-[28rem] rounded-full bg-moss-700/15 blur-3xl"
        animate={{ x: [0, -50, 0], y: [0, 30, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
      />

      <div className="relative z-10 min-h-screen flex flex-col lg:flex-row">
        {/* Left brand panel */}
        <div className="lg:flex-1 flex items-center justify-center lg:justify-end px-6 lg:px-16 pt-10 lg:pt-0">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            className="max-w-md text-center lg:text-left"
          >
            <div className="inline-flex items-center gap-3 mb-6">
              <div className="relative h-12 w-12 rounded-2xl bg-gradient-to-br from-moss-400 to-moss-700 grid place-items-center shadow-glow-safe">
                <Leaf size={22} className="text-forest-900" />
              </div>
              <span className="font-mono text-[11px] uppercase tracking-[0.32em] text-moss-300/90">
                Sentinel · OS
              </span>
            </div>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-semibold leading-[1.02] tracking-tight">
              <span className="bg-gradient-to-r from-white via-moss-200 to-moss-400 bg-clip-text text-transparent">
                {APP_NAME}
              </span>
            </h1>
            <p className="mt-5 text-white/55 text-base leading-relaxed max-w-sm mx-auto lg:mx-0">
              {APP_TAGLINE}. Real-time AI surveillance protecting villages, forests, and wildlife
              corridors — 24×7.
            </p>

            <div className="mt-10 hidden lg:grid grid-cols-3 gap-4 max-w-md">
              {[
                { k: '99.2%', l: 'Detection accuracy' },
                { k: '<1.4s', l: 'Alert latency' },
                { k: '12k+', l: 'Animals tracked' },
              ].map((s) => (
                <div key={s.l} className="glass rounded-xl p-3">
                  <div className="font-mono text-moss-300 text-base">{s.k}</div>
                  <div className="text-[11px] text-white/40 mt-1 leading-tight">{s.l}</div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Right form area */}
        <div className="lg:flex-1 flex items-center justify-center lg:justify-start px-6 lg:px-16 py-12">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
            className="w-full max-w-md"
          >
            {children}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
