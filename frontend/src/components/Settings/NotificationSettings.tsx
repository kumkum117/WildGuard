// @ts-nocheck
import { Bell, MessageSquare, Phone } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../../utils/cn';
import { useServerSettings } from '../../hooks/useServerSettings';
import { useNotificationStore, type NotifyThreshold } from '../../store/notificationStore';

const THRESHOLDS: { id: NotifyThreshold; label: string; hint: string }[] = [
  { id: 'danger', label: 'High threats', hint: 'Only dangerous animals and alerts' },
  { id: 'warning', label: 'High + medium', hint: 'Also livestock / medium-risk animals and camera problems' },
  { id: 'all', label: 'Everything', hint: 'Every sighting and system event' },
];

export default function NotificationSettings() {
  const [localPrefs, setLocalPrefs] = useState({ push: true, sms: true, call: false });
  const [localSensitivity, setLocalSensitivity] = useState(72);
  // Live mode: stored on the server (sensitivity drives the detector threshold).
  const { live, settings, update } = useServerSettings();
  const prefs = live && settings ? settings.notifications : localPrefs;
  const sensitivity = live && settings ? settings.sensitivity : localSensitivity;
  const setPrefs = (fn: (p: typeof prefs) => typeof prefs) => {
    const next = fn(prefs);
    if (!live) return setLocalPrefs(next);
    if (next.push && !prefs.push && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    update({ notifications: next });
  };
  const setSensitivity = (v: number) => (live ? update({ sensitivity: v }, 400) : setLocalSensitivity(v));

  return (
    <div data-testid="notification-settings" className="glass rounded-3xl p-5 sm:p-6 border border-white/8">
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">
        Notifications
      </div>
      <div className="font-display text-lg font-semibold tracking-tight mt-1">
        Alert preferences
      </div>

      <div className="mt-5 space-y-2">
        <PrefRow
          icon={<Bell size={14} />}
          label="Push notifications"
          desc="In-app + browser banners"
          checked={prefs.push}
          onToggle={() => setPrefs((p) => ({ ...p, push: !p.push }))}
        />
        <PrefRow
          icon={<MessageSquare size={14} />}
          label="SMS alerts"
          desc="Plain SMS to registered phones"
          checked={prefs.sms}
          onToggle={() => setPrefs((p) => ({ ...p, sms: !p.sms }))}
        />
        <PrefRow
          icon={<Phone size={14} />}
          label="Voice calls"
          desc="Auto-dial for critical events"
          checked={prefs.call}
          onToggle={() => setPrefs((p) => ({ ...p, call: !p.call }))}
        />
      </div>

      <ThresholdPicker />

      <div className="mt-6 glass rounded-2xl p-4 border border-white/5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">AI sensitivity</div>
            <div className="text-xs text-white/45 mt-0.5">
              Lower = fewer false positives
              {live && ` · detector threshold ${(0.6 - ((sensitivity - 20) / 80) * 0.5).toFixed(2)}`}
            </div>
          </div>
          <div className="font-mono text-moss-300 text-sm tabular-nums">{sensitivity}%</div>
        </div>
        <input
          type="range"
          min={20}
          max={100}
          value={sensitivity}
          onChange={(e) => setSensitivity(parseInt(e.target.value))}
          className="mt-3 w-full accent-moss-400"
          data-testid="sensitivity-slider"
        />
        <div className="mt-2 flex justify-between font-mono text-[10px] text-white/40 uppercase tracking-wider">
          <span>Permissive</span>
          <span>Strict</span>
        </div>
      </div>
    </div>
  );
}

const PrefRow = ({
  icon,
  label,
  desc,
  checked,
  onToggle,
}: {
  icon: React.ReactNode;
  label: string;
  desc: string;
  checked: boolean;
  onToggle: () => void;
}) => (
  <button
    onClick={onToggle}
    className="w-full flex items-center justify-between p-3 rounded-xl border border-white/5 hover:border-white/15 hover:bg-white/3 transition text-left"
  >
    <div className="flex items-center gap-3">
      <div className="h-9 w-9 grid place-items-center rounded-lg bg-moss-500/8 border border-moss-500/20 text-moss-300">
        {icon}
      </div>
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-white/45">{desc}</div>
      </div>
    </div>
    <div
      className={cn(
        'h-6 w-11 rounded-full border relative transition-colors',
        checked ? 'bg-moss-500/40 border-moss-500/40' : 'bg-white/5 border-white/10'
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-5 w-5 rounded-full transition-all',
          checked ? 'right-0.5 bg-moss-200' : 'left-0.5 bg-white/40'
        )}
      />
    </div>
  </button>
);

function ThresholdPicker() {
  const threshold = useNotificationStore((st) => st.threshold);
  const setThreshold = useNotificationStore((st) => st.setThreshold);
  const active = THRESHOLDS.find((t) => t.id === threshold);
  return (
    <div className="mt-4 glass rounded-2xl p-4 border border-white/5" data-testid="notify-threshold">
      <div className="text-sm font-medium">Notify me about</div>
      <div className="text-xs text-white/45 mt-0.5">{active?.hint}. Repeats are grouped, never stacked.</div>
      <div className="mt-3 grid grid-cols-3 gap-1 p-1 rounded-xl bg-white/3 border border-white/8">
        {THRESHOLDS.map((t) => (
          <button
            key={t.id}
            onClick={() => setThreshold(t.id)}
            className={cn(
              'px-2 py-1.5 rounded-lg text-xs font-medium transition',
              threshold === t.id ? 'bg-moss-500/20 text-moss-200' : 'text-white/55 hover:text-white'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
