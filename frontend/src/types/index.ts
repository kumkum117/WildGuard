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
