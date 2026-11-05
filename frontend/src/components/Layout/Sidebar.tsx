// @ts-nocheck
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Radar, ShieldAlert, Siren, Settings, Leaf, Activity, ScanSearch, Server } from 'lucide-react';
import { useConnectionStore } from '../../store/connectionStore';
import { useDeterrenceStore } from '../../store/deterrenceStore';
import { openGroupCount } from '../../utils/alertGroups';
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../utils/cn';
import { APP_NAME } from '../../utils/constants';
import { useDetectionStore } from '../../store/detectionStore';
import { useAlertStore } from '../../store/alertStore';

const nav = [
  { to: '/', label: 'Dashboard', Icon: LayoutDashboard, testid: 'nav-dashboard' },
  { to: '/detection', label: 'Live Detection', Icon: Radar, testid: 'nav-detection' },
  { to: '/alerts', label: 'Alerts', Icon: ShieldAlert, testid: 'nav-alerts' },
  { to: '/deterrence', label: 'Deterrence', Icon: Siren, testid: 'nav-deterrence' },
  { to: '/analyze', label: 'Media Analysis', Icon: ScanSearch, testid: 'nav-analyze' },
];

const bottom = [
  { to: '/settings', label: 'Settings', Icon: Settings, testid: 'nav-settings' },
];

export default function Sidebar() {
  const loc = useLocation();
  const cameras = useDetectionStore((s) => s.cameras);
  const alerts = useAlertStore((s) => s.alerts);
  const threatState = useDetectionStore((s) => s.threatState);
  const online = cameras.filter((c) => c.status === 'online').length;
  // Open incidents, not raw rows: repeat alerts for one animal count once.
  const activeAlerts = useMemo(() => openGroupCount(alerts), [alerts]);
  const mode = useConnectionStore((s) => s.mode);
  const deterring = useDeterrenceStore((s) => s.server.engaged);
  const sirenOn = useDeterrenceStore((s) => s.server.siren);
  const linkUp = useConnectionStore((s) => s.online);
  const backendLabel = mode === 'live' ? (linkUp ? 'live' : 'offline') : mode === 'demo' ? 'demo' : '…';

  return (
    <aside
      data-testid="sidebar"
      className="hidden lg:flex fixed left-0 top-0 bottom-0 w-60 z-30 flex-col glass-strong border-r border-white/[0.06]"
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 h-14 border-b border-white/[0.06] shrink-0">
        <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-moss-400 to-moss-600 grid place-items-center shrink-0">
          <Leaf size={14} className="text-forest-900" />
        </div>
        <div className="min-w-0">
          <div className="font-display text-[13px] font-semibold tracking-tight leading-none truncate">
            {APP_NAME}
          </div>
          <div className="font-mono text-[9px] text-moss-500/70 tracking-widest uppercase mt-0.5">
            v1.0 · Sentinel
          </div>
        </div>
      </div>

      {/* Main nav */}
      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        <div className="px-2 pb-2 font-mono text-[9px] uppercase tracking-[0.22em] text-white/25">
          Navigation
        </div>
        {nav.map(({ to, label, Icon, testid }) => {
          const active = loc.pathname === to;
          return (
            <NavLink
              key={to}
              to={to}
              data-testid={testid}
              className={cn(
                'relative group flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors',
                active ? 'text-white bg-white/[0.07]' : 'text-white/45 hover:text-white/80 hover:bg-white/[0.04]'
              )}
            >
              {active && (
                <motion.span
                  layoutId="sidebar-indicator"
                  className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-moss-400"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <Icon size={15} className={active ? 'text-moss-400' : ''} />
              <span>{label}</span>
              {to === '/deterrence' && deterring && (
                <span className="ml-auto relative flex h-2 w-2">
                  <span className={cn('absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping', sirenOn ? 'bg-threat-500' : 'bg-amber2-500')} />
                  <span className={cn('relative inline-flex h-2 w-2 rounded-full', sirenOn ? 'bg-threat-500' : 'bg-amber2-500')} />
                </span>
              )}
              {to === '/alerts' && activeAlerts > 0 && (
                <span className="ml-auto font-mono text-[10px] px-1.5 py-0.5 rounded-md bg-threat-500/20 text-threat-400 border border-threat-500/25">
                  {activeAlerts > 99 ? '99+' : activeAlerts}
                </span>
              )}
            </NavLink>
          );
        })}
      </div>

      {/* Status strip */}
      <div className="px-3 py-3 border-t border-white/[0.06] space-y-1.5">
        <div
          className="flex items-center justify-between px-2.5 py-1.5 rounded-lg"
          title={mode === 'demo' ? 'Backend not reachable — showing simulated data' : 'WildGuard detection server'}
        >
          <div className="flex items-center gap-2 text-[12px] text-white/45">
            <Server size={12} />
            <span>Backend</span>
          </div>
          <span
            className={cn(
              'font-mono text-[11px] uppercase tracking-wide',
              backendLabel === 'live' ? 'text-moss-400' : backendLabel === 'offline' ? 'text-threat-400' : 'text-amber2-400'
            )}
          >
            {backendLabel}
          </span>
        </div>
        <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg">
          <div className="flex items-center gap-2 text-[12px] text-white/45">
            <Activity size={12} />
            <span>Cameras</span>
          </div>
          <span className="font-mono text-[11px] text-moss-400">{online}/{cameras.length}</span>
        </div>
        <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg">
          <div className="flex items-center gap-2 text-[12px] text-white/45">
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                threatState === 'alert' ? 'bg-threat-500 animate-blink'
                : threatState === 'detected' ? 'bg-amber2-500 animate-blink'
                : 'bg-moss-400'
              )}
            />
            <span>Threat state</span>
          </div>
          <span className={cn(
            'font-mono text-[11px] uppercase tracking-wide',
            threatState === 'alert' ? 'text-threat-400'
            : threatState === 'detected' ? 'text-amber2-400'
            : 'text-moss-400'
          )}>
            {threatState}
          </span>
        </div>
      </div>

      {/* Bottom nav */}
      <div className="px-3 pb-4 pt-1 border-t border-white/[0.06]">
        {bottom.map(({ to, label, Icon, testid }) => {
          const active = loc.pathname === to;
          return (
            <NavLink
              key={to}
              to={to}
              data-testid={testid}
              className={cn(
                'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors',
                active ? 'text-white bg-white/[0.07]' : 'text-white/40 hover:text-white/75 hover:bg-white/[0.04]'
              )}
            >
              <Icon size={15} className={active ? 'text-moss-400' : ''} />
              <span>{label}</span>
            </NavLink>
          );
        })}
      </div>
    </aside>
  );
}
