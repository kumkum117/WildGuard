// @ts-nocheck
import { useLocation, useNavigate, NavLink } from 'react-router-dom';
import { Search, LogOut, Menu, X, LayoutDashboard, Radar, ShieldAlert, Siren, Settings as SettingsIcon, ScanSearch } from 'lucide-react';
import NotificationCenter from './NotificationCenter';
import ConnectionBadge from './ConnectionBadge';
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useAlertStore } from '../../store/alertStore';
import { useDetectionStore } from '../../store/detectionStore';
import { cn } from '../../utils/cn';
import { APP_NAME } from '../../utils/constants';

const titleMap: Record<string, string> = {
  '/': 'Dashboard',
  '/detection': 'Live Detection',
  '/alerts': 'Alerts',
  '/deterrence': 'Deterrence',
  '/analyze': 'Media Analysis',
  '/settings': 'Settings',
};

const mobileNav = [
  { to: '/', label: 'Dashboard', Icon: LayoutDashboard },
  { to: '/detection', label: 'Live Detection', Icon: Radar },
  { to: '/alerts', label: 'Alerts', Icon: ShieldAlert },
  { to: '/deterrence', label: 'Deterrence', Icon: Siren },
  { to: '/analyze', label: 'Media Analysis', Icon: ScanSearch },
  { to: '/settings', label: 'Settings', Icon: SettingsIcon },
];

const threatLabel: Record<string, string> = {
  safe: 'Safe',
  monitoring: 'Monitoring',
  detected: 'Detected',
  alert: 'ALERT',
};

export default function Header() {
  const loc = useLocation();
  const nav = useNavigate();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const search = useAlertStore((s) => s.search);
  const setSearch = useAlertStore((s) => s.setSearch);
  const threatState = useDetectionStore((s) => s.threatState);
  const title = titleMap[loc.pathname] || 'WildGuard';

  const onLogout = () => { logout(); nav('/login'); };

  return (
    <>
      <header
        data-testid="header"
        className="sticky top-0 z-20 h-14 flex items-center px-4 sm:px-6 lg:px-8 gap-4 bg-[#0C0D0C]/90 backdrop-blur-md border-b border-white/[0.06]"
      >
        {/* Left: mobile menu + page title */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            data-testid="mobile-menu-toggle"
            onClick={() => setMobileOpen(true)}
            className="lg:hidden h-8 w-8 grid place-items-center rounded-md bg-white/5 border border-white/10"
          >
            <Menu size={16} />
          </button>
          <h1 className="font-display text-[15px] font-semibold tracking-tight truncate text-white/90">
            {title}
          </h1>
        </div>

        {/* Center: search */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.07] w-56 lg:w-72">
          <Search size={13} className="text-white/30 shrink-0" />
          <input
            data-testid="header-search"
            className="bg-transparent outline-none text-[13px] placeholder-white/25 w-full"
            placeholder="Search alerts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => { if (loc.pathname !== '/alerts') nav('/alerts'); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && loc.pathname !== '/alerts') nav('/alerts'); }}
          />
          {search ? (
            <button onClick={() => setSearch('')} className="text-white/30 hover:text-white/70 transition shrink-0">
              <X size={12} />
            </button>
          ) : (
            <kbd className="font-mono text-[10px] px-1 py-0.5 rounded bg-white/5 border border-white/8 text-white/30 shrink-0">⌘K</kbd>
          )}
        </div>

        {/* Right: threat state + bells + user */}
        <div className="flex items-center gap-2">
          <ConnectionBadge />
          {/* Threat badge */}
          <div
            data-testid="threat-pill"
            className={cn(
              'hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono font-medium uppercase tracking-wider border',
              threatState === 'alert'
                ? 'bg-threat-500/10 border-threat-500/30 text-threat-400'
                : threatState === 'detected'
                ? 'bg-amber2-500/10 border-amber2-500/30 text-amber2-400'
                : 'bg-white/[0.03] border-white/[0.08] text-white/40'
            )}
          >
            <span className={cn(
              'h-1.5 w-1.5 rounded-full',
              threatState === 'alert' ? 'bg-threat-500 animate-blink'
              : threatState === 'detected' ? 'bg-amber2-500 animate-blink'
              : 'bg-moss-400'
            )} />
            {threatLabel[threatState]}
          </div>

          {/* Notification centre (grouped, unread badge) */}
          <NotificationCenter />

          {/* Divider */}
          <div className="hidden sm:block h-5 w-px bg-white/[0.08]" />

          {/* User */}
          <div className="hidden sm:flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-moss-500 to-moss-700 grid place-items-center text-[11px] font-semibold text-forest-900">
              {(user?.name || 'R')[0]}
            </div>
            <div className="hidden md:block">
              <div className="text-[12px] font-medium leading-tight text-white/80">{user?.name || 'Ranger'}</div>
              <div className="font-mono text-[9px] text-white/35 uppercase tracking-wider">{user?.role}</div>
            </div>
          </div>

          {/* Logout */}
          <button
            data-testid="logout-btn"
            onClick={onLogout}
            className="h-8 w-8 grid place-items-center rounded-md hover:bg-threat-500/10 hover:text-threat-400 transition text-white/30"
            title="Logout"
          >
            <LogOut size={14} />
          </button>
        </div>
      </header>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="lg:hidden fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          >
            <motion.aside
              initial={{ x: -260 }}
              animate={{ x: 0 }}
              exit={{ x: -260 }}
              transition={{ type: 'spring', stiffness: 340, damping: 30 }}
              className="absolute left-0 top-0 bottom-0 w-64 glass-strong border-r border-white/[0.07] p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5">
                <div className="font-display text-[14px] font-semibold">{APP_NAME}</div>
                <button
                  onClick={() => setMobileOpen(false)}
                  className="h-7 w-7 grid place-items-center rounded-md bg-white/5 text-white/50"
                >
                  <X size={14} />
                </button>
              </div>
              <nav className="flex flex-col gap-0.5">
                {mobileNav.map(({ to, label, Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium',
                        isActive ? 'bg-white/[0.07] text-white' : 'text-white/50 hover:bg-white/[0.04] hover:text-white/80'
                      )
                    }
                  >
                    <Icon size={15} />
                    {label}
                  </NavLink>
                ))}
              </nav>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
