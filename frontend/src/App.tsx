// @ts-nocheck
import { Routes, Route, Navigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { useEffect } from 'react';
import { useSocket } from './hooks/useSocket';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import DetectionPage from './pages/DetectionPage';
import AlertsPage from './pages/AlertsPage';
import DeterrencePage from './pages/DeterrencePage';
import SettingsPage from './pages/SettingsPage';
import Sidebar from './components/Layout/Sidebar';
import Header from './components/Layout/Header';
import './App.css';

const RequireAuth = ({ children }: { children: React.ReactNode }) => {
  const isAuthed = useAuthStore((s) => s.isAuthenticated);
  return isAuthed ? <>{children}</> : <Navigate to="/login" replace />;
};

const Shell = ({ children }: { children: React.ReactNode }) => (
  <div className="app-shell flex">
    <Sidebar />
    <div className="flex-1 flex flex-col min-h-screen lg:ml-64">
      <Header />
      <main className="flex-1 px-4 sm:px-6 lg:px-10 py-6">{children}</main>
    </div>
  </div>
);

function App() {
  const location = useLocation();
  const isAuthed = useAuthStore((s) => s.isAuthenticated);
  // Boot socket simulation when authed
  useSocket(isAuthed);

  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <Shell>
                <DashboardPage />
              </Shell>
            </RequireAuth>
          }
        />
        <Route
          path="/detection"
          element={
            <RequireAuth>
              <Shell>
                <DetectionPage />
              </Shell>
            </RequireAuth>
          }
        />
        <Route
          path="/alerts"
          element={
            <RequireAuth>
              <Shell>
                <AlertsPage />
              </Shell>
            </RequireAuth>
          }
        />
        <Route
          path="/deterrence"
          element={
            <RequireAuth>
              <Shell>
                <DeterrencePage />
              </Shell>
            </RequireAuth>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireAuth>
              <Shell>
                <SettingsPage />
              </Shell>
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  );
}

export default App;
