import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Radio, CheckCircle2, Megaphone, Users, MonitorSmartphone, MessageSquare, Speaker, Loader } from 'lucide-react';
import type { BroadcastInfo, BroadcastRecord } from '../../types';
import { backend } from '../../services/backend';
import { useConnectionStore } from '../../store/connectionStore';
import { useDeterrenceStore } from '../../store/deterrenceStore';
import { useActivityStore } from '../../store/activityStore';
import { notify } from '../../services/notify';
import { formatRelative } from '../../utils/formatters';
import HoldButton from './HoldButton';
import { cn } from '../../utils/cn';

const TYPES = [
  { id: 'evacuation', label: 'Village evacuation', desc: 'Move away from the forest edge now.', level: 'danger' as const, Icon: AlertTriangle },
  { id: 'warning', label: 'Stay indoors', desc: 'Stay inside and secure livestock.', level: 'warning' as const, Icon: Radio },
  { id: 'allclear', label: 'All-clear', desc: 'The animal has left; resume activity.', level: 'success' as const, Icon: CheckCircle2 },
];

const DEMO_INFO: BroadcastInfo = {
  templates: {
    evacuation: { title: 'Village evacuation', level: 'danger', message: 'WildGuard EMERGENCY: Wild animal near the forest edge. Move away from the forest edge now and follow ranger instructions.' },
    warning: { title: 'Stay indoors', level: 'warning', message: 'WildGuard WARNING: Wild animal seen near the forest edge. Stay indoors and keep livestock secured.' },
    allclear: { title: 'All-clear', level: 'success', message: 'WildGuard ALL CLEAR: the animal near the forest edge has left. You may resume normal activity.' },
  },
  channels: {
    dashboard: { available: true },
    loudspeaker: { available: false, reason: 'Demo mode' },
    sms: { available: false, recipients: 0, reason: 'Demo mode' },
  },
  history: [],
};

const DUPLICATE_WINDOW_S = 300;

export default function VillagerBroadcast() {
  const live = useConnectionStore((s) => s.mode === 'live');
  const suggestion = useDeterrenceStore((s) => s.server.suggestion);
  const broadcasts = useDeterrenceStore((s) => s.broadcasts);
  const { setBroadcasts, upsertBroadcast } = useDeterrenceStore.getState();
  const [info, setInfo] = useState<BroadcastInfo>(DEMO_INFO);
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    if (!live) {
      setInfo(DEMO_INFO);
      return;
    }
    backend
      .broadcasts()
      .then((i) => {
        setInfo(i);
        setBroadcasts(i.history);
      })
      .catch(() => {});
  };

  useEffect(load, [live]); // eslint-disable-line react-hooks/exhaustive-deps

  // A playbook step suggested warning the village: preselect it.
  useEffect(() => {
    if (suggestion?.type === 'broadcast' && suggestion.broadcast) {
      setSelected(suggestion.broadcast);
      setMessage(suggestion.message ?? info.templates[suggestion.broadcast]?.message ?? '');
      if (window.location.hash === '#broadcast') document.getElementById('broadcast')?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [suggestion]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (id: string) => {
    if (selected === id) {
      setSelected(null);
      return;
    }
    setSelected(id);
    setMessage(info.templates[id]?.message ?? '');
    setConfirmDuplicate(false);
    setError(null);
  };

  const lastOfType = useMemo(
    () => (selected ? broadcasts.find((b) => b.type === selected) : undefined),
    [broadcasts, selected]
  );
  const recentDuplicate = !!lastOfType && Date.now() / 1000 - lastOfType.timestamp < DUPLICATE_WINDOW_S;

  const send = async () => {
    if (!selected || sending) return;
    if (recentDuplicate && !confirmDuplicate) {
      setConfirmDuplicate(true);
      return;
    }
    setSending(true);
    setError(null);
    const type = TYPES.find((t) => t.id === selected)!;
    try {
      let record: BroadcastRecord;
      if (live) {
        record = await backend.broadcast(selected, message);
      } else {
        await new Promise((r) => setTimeout(r, 700));
        record = {
          id: `BRC-demo-${Date.now()}`, type: selected, title: type.label, level: type.level, message,
          timestamp: Date.now() / 1000, actor: 'You', channels: { dashboard: 'sent', loudspeaker: 'not configured', sms: 'not configured' }, recipients: 0,
        };
        useActivityStore.getState().push({
          id: `EVT-vil-${Date.now()}`, type: 'deterrence', message: `Villager alert broadcast: "${type.label}"`, level: type.level, timestamp: new Date().toISOString(),
        });
      }
      upsertBroadcast(record);
      notify({ kind: 'deterrence', level: type.level, title: `Broadcast sent: ${type.label}`, message: channelSummary(record), groupKey: `broadcast:${record.id}`, link: '/deterrence' }, { toast: true });
      setSelected(null);
      setConfirmDuplicate(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  const sms = info.channels.sms;
  const loudspeaker = info.channels.loudspeaker;
  const selectedType = TYPES.find((t) => t.id === selected);
  const segments = Math.max(1, Math.ceil(message.length / 160));

  return (
    <section id="broadcast" data-testid="villager-broadcast" className="glass rounded-3xl p-5 sm:p-6 border border-white/8">
      <div className="flex items-end justify-between gap-3 mb-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">Community broadcast</div>
          <div className="font-display text-lg font-semibold tracking-tight mt-1 flex items-center gap-2">
            <Users size={17} className="text-moss-400" /> Alert villagers
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          <Channel icon={<MonitorSmartphone size={11} />} label="Dashboard" ok />
          <Channel icon={<Speaker size={11} />} label="Loudspeaker" ok={loudspeaker.available} reason={loudspeaker.reason ?? undefined} />
          <Channel
            icon={<MessageSquare size={11} />}
            label={sms.available ? `SMS · ${sms.recipients}` : 'SMS'}
            ok={sms.available}
            reason={sms.reason ?? undefined}
          />
        </div>
      </div>

      {suggestion?.type === 'broadcast' && (
        <div className="mb-3 px-3 py-2 rounded-xl bg-amber2-500/10 border border-amber2-500/25 text-[12px] text-amber2-200">
          The playbook suggests warning the village — {suggestion.label} is still near {suggestion.camera}.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {TYPES.map(({ id, label, desc, level, Icon }) => {
          const on = selected === id;
          return (
            <button
              key={id}
              onClick={() => choose(id)}
              className={cn(
                'text-left p-3.5 rounded-2xl border transition-all',
                on && level === 'danger' && 'bg-threat-500/10 border-threat-500/40',
                on && level === 'warning' && 'bg-amber2-500/10 border-amber2-500/35',
                on && level === 'success' && 'bg-moss-500/10 border-moss-500/35',
                !on && 'bg-white/3 border-white/8 hover:border-white/20 hover:bg-white/5'
              )}
            >
              <Icon size={16} className={cn('mb-1.5', level === 'danger' ? 'text-threat-400' : level === 'warning' ? 'text-amber2-400' : 'text-moss-400')} />
              <div className="text-sm font-medium tracking-tight">{label}</div>
              <div className="text-[11px] text-white/45 mt-0.5 leading-snug">{desc}</div>
            </button>
          );
        })}
      </div>

      <AnimatePresence initial={false}>
        {selected && selectedType && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">Message villagers receive</span>
                <span className="font-mono text-[10px] text-white/35">
                  {message.length} chars · {segments} SMS
                </span>
              </div>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, 480))}
                rows={3}
                className="w-full glass rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-moss-400/40 resize-none"
                data-testid="broadcast-message"
              />
              <div className="mt-1 text-[11px] text-white/40">
                {sms.available
                  ? `Goes to ${sms.recipients} villager number${sms.recipients === 1 ? '' : 's'} via ${sms.provider}${loudspeaker.available ? ' and the loudspeakers' : ''}.`
                  : `SMS: ${sms.reason ?? 'not available'} — the broadcast is logged on every dashboard.`}
              </div>
              {error && <div className="mt-2 text-sm text-threat-400">{error}</div>}
              {confirmDuplicate && lastOfType && (
                <div className="mt-2 text-[12px] text-amber2-300">
                  “{selectedType.label}” was sent {formatRelative(new Date(lastOfType.timestamp * 1000).toISOString())} — send it again?
                </div>
              )}
              <div className="mt-3">
                {selected === 'evacuation' ? (
                  <HoldButton
                    onConfirm={send}
                    disabled={sending || !message.trim()}
                    holdMs={1000}
                    tone="threat"
                    hint="Hold to send the evacuation broadcast"
                    className="w-full py-3 rounded-xl bg-threat-500/20 border border-threat-500/45 text-threat-100 font-semibold text-sm"
                  >
                    {sending ? <Loader size={15} className="animate-spin" /> : <Megaphone size={15} />}
                    {confirmDuplicate ? 'Hold again to resend evacuation' : 'Hold to send evacuation'}
                  </HoldButton>
                ) : (
                  <button
                    onClick={send}
                    disabled={sending || !message.trim()}
                    data-testid="broadcast-send"
                    className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-b from-moss-400 to-moss-600 text-forest-900 font-semibold text-sm shadow-glow-safe disabled:opacity-50"
                  >
                    {sending ? <Loader size={15} className="animate-spin" /> : <Megaphone size={15} />}
                    {confirmDuplicate ? 'Send again' : `Send “${selectedType.label}”`}
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-5">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/35 mb-2">Recent broadcasts</div>
        {broadcasts.length === 0 ? (
          <div className="text-[12px] text-white/35">None sent yet.</div>
        ) : (
          <div className="space-y-1.5">
            <AnimatePresence initial={false}>
              {broadcasts.slice(0, 5).map((b) => (
                <motion.div
                  key={b.id}
                  layout
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl border border-white/5 text-[12px]"
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', b.level === 'danger' ? 'bg-threat-500' : b.level === 'warning' ? 'bg-amber2-500' : 'bg-moss-400')} />
                  <span className="font-medium shrink-0">{b.title}</span>
                  <span className="text-white/40 truncate min-w-0 flex-1">{channelSummary(b)}</span>
                  <span className="font-mono text-[10px] text-white/35 shrink-0">{formatRelative(new Date(b.timestamp * 1000).toISOString())}</span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </section>
  );
}

const channelSummary = (b: BroadcastRecord) =>
  Object.entries(b.channels)
    .filter(([, v]) => v !== 'not configured')
    .map(([k, v]) => `${k === 'sms' ? 'SMS' : k[0].toUpperCase() + k.slice(1)} ${v}`)
    .join(' · ') || 'Logged';

function Channel({ icon, label, ok, reason }: { icon: React.ReactNode; label: string; ok?: boolean; reason?: string }) {
  return (
    <span
      title={ok ? undefined : reason}
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px]',
        ok ? 'bg-moss-500/10 border-moss-500/25 text-moss-300' : 'bg-white/3 border-white/10 text-white/35 line-through decoration-white/20'
      )}
    >
      {icon} {label}
    </span>
  );
}
