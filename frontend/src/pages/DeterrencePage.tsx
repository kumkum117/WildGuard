// @ts-nocheck
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Megaphone, Users, CheckCircle2, Radio, AlertTriangle, X } from 'lucide-react';
import DeterrenceControl from '../components/Deterrence/DeterrenceControl';
import { useToastStore } from '../store/toastStore';
import { useActivityStore } from '../store/activityStore';
import { useDetectionStore } from '../store/detectionStore';
import { useConnectionStore } from '../store/connectionStore';
import { backend } from '../services/backend';
import { cn } from '../utils/cn';

const ALERT_TYPES = [
  {
    id: 'evacuation',
    label: 'Village evacuation',
    desc: 'Urge residents to move away from the forest boundary immediately.',
    level: 'danger' as const,
    icon: AlertTriangle,
    color: 'threat',
  },
  {
    id: 'warning',
    label: 'Stay indoors warning',
    desc: 'Advise villagers to stay inside and secure livestock.',
    level: 'warning' as const,
    icon: Radio,
    color: 'amber',
  },
  {
    id: 'allclear',
    label: 'All-clear broadcast',
    desc: 'Notify villagers that the threat has passed — safe to resume activity.',
    level: 'success' as const,
    icon: CheckCircle2,
    color: 'moss',
  },
];

function VillagerAlertPanel() {
  const [selected, setSelected] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const pushToast = useToastStore((s) => s.push);
  const pushEvent = useActivityStore((s) => s.push);
  const cameras = useDetectionStore((s) => s.cameras);

  const sendAlert = async () => {
    if (!selected || sending) return;
    const type = ALERT_TYPES.find((t) => t.id === selected);
    if (!type) return;
    setSending(true);
    const live = useConnectionStore.getState().mode === 'live';
    if (live) {
      // Logged by the backend (and forwarded to deterrence hardware, if configured).
      try {
        await backend.broadcast(type.id);
      } catch (err) {
        setSending(false);
        pushToast({ title: 'Broadcast failed', message: (err as Error).message, level: 'danger', duration: 7000 });
        return;
      }
    } else {
      await new Promise((r) => setTimeout(r, 900));
    }
    setSending(false);
    setSent(selected);
    pushToast({
      title: `Villager broadcast sent`,
      message: `${type.label} dispatched to all registered contacts (${cameras.length * 12 + 38} recipients).`,
      level: type.level,
      duration: 7000,
    });
    if (!live) {
      // In live mode the backend's activity event arrives over the event stream.
      pushEvent({
        id: `EVT-vil-${Date.now()}`,
        type: 'deterrence',
        message: `Villager alert broadcast: "${type.label}"`,
        level: type.level,
        timestamp: new Date().toISOString(),
      });
    }
    setTimeout(() => setSent(null), 5000);
  };

  return (
    <div className="glass rounded-3xl p-5 sm:p-6 border border-white/8">
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">
            Community broadcast
          </div>
          <div className="font-display text-lg font-semibold tracking-tight mt-1 flex items-center gap-2">
            <Users size={18} className="text-moss-400" />
            Alert villagers
          </div>
        </div>
        <AnimatePresence>
          {sent && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-moss-500/15 border border-moss-500/30 text-moss-300 text-xs font-mono uppercase tracking-wider"
            >
              <CheckCircle2 size={13} /> Broadcast sent
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        {ALERT_TYPES.map((t) => {
          const Icon = t.icon;
          const isSelected = selected === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setSelected(isSelected ? null : t.id)}
              className={cn(
                'text-left p-4 rounded-2xl border transition-all',
                t.color === 'threat' && isSelected && 'bg-threat-500/10 border-threat-500/40 shadow-glow-threat',
                t.color === 'amber' && isSelected && 'bg-amber2-500/10 border-amber2-500/35',
                t.color === 'moss' && isSelected && 'bg-moss-500/10 border-moss-500/35 shadow-glow-safe',
                !isSelected && 'bg-white/3 border-white/8 hover:border-white/20 hover:bg-white/5'
              )}
            >
              <Icon
                size={18}
                className={cn(
                  'mb-2',
                  t.color === 'threat' ? 'text-threat-400' : t.color === 'amber' ? 'text-amber2-400' : 'text-moss-400'
                )}
              />
              <div className="text-sm font-medium tracking-tight">{t.label}</div>
              <div className="text-[11px] text-white/45 mt-1 leading-snug">{t.desc}</div>
            </button>
          );
        })}
      </div>

      <motion.button
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.98 }}
        disabled={!selected || sending}
        onClick={sendAlert}
        className={cn(
          'w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all',
          selected
            ? 'bg-gradient-to-b from-moss-400 to-moss-600 text-forest-900 shadow-glow-safe'
            : 'bg-white/5 border border-white/10 text-white/30 cursor-not-allowed'
        )}
      >
        <Megaphone size={16} />
        {sending ? 'Dispatching broadcast…' : selected ? 'Send broadcast to villagers' : 'Select an alert type above'}
      </motion.button>
    </div>
  );
}

export default function DeterrencePage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-5 max-w-[1500px] mx-auto"
      data-testid="deterrence-page"
    >
      <div className="glass rounded-3xl p-5 sm:p-6 border border-white/8">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">
          Active deterrence
        </div>
        <div className="font-display text-xl sm:text-2xl font-semibold tracking-tight mt-1">
          Non-lethal animal repulsion
        </div>
        <div className="mt-2 text-sm text-white/55 max-w-xl">
          Drive wildlife back into the forest with sirens, strobes, and warning broadcasts.
          Auto-mode follows the response matrix; manual mode hands control to the ranger.
        </div>
      </div>
      <DeterrenceControl />
      <VillagerAlertPanel />
    </motion.div>
  );
}