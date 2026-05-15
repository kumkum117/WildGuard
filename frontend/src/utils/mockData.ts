import type { Alert, ActivityEvent, Camera, Detection } from '../types';
import { CAMERA_LOCATIONS, FOREST_IMAGES, SPECIES } from './constants';

const rand = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

let alertCounter = 0;
let activityCounter = 0;
let detectionCounter = 0;

export const generateCameras = (): Camera[] =>
  CAMERA_LOCATIONS.map((loc, i) => ({
    id: `CAM-${String(i + 1).padStart(2, '0')}`,
    name: `Camera ${i + 1} — ${loc.name}`,
    location: { ...loc },
    status: i === 4 ? 'maintenance' : 'online',
    imageUrl: FOREST_IMAGES[i % FOREST_IMAGES.length],
  }));

export const generateAlert = (cameras: Camera[]): Alert => {
  const species = rand(SPECIES);
  const cam = rand(cameras.filter((c) => c.status === 'online'));
  alertCounter += 1;
  return {
    id: `ALT-${Date.now()}-${alertCounter}`,
    animal: species.name,
    threatLevel: species.threat,
    cameraId: cam.id,
    cameraName: cam.name,
    location: cam.location,
    confidence: Math.floor(75 + Math.random() * 24),
    timestamp: new Date().toISOString(),
    status: 'active',
    message: `${species.name} detected near ${cam.location.name}`,
    imageUrl: cam.imageUrl,
  };
};

export const generateDetection = (cameras: Camera[]): Detection => {
  const species = rand(SPECIES);
  const cam = rand(cameras.filter((c) => c.status === 'online'));
  detectionCounter += 1;
  return {
    id: `DET-${Date.now()}-${detectionCounter}`,
    cameraId: cam.id,
    species: species.name,
    threatLevel: species.threat,
    confidence: Math.floor(70 + Math.random() * 29),
    bbox: {
      x: 0.15 + Math.random() * 0.4,
      y: 0.2 + Math.random() * 0.4,
      w: 0.18 + Math.random() * 0.18,
      h: 0.22 + Math.random() * 0.18,
    },
    timestamp: new Date().toISOString(),
  };
};

export const generateActivity = (
  cameras: Camera[],
  type?: ActivityEvent['type']
): ActivityEvent => {
  activityCounter += 1;
  const t = type || rand(['detection', 'alert', 'system', 'deterrence'] as ActivityEvent['type'][]);
  const cam = rand(cameras);
  const species = rand(SPECIES);
  const map: Record<ActivityEvent['type'], { message: string; level: ActivityEvent['level'] }> = {
    detection: {
      message: `Motion detected on ${cam.name}`,
      level: 'info',
    },
    alert: {
      message: `${species.name} detected with ${Math.floor(80 + Math.random() * 19)}% confidence`,
      level: species.threat === 'high' ? 'danger' : species.threat === 'medium' ? 'warning' : 'info',
    },
    system: {
      message: `${cam.name} heartbeat OK`,
      level: 'success',
    },
    deterrence: {
      message: `Deterrence module armed at ${cam.location.name}`,
      level: 'warning',
    },
    auth: {
      message: `Ranger session refreshed`,
      level: 'info',
    },
  };
  return {
    id: `EVT-${Date.now()}-${activityCounter}`,
    type: t,
    message: map[t].message,
    level: map[t].level,
    timestamp: new Date().toISOString(),
  };
};

export const seedAlerts = (cameras: Camera[], count = 8): Alert[] => {
  const out: Alert[] = [];
  for (let i = 0; i < count; i += 1) {
    const a = generateAlert(cameras);
    // back-date some
    a.timestamp = new Date(Date.now() - i * 1000 * 60 * (3 + Math.random() * 12)).toISOString();
    if (i > 4) a.status = rand(['acknowledged', 'resolved'] as const);
    out.push(a);
  }
  return out;
};

export const seedActivity = (cameras: Camera[], count = 14): ActivityEvent[] => {
  const out: ActivityEvent[] = [];
  for (let i = 0; i < count; i += 1) {
    const e = generateActivity(cameras);
    e.timestamp = new Date(Date.now() - i * 1000 * 45).toISOString();
    out.push(e);
  }
  return out;
};
