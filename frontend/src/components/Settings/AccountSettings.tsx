// @ts-nocheck
import { useAuth } from '../../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { LogOut, User, Shield, MapPin } from 'lucide-react';

export default function AccountSettings() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const onLogout = () => {
    logout();
    nav('/login');
  };

  return (
    <div data-testid="account-settings" className="glass rounded-3xl p-5 sm:p-6 border border-white/8">
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/45">Account</div>
      <div className="font-display text-lg font-semibold tracking-tight mt-1">Ranger profile</div>

      <div className="mt-5 flex items-center gap-4 p-4 rounded-2xl border border-white/5">
        <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-moss-400 to-moss-700 grid place-items-center font-display text-2xl font-semibold text-forest-900">
          {(user?.name || 'R')[0]}
        </div>
        <div className="min-w-0">
          <div className="font-display text-lg font-semibold tracking-tight">
            {user?.name || 'Ranger'}
          </div>
          <div className="font-mono text-[11px] text-white/45 uppercase tracking-wider">
            {user?.role}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <Info icon={<User size={12} />} label="Phone" value={user?.phone || '—'} />
        <Info icon={<Shield size={12} />} label="Clearance" value="Level 3" />
        <Info icon={<MapPin size={12} />} label="Region" value="Karnataka · Bannerghatta" />
        <Info icon={<User size={12} />} label="ID" value={user?.id || '—'} />
      </div>

      <button
        onClick={onLogout}
        data-testid="account-logout"
        className="mt-5 w-full px-4 py-3 rounded-xl bg-threat-500/12 hover:bg-threat-500/20 border border-threat-500/30 text-threat-300 inline-flex items-center justify-center gap-2 text-sm transition"
      >
        <LogOut size={14} /> Sign out of all devices
      </button>
    </div>
  );
}

const Info = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
  <div className="glass rounded-xl p-3 border border-white/5">
    <div className="font-mono text-[10px] uppercase tracking-wider text-white/40 inline-flex items-center gap-1.5">
      {icon} {label}
    </div>
    <div className="mt-1 text-sm font-medium">{value}</div>
  </div>
);
