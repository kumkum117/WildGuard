export type ThreatLevel = 'high' | 'medium' | 'low';

export type AlertStatus = 'active' | 'acknowledged' | 'resolved';

export interface GeoLocation {
  lat: number;
  lng: number;
  name: string;
}

export interface Camera {
  id: string;
  name: string;
  location: GeoLocation;
  status: 'online' | 'offline' | 'maintenance';
  imageUrl: string;
  // Present when the camera comes from the WildGuard backend (live mode).
  live?: boolean;
  streamUrl?: string;
  snapshotUrl?: string;
  source?: string;
  sourceType?: 'file' | 'webcam' | 'stream';
  enabled?: boolean;
  state?: 'online' | 'connecting' | 'offline' | 'paused';
  fps?: number;
  inferenceMs?: number;
  lighting?: Lighting;
  activeTracks?: number;
  resolution?: [number, number] | null;
  lastFrameAt?: string | null;
}

export interface Lighting {
  mode: 'day' | 'low_light' | 'infrared';
  is_night: boolean;
  brightness: number;
  saturation?: number;
}

export interface Detection {
  id: string;
  cameraId: string;
  species: string;
  confidence: number;
  threatLevel: ThreatLevel;
  bbox: { x: number; y: number; w: number; h: number };
  timestamp: string;
  cameraName?: string;
  night?: boolean;
}

export interface Alert {
  id: string;
  detectionId?: string;
  animal: string;
  threatLevel: ThreatLevel;
  cameraId: string;
  cameraName: string;
  location: GeoLocation;
  confidence: number;
  timestamp: string;
  status: AlertStatus;
  message?: string;
  imageUrl?: string;
  backendId?: number;
  emailSent?: boolean;
  /** Times this incident's animal was seen (live incidents). */
  sightings?: number;
  lastSeen?: string;
}

export interface ActivityEvent {
  id: string;
  type: 'detection' | 'alert' | 'system' | 'deterrence' | 'auth' | 'analysis';
  message: string;
  level: 'info' | 'success' | 'warning' | 'danger';
  timestamp: string;
}

export interface User {
  id: string;
  phone: string;
  name: string;
  role: 'ranger' | 'admin' | 'observer';
}

export type ThreatState = 'safe' | 'monitoring' | 'detected' | 'alert';

export interface DeterrenceState {
  siren: boolean;
  lights: boolean;
  sound: boolean;
  mode: 'auto' | 'manual';
  activatedAt?: string;
  countdownSec: number;
}

// ---------------------------------------------------------------------------
// WildGuard backend (live mode)
// ---------------------------------------------------------------------------

export type ConnectionMode = 'connecting' | 'live' | 'demo';

export interface ServerSettings {
  sensitivity: number;
  night_mode: 'auto' | 'on' | 'off';
  night_view: boolean;
  species_classifier: boolean;
  email_alerts: boolean;
  notifications: { push: boolean; sms: boolean; call: boolean };
  max_inference_fps: number;
  analysis_fps: number;
}

export interface BackendHealth {
  status: string;
  version: string;
  server_time: number;
  started_at: number;
  uptime_s: number;
  engine: {
    model: string;
    model_type: string;
    device: string;
    classifier: string | null;
    classifier_enabled: boolean;
    species: string[];
    inference_count: number;
    avg_inference_ms: number;
  };
  detection_threshold: number;
  cameras: { online: number; total: number };
  alerts: {
    today: number;
    email_configured: boolean;
    email_enabled: boolean;
    high_risk_animals: string[];
    confidence_threshold: number;
    cooldown_seconds: number;
  };
  settings: ServerSettings;
  sms?: { provider: string; delivery: 'sms' | 'console'; can_send_text: boolean; rangers: number; villagers: number };
}

export interface SpeciesScore {
  label: string;
  score: number;
}

export interface AnalysisDetection {
  label: string;
  confidence: number;
  threat_level: 'HIGH' | 'MEDIUM' | 'LOW';
  bbox: [number, number, number, number];
  bbox_norm: { x: number; y: number; w: number; h: number };
  detector_label: string;
  detector_confidence: number;
  species_scores: SpeciesScore[];
  verified: boolean;
}

export interface Sighting {
  track_id: number;
  label: string;
  threat_level: 'HIGH' | 'MEDIUM' | 'LOW';
  start_s: number;
  end_s: number;
  best_at_s?: number;
  confidence: number;
  max_confidence: number;
  labels_seen: string[];
  species_scores: SpeciesScore[];
  night: boolean;
  keyframe_url?: string;
}

export interface SpeciesSummary {
  label: string;
  threat_level: 'HIGH' | 'MEDIUM' | 'LOW';
  count: number;
  max_confidence: number;
  first_seen_s?: number;
  visible_s?: number;
}

export interface Analysis {
  id: string;
  kind: 'image' | 'video';
  filename: string;
  created_at: number;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  error?: string;
  progress?: number;
  eta_s?: number | null;
  live_species?: string[];
  live_sightings?: number;
  lighting?: Lighting & { night_ratio?: number; enhanced_ratio?: number; dominant?: string };
  enhanced?: boolean;
  width?: number;
  height?: number;
  inference_ms?: number;
  processing_ms?: number;
  video?: { fps: number; frames: number; width: number; height: number; duration_s: number | null };
  analysis?: { stride: number; analysed_frames: number; avg_inference_ms: number | null; processing_s: number; classifier: boolean };
  detections?: AnalysisDetection[];
  sightings?: Sighting[];
  species?: SpeciesSummary[];
  alerts_raised?: string[];
  urls: Record<string, string>;
  source_path?: string | null;
}

export interface VideoSource {
  path: string;
  name: string;
  group: string;
  size_mb: number;
}

// ---------------------------------------------------------------------------
// Deterrence (server-owned state, see backend/deterrence.py)
// ---------------------------------------------------------------------------

export type SirenPattern = 'wail' | 'yelp' | 'hilo' | 'pulse' | 'bee';
export type LightMode = 'strobe' | 'flood';

export interface DeterrenceTrigger {
  species: string;
  label: string;
  level: string;
  camera_id: string;
  camera: string;
  confidence: number;
  at: number;
}

export interface DeterrenceSuggestion {
  type: 'deter' | 'broadcast';
  species?: string;
  label?: string;
  level?: string;
  camera_id?: string;
  camera?: string;
  confidence?: number;
  recommended?: { lights: LightMode | null; sound: SirenPattern | null };
  broadcast?: string;
  message?: string;
  note?: string;
  expires_at: number;
}

export interface DeterrenceServer {
  mode: 'auto' | 'manual';
  manual_until: number | null;
  siren: boolean;
  lights: boolean;
  sound: boolean;
  pattern: SirenPattern;
  light_mode: LightMode;
  zones: string[];
  engaged: boolean;
  source: 'auto' | 'operator' | null;
  engagement_started_at: number | null;
  activated_at?: number | null;
  disarm_at: number | null;
  window_s: number;
  max_engagement_s: number;
  stage: number | null;
  step: number | null;
  steps_total: number;
  next_step_at: number | null;
  profile: { species: string | null; note: string } | null;
  last_trigger: DeterrenceTrigger | null;
  last_seen_at: number | null;
  suggestion: DeterrenceSuggestion | null;
  episode_id: string | null;
  hardware: { configured: boolean; ok: boolean | null; last_at: number | null; latency_ms: number | null; error: string | null };
  server_time: number;
  stages: string[];
}

export interface DeterrenceEpisode {
  id: string;
  started_at: number;
  ended_at: number | null;
  source: 'auto' | 'operator' | 'test';
  actor: string;
  trigger: DeterrenceTrigger | null;
  max_stage: number;
  patterns: string[];
  extensions: number;
  ended_by: string | null;
  duration_s: number | null;
  outcome: 'active' | 'repelled' | 'returned' | 'stopped' | 'persisted' | 'completed' | string;
  returned_after_s: number | null;
  stopped_by?: string;
}

export interface DeterrenceStep {
  stage: number;
  lights: LightMode | null;
  sound: SirenPattern | null;
  village: string | null;
  ranger: boolean;
}

export interface DeterrenceProfile {
  species: string;
  note: string;
  ignore: boolean;
  notify_only: boolean;
  steps: DeterrenceStep[];
}

export interface BroadcastRecord {
  id: string;
  type: string;
  title: string;
  level: 'danger' | 'warning' | 'success' | 'info';
  message: string;
  timestamp: number;
  actor: string;
  channels: Record<string, string>;
  recipients: number;
}

export interface BroadcastInfo {
  templates: Record<string, { title: string; level: 'danger' | 'warning' | 'success'; message: string }>;
  channels: {
    dashboard: { available: boolean };
    loudspeaker: { available: boolean; reason?: string | null };
    sms: { available: boolean; recipients: number; reason?: string | null; provider?: string };
  };
  history: BroadcastRecord[];
}
