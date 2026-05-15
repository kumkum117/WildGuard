// @ts-nocheck
import { Bell, MessageSquare, Phone } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../../utils/cn';

export default function NotificationSettings() {
  const [prefs, setPrefs] = useState({ push: true, sms: true, call: false });
  const [sensitivity, setSensitivity] = useState(72);

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

      <div className="mt-6 glass rounded-2xl p-4 border border-white/5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">AI sensitivity</div>
            <div className="text-xs text-white/45 mt-0.5">Lower = fewer false positives</div>
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
