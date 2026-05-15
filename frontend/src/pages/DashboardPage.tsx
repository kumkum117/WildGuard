import { motion } from 'framer-motion';
import LiveCameraPanel from '../components/Dashboard/LiveCameraPanel';
import StatusIndicator from '../components/Dashboard/StatusIndicator';
import QuickStats from '../components/Dashboard/QuickStats';
import RecentAlerts from '../components/Dashboard/RecentAlerts';
import ActivityFeed from '../components/Dashboard/ActivityFeed';
import MapSection from '../components/Dashboard/MapSection';

export default function DashboardPage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="space-y-5 max-w-[1500px] mx-auto"
      data-testid="dashboard-page"
    >
      <QuickStats />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
        <div className="lg:col-span-2 space-y-5">
          <LiveCameraPanel />
          <MapSection />
        </div>
        <div className="space-y-5">
          <StatusIndicator />
          <ActivityFeed />
        </div>
      </div>

      <RecentAlerts />
    </motion.div>
  );
}