// @ts-nocheck
// Internal settings layout — kept for completeness per file structure.
// The actual route page is in /pages/SettingsPage.tsx which composes these.
import NotificationSettings from './NotificationSettings';
import CameraManagement from './CameraManagement';
import AccountSettings from './AccountSettings';

export default function SettingsPageInner() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
      <div className="lg:col-span-2 space-y-4">
        <NotificationSettings />
        <CameraManagement />
      </div>
      <div className="space-y-4">
        <AccountSettings />
      </div>
    </div>
  );
}
