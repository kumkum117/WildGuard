// @ts-nocheck
import { useDetectionStore } from '../../store/detectionStore';
import CameraFeed from './CameraFeed';

export default function DetectionMonitor() {
  const cameras = useDetectionStore((s) => s.cameras);

  return (
    <div data-testid="detection-monitor" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
      {cameras.map((c) => (
        <CameraFeed key={c.id} cameraId={c.id} />
      ))}
    </div>
  );
}
