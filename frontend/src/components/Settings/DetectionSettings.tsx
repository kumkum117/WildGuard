import { Moon, Sun, SunMoon, ScanEye, Eye, Mail, Cpu } from 'lucide-react';
import type { ServerSettings } from '../../types';
import { useConnectionStore } from '../../store/connectionStore';
import { useServerSettings } from '../../hooks/useServerSettings';
import { cn } from '../../utils/cn';

const NIGHT: { id: ServerSettings['night_mode']; label: string; Icon: typeof Moon }[] = [
  { id: 'auto', label: 'Auto', Icon: SunMoon },
  { id: 'on', label: 'Always', Icon: Moon },
  { id: 'off', label: 'Off', Icon: Sun },
];

// Detection-engine controls (live mode only): night vision, species
// verification, e-mail alerts, plus read-only engine / alert configuration.
export default function DetectionSettings() {
  const { live, settings, update } = useServerSettings();
  const health = useConnectionStore((s) => s.health);
  if (!live || !settings) return null;
  const alerts = health?.alerts;

  return (
    <div data-testid="detection-settings" className="glass rounded-3xl p-5 sm:p-6 border border-white/8">
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">AI engine</div>
      <div className="font-display text-lg font-semibold tracking-tight mt-1">Detection & night vision</div>

      <div className="mt-5 glass rounded-2xl p-4 border border-white/5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-medium">Night-vision enhancement</div>
            <div className="text-xs text-white/45 mt-0.5">
              Auto brightens & denoises dark and infrared frames before detection
            </div>
          </div>
          <div className="flex gap-1 p-1 rounded-xl bg-white/3 border border-white/8">
            {NIGHT.map(({ id, label, Icon }) => (
              <button
                key={id}
                data-testid={`setting-night-${id}`}
                onClick={() => update({ night_mode: id })}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition',
                  settings.night_mode === id ? 'bg-moss-500/20 text-moss-200' : 'text-white/55 hover:text-white'
                )}
              >
                <Icon size={12} /> {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-2 glass rounded-2xl p-4 border border-white/5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-medium">AI frame rate</div>
            <div className="text-xs text-white/45 mt-0.5">Frames analysed per second, per camera — higher reacts faster, uses more CPU</div>
          </div>
          <div className="flex gap-1 p-1 rounded-xl bg-white/3 border border-white/8">
            {[1, 2, 4].map((fps) => (
              <button
                key={fps}
                onClick={() => update({ max_inference_fps: fps })}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition',
                  Math.round(settings.max_inference_fps) === fps ? 'bg-moss-500/20 text-moss-200' : 'text-white/55 hover:text-white'
                )}
              >
                {fps} fps
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-2 space-y-2">
        <Toggle
          icon={<Eye size={14} />}
          label="Night view on live feeds"
          desc="Show the enhanced picture on camera feeds after dark"
          checked={settings.night_view}
          onToggle={() => update({ night_view: !settings.night_view })}
        />
        <Toggle
          icon={<ScanEye size={14} />}
          label="Species verification (CLIP)"
          desc="Second AI model double-checks every animal's species — fewer mix-ups, more CPU"
          checked={settings.species_classifier}
          disabled={!health?.engine.classifier}
          onToggle={() => update({ species_classifier: !settings.species_classifier })}
        />
        <Toggle
          icon={<Mail size={14} />}
          label="E-mail alerts"
          desc={
            alerts?.email_configured
              ? 'High-risk animals are e-mailed with a snapshot (credentials from .env)'
              : 'Not configured — set ALERT_EMAIL_* in the project .env file'
          }
          checked={settings.email_alerts && !!alerts?.email_configured}
          disabled={!alerts?.email_configured}
          onToggle={() => update({ email_alerts: !settings.email_alerts })}
        />
      </div>

      {health && (
        <div className="mt-5 grid grid-cols-2 gap-2 text-xs">
          <Info label="Model" value={health.engine.model} hint={health.engine.model_type} />
          <Info label="Compute" value={health.engine.device.toUpperCase()} hint={`${Math.round(health.engine.avg_inference_ms)} ms / frame`} icon={<Cpu size={11} />} />
          <Info
            label="Alert threshold"
            value={`${Math.round((alerts?.confidence_threshold ?? 0) * 100)}% confidence`}
            hint={`cooldown ${Math.round((alerts?.cooldown_seconds ?? 0) / 60)} min per animal / camera`}
          />
          <Info
            label="High-risk animals"
            value={`${alerts?.high_risk_animals.length ?? 0} species`}
            hint={(alerts?.high_risk_animals ?? []).join(', ')}
          />
        </div>
      )}
    </div>
  );
}

function Toggle({ icon, label, desc, checked, disabled, onToggle }: {
  icon: React.ReactNode; label: string; desc: string; checked: boolean; disabled?: boolean; onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className="w-full flex items-center justify-between gap-3 p-3 rounded-xl border border-white/5 hover:border-white/15 hover:bg-white/3 transition text-left disabled:opacity-50 disabled:hover:border-white/5"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-9 w-9 grid place-items-center rounded-lg bg-moss-500/8 border border-moss-500/20 text-moss-300 shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium">{label}</div>
          <div className="text-xs text-white/45">{desc}</div>
        </div>
      </div>
      <div className={cn('h-6 w-11 rounded-full border relative transition-colors shrink-0', checked ? 'bg-moss-500/40 border-moss-500/40' : 'bg-white/5 border-white/10')}>
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full transition-all', checked ? 'right-0.5 bg-moss-200' : 'left-0.5 bg-white/40')} />
      </div>
    </button>
  );
}

function Info({ label, value, hint, icon }: { label: string; value: string; hint?: string; icon?: React.ReactNode }) {
  return (
    <div className="glass rounded-xl p-3 border border-white/5 min-w-0">
      <div className="font-mono text-[10px] uppercase tracking-wider text-white/40 inline-flex items-center gap-1.5">
        {icon} {label}
      </div>
      <div className="mt-1 text-sm font-medium truncate">{value}</div>
      {hint && <div className="text-[10px] text-white/35 font-mono truncate" title={hint}>{hint}</div>}
    </div>
  );
}
