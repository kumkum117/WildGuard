// @ts-nocheck
import { useDetectionStore } from '../../store/detectionStore';
import CameraFeed from './CameraFeed';

export default function DetectionMonitor() {
  const cameras = useDetectionStore((s) => s.cameras);

  return (
    <div data-testid="detection-monitor" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
      {cameras.map((c) => (
        // Browsers keep ~6 connections per host: stream up to 3 feeds, poll the rest.
        <CameraFeed key={c.id} cameraId={c.id} mode={cameras.length <= 3 ? 'stream' : 'poll'} />
      ))}
    </div>
  );
}
