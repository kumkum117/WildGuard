// @ts-nocheck
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Radar, ShieldAlert, Siren, Settings, Leaf } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../../utils/cn';
import { APP_NAME } from '../../utils/constants';

const nav = [
  { to: '/', label: 'Dashboard', Icon: LayoutDashboard, testid: 'nav-dashboard' },
  { to: '/detection', label: 'Live Detection', Icon: Radar, testid: 'nav-detection' },
  { to: '/alerts', label: 'Alerts', Icon: ShieldAlert, testid: 'nav-alerts' },
  { to: '/deterrence', label: 'Deterrence', Icon: Siren, testid: 'nav-deterrence' },
  { to: '/settings', label: 'Settings', Icon: Settings, testid: 'nav-settings' },
];

export default function Sidebar() {
  const loc = useLocation();
  return (
    <aside
      data-testid="sidebar"
      className="hidden lg:flex fixed left-0 top-0 bottom-0 w-64 z-30 flex-col glass-strong border-r border-white/5"
    >
      <div className="px-6 pt-7 pb-8">
        <div className="flex items-center gap-3">
          <div className="relative h-10 w-10 rounded-xl bg-gradient-to-br from-moss-500 to-moss-700 grid place-items-center shadow-glow-safe">
            <Leaf size={20} className="text-forest-900" />
            <div className="absolute inset-0 rounded-xl ring-1 ring-white/10" />
          </div>
          <div>
            <div className="font-display text-[15px] font-semibold tracking-tight leading-tight">
              {APP_NAME}
            </div>
            <div className="font-mono text-[10px] text-moss-400/80 tracking-[0.18em] uppercase">
              Sentinel · v1.0
            </div>
          </div>
        </div>
      </div>

      <nav className="px-3 flex-1 flex flex-col gap-1">
        {nav.map(({ to, label, Icon, testid }) => {
          const active = loc.pathname === to;
          return (
            <NavLink
              key={to}
              to={to}
              data-testid={testid}
              className={cn(
                'relative group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors',
                active
                  ? 'text-moss-300 bg-moss-500/8'
                  : 'text-white/55 hover:text-white hover:bg-white/3'
              )}
            >
              {active && (
                <motion.span
                  layoutId="nav-pill"
                  className="absolute inset-0 rounded-xl bg-moss-500/10 ring-1 ring-moss-400/20"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
              <span className="relative flex items-center gap-3">
                <Icon size={17} />
                <span className="font-medium tracking-tight">{label}</span>
              </span>
            </NavLink>
          );
        })}
      </nav>

      <div className="px-5 pb-6">
        <div className="glass rounded-xl p-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-moss-400/80">
            System
          </div>
          <div className="mt-1.5 text-sm">All sensors operational</div>
          <div className="mt-3 h-1 rounded-full bg-white/6 overflow-hidden">
            <div className="h-full w-[92%] bg-gradient-to-r from-moss-400 to-moss-500" />
          </div>
          <div className="mt-1.5 font-mono text-[10px] text-white/45">92% uptime · 14d</div>
        </div>
      </div>
    </aside>
  );
}
