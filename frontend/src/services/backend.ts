// Client for the WildGuard Python backend (backend/server.py).
//
// Converts the backend's JSON (snake_case, 0–1 confidences, epoch seconds)
// into the shapes the dashboard already uses (types/index.ts), so existing
// components render live data without knowing where it came from.
import type {
  ActivityEvent,
  Alert,
  Analysis,
  BackendHealth,
  Camera,
  Detection,
  Lighting,
  ServerSettings,
  ThreatLevel,
  User,
  VideoSource,
} from '../types';
import { apiFetch, apiUpload, mediaUrl } from './api';

// ---------------------------------------------------------------------------
// Raw backend payloads
// ---------------------------------------------------------------------------

export interface RawCamera {
  id: string;
  name: string;
  source: string;
  source_type: 'file' | 'webcam' | 'stream';
  location: { name: string; lat: number | null; lng: number | null } | null;
  enabled: boolean;
  status: 'online' | 'connecting' | 'offline' | 'paused';
  fps: number;
  inference_ms: number;
  lighting: Lighting;
  active_tracks: number;
  resolution: [number, number] | null;
  last_frame_at: number | null;
  stream_url: string;
  snapshot_url: string;
}

export interface RawDetection {
  id: string;
  camera_id: string;
  camera_name: string;
  species: string;
  confidence: number;
  threat_level: 'HIGH' | 'MEDIUM' | 'LOW';
  bbox: { x: number; y: number; w: number; h: number };
  timestamp: number;
  lighting: string;
  night: boolean;
}

export interface RawAlert {
  id: number;
  animal: string;
  confidence: number;
  timestamp: number;
  camera_id: string;
  camera_name: string;
  location: { name: string; lat: number | null; lng: number | null } | null;
  threat_level: 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'active' | 'acknowledged' | 'resolved';
  email_sent: boolean;
  snapshot_url: string | null;
}

export interface RawActivity {
  id: string;
  type: ActivityEvent['type'];
  message: string;
  level: ActivityEvent['level'];
  timestamp: number;
}

export interface RawDeterrence {
  siren: boolean;
  lights: boolean;
  sound: boolean;
  mode: 'auto' | 'manual';
  activated_at: number | null;
  last_trigger?: { level: string; label: string; camera: string; at: number } | null;
}

export interface AuthConfig {
  delivery: 'sms' | 'console';
  provider: string;
  demo_code_enabled: boolean;
  default_country_code: string;
  registered_numbers_only: boolean;
  otp_length: number;
  expires_seconds: number;
  resend_seconds: number;
}

export interface OtpSent {
  sent: boolean;
  phone: string;
  masked_phone: string;
  delivery: 'sms' | 'console';
  provider: string;
  demo_code_enabled: boolean;
  expires_in: number;
  resend_in: number;
}

export interface Bootstrap {
  health: BackendHealth;
  cameras: RawCamera[];
  alerts: RawAlert[];
  detections: RawDetection[];
  activity: RawActivity[];
  deterrence: RawDeterrence;
  settings: ServerSettings;
  analyses: Analysis[];
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

export const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const iso = (epoch: number | null | undefined) => (epoch ? new Date(epoch * 1000).toISOString() : null);
const threat = (t: string) => t.toLowerCase() as ThreatLevel;
const pct = (c: number) => Math.round(c * 100);

const NO_SNAPSHOT =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200"><rect width="320" height="200" fill="#101613"/>` +
      `<g stroke="#1C2722">${Array.from({ length: 9 }, (_, i) => `<line x1="${i * 40}" y1="0" x2="${i * 40}" y2="200"/>`).join('')}</g>` +
      `<text x="160" y="106" fill="#34D399" fill-opacity=".6" font-family="monospace" font-size="13" text-anchor="middle">NO SNAPSHOT</text></svg>`
  );

const toLocation = (loc: RawCamera['location'], fallbackName: string) => ({
  name: loc?.name || fallbackName,
  lat: loc?.lat ?? Number.NaN,
  lng: loc?.lng ?? Number.NaN,
});

export function mapCamera(c: RawCamera): Camera {
  return {
    id: c.id,
    name: c.name,
    location: toLocation(c.location, c.name),
    status: c.status === 'online' ? 'online' : c.status === 'paused' ? 'maintenance' : 'offline',
    imageUrl: mediaUrl(c.snapshot_url),
    live: true,
    streamUrl: mediaUrl(c.stream_url),
    snapshotUrl: mediaUrl(c.snapshot_url),
    source: c.source,
    sourceType: c.source_type,
    enabled: c.enabled,
    state: c.status,
    fps: c.fps,
    inferenceMs: c.inference_ms,
    lighting: c.lighting,
    activeTracks: c.active_tracks,
    resolution: c.resolution,
    lastFrameAt: iso(c.last_frame_at),
  };
}

export function mapDetection(d: RawDetection): Detection {
  return {
    id: d.id,
    cameraId: d.camera_id,
    cameraName: d.camera_name,
    species: titleCase(d.species),
    confidence: pct(d.confidence),
    threatLevel: threat(d.threat_level),
    bbox: d.bbox,
    timestamp: iso(d.timestamp)!,
    night: d.night,
  };
}

export function mapAlert(a: RawAlert): Alert {
  const animal = titleCase(a.animal);
  const location = toLocation(a.location, a.camera_name);
  return {
    id: `ALT-${a.id}`,
    backendId: a.id,
    animal,
    threatLevel: threat(a.threat_level),
    cameraId: a.camera_id,
    cameraName: a.camera_name,
    location,
    confidence: pct(a.confidence),
    timestamp: iso(a.timestamp)!,
    status: a.status,
    message: `${animal} detected near ${location.name}`,
    imageUrl: a.snapshot_url ? mediaUrl(a.snapshot_url) : NO_SNAPSHOT,
    emailSent: a.email_sent,
  };
}

export function mapActivity(e: RawActivity): ActivityEvent {
  return { id: e.id, type: e.type, message: e.message, level: e.level, timestamp: iso(e.timestamp)! };
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const backend = {
  health: (timeoutMs = 3000) => apiFetch<BackendHealth>('/api/health', { timeoutMs }),
  bootstrap: () => apiFetch<Bootstrap>('/api/bootstrap', { timeoutMs: 10000 }),

  // Auth
  authConfig: () => apiFetch<AuthConfig>('/api/auth/config', { timeoutMs: 3000 }),
  sendOtp: (phone: string) =>
    apiFetch<OtpSent>('/api/auth/send-otp', { ...json('POST', { phone }), timeoutMs: 20000 }),
  verifyOtp: (phone: string, otp: string) =>
    apiFetch<{ token: string; user: User; expires_at: number }>('/api/auth/verify-otp', {
      ...json('POST', { phone, otp }),
      timeoutMs: 20000,
    }),
  logout: () => apiFetch<{ ok: boolean }>('/api/auth/logout', { ...json('POST'), timeoutMs: 3000 }),

  // Cameras
  sources: () => apiFetch<VideoSource[]>('/api/sources'),
  addCamera: (body: { name: string; source: string; location: { name: string; lat?: number; lng?: number } }) =>
    apiFetch<RawCamera>('/api/cameras', json('POST', body)),
  updateCamera: (id: string, patch: Record<string, unknown>) =>
    apiFetch<RawCamera>(`/api/cameras/${id}`, json('PATCH', patch)),
  deleteCamera: (id: string) => apiFetch<void>(`/api/cameras/${id}`, json('DELETE')),

  // Alerts
  alertAction: (id: number, action: 'acknowledge' | 'resolve' | 'reopen') =>
    apiFetch<RawAlert>(`/api/alerts/${id}/${action}`, json('POST')),
  /** Without ids: every open alert. */
  bulkAlerts: (action: 'acknowledge' | 'resolve', ids?: number[]) =>
    apiFetch<{ updated: number; status: string }>('/api/alerts/bulk', json('POST', { action, ids })),

  // Deterrence
  setDeterrence: (patch: Partial<RawDeterrence>) => apiFetch<RawDeterrence>('/api/deterrence', json('POST', patch)),
  broadcast: (type: string) => apiFetch<unknown>('/api/broadcasts', json('POST', { type })),

  // Settings
  updateSettings: (patch: Partial<ServerSettings>) => apiFetch<ServerSettings>('/api/settings', json('PUT', patch)),

  // Media analysis
  analyses: () => apiFetch<Analysis[]>('/api/analyses'),
  analysis: (id: string) => apiFetch<Analysis>(`/api/analyses/${id}`),
  deleteAnalysis: (id: string) => apiFetch<void>(`/api/analyses/${id}`, json('DELETE')),
  cancelAnalysis: (id: string) => apiFetch<Analysis>(`/api/analyses/${id}/cancel`, json('POST')),
  analyze: (file: File, options: Record<string, string>, onProgress?: (f: number) => void) => {
    const form = new FormData();
    form.append('file', file);
    Object.entries(options).forEach(([k, v]) => form.append(k, v));
    return apiUpload<Analysis>('/api/analyze', form, onProgress);
  },
};

// ---------------------------------------------------------------------------
// Live events (Server-Sent Events)
// ---------------------------------------------------------------------------

export interface EventHandlers {
  open?: () => void;
  error?: () => void;
  hello?: (d: { server_time: number; version: string }) => void;
  cameras?: (d: RawCamera[]) => void;
  detection?: (d: RawDetection) => void;
  alert?: (d: RawAlert) => void;
  alert_update?: (d: RawAlert) => void;
  activity?: (d: RawActivity) => void;
  deterrence?: (d: RawDeterrence) => void;
  settings?: (d: ServerSettings) => void;
  analysis?: (d: Analysis) => void;
}

const EVENT_TYPES = [
  'hello', 'cameras', 'detection', 'alert', 'alert_update', 'activity', 'deterrence', 'settings', 'analysis',
] as const;

/** Subscribe to /api/events. Returns a function that closes the stream. */
export function openEventStream(handlers: EventHandlers): () => void {
  const source = new EventSource(mediaUrl('/api/events'));
  source.onopen = () => handlers.open?.();
  source.onerror = () => handlers.error?.();
  for (const type of EVENT_TYPES) {
    source.addEventListener(type, (e) => {
      const handler = handlers[type] as ((d: unknown) => void) | undefined;
      if (!handler) return;
      try {
        handler(JSON.parse((e as MessageEvent).data));
      } catch (err) {
        console.error(`[WildGuard] bad ${type} event`, err);
      }
    });
  }
  return () => source.close();
}
