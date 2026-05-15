// @ts-nocheck
import { useLocation, useNavigate, NavLink } from 'react-router-dom';
import { Bell, Search, LogOut, Menu, X, LayoutDashboard, Radar, ShieldAlert, Siren, Settings as SettingsIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useAlertStore } from '../../store/alertStore';
import { useDetectionStore } from '../../store/detectionStore';
import { cn } from '../../utils/cn';

const titleMap: Record<string, string> = {
  '/': 'Operations Overview',
  '/detection': 'Live Detection Monitor',
  '/alerts': 'Alert Management',
  '/deterrence': 'Deterrence Control',
  '/settings': 'System Settings',
};

const mobileNav = [
  { to: '/', label: 'Dashboard', Icon: LayoutDashboard },
  { to: '/detection', label: 'Live Detection', Icon: Radar },
  { to: '/alerts', label: 'Alerts', Icon: ShieldAlert },
  { to: '/deterrence', label: 'Deterrence', Icon: Siren },
  { to: '/settings', label: 'Settings', Icon: SettingsIcon },
];

export default function Header() {
  const loc = useLocation();
  const nav = useNavigate();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const alerts = useAlertStore((s) => s.alerts);
  const threatState = useDetectionStore((s) => s.threatState);
  const activeCount = alerts.filter((a) => a.status === 'active').length;
  const title = titleMap[loc.pathname] || 'WildGuard';

  const onLogout = () => {
    logout();
    nav('/login');
  };

  return (
    <>
      <header
        data-testid="header"
        className="sticky top-0 z-20 backdrop-blur-xl bg-forest-900/60 border-b border-white/5"
      >
        <div className="px-4 sm:px-6 lg:px-10 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              data-testid="mobile-menu-toggle"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden h-9 w-9 grid place-items-center rounded-lg bg-white/5 border border-white/10"
            >
              <Menu size={18} />
            </button>
            <div className="min-w-0">
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-moss-400/80">
                WildGuard · Sentinel
              </div>
              <h1 className="font-display text-xl sm:text-2xl font-semibold tracking-tight truncate">
                {title}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden md:flex items-center gap-2 px-3 py-2 glass rounded-xl w-64">
              <Search size={15} className="text-white/40" />
              <input
                data-testid="header-search"
                className="bg-transparent outline-none text-sm placeholder-white/30 w-full"
                placeholder="Search cameras, species, locations…"
              />
              <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-white/40">
                ⌘K
              </kbd>
            </div>

            <div
              data-testid="threat-pill"
              className={cn(
                'pill border',
                threatState === 'alert'
                  ? 'bg-threat-500/15 border-threat-500/40 text-threat-400'
                  : threatState === 'detected'
                  ? 'bg-amber2-500/15 border-amber2-500/40 text-amber2-400'
                  : threatState === 'monitoring'
                  ? 'bg-moss-500/10 border-moss-500/30 text-moss-300'
                  : 'bg-moss-500/15 border-moss-500/40 text-moss-300'
              )}
            >
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  threatState === 'alert'
                    ? 'bg-threat-500 animate-blink'
                    : threatState === 'detected'
                    ? 'bg-amber2-500 animate-blink'
                    : 'bg-moss-400'
                )}
              />
              <span className="uppercase">{threatState}</span>
            </div>

            <button
              data-testid="alerts-bell"
              onClick={() => nav('/alerts')}
              className="relative h-10 w-10 grid place-items-center rounded-xl glass hover:bg-white/5 transition"
            >
              <Bell size={17} />
              {activeCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] grid place-items-center px-1 rounded-full bg-threat-500 text-white font-mono text-[10px] font-semibold">
                  {activeCount}
                </span>
              )}
            </button>

            <div className="hidden sm:flex items-center gap-3 pl-2">
              <div className="text-right hidden md:block">
                <div className="text-sm font-medium leading-tight">{user?.name || 'Ranger'}</div>
                <div className="font-mono text-[10px] text-white/40 uppercase tracking-wider">
                  {user?.role}
                </div>
              </div>
              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-moss-500 to-moss-700 grid place-items-center font-semibold">
                {(user?.name || 'R')[0]}
              </div>
            </div>

            <button
              data-testid="logout-btn"
              onClick={onLogout}
              className="h-10 w-10 grid place-items-center rounded-xl glass hover:bg-threat-500/10 hover:text-threat-400 transition"
              title="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          >
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              className="absolute left-0 top-0 bottom-0 w-72 glass-strong border-r border-white/10 p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <div className="font-display font-semibold">WildGuard AI</div>
                <button
                  onClick={() => setMobileOpen(false)}
                  className="h-8 w-8 grid place-items-center rounded-lg bg-white/5"
                >
                  <X size={16} />
                </button>
              </div>
              <nav className="flex flex-col gap-1">
                {mobileNav.map(({ to, label, Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 px-3 py-3 rounded-xl text-sm',
                        isActive ? 'bg-moss-500/10 text-moss-300' : 'text-white/60 hover:bg-white/5'
                      )
                    }
                  >
                    <Icon size={17} />
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
