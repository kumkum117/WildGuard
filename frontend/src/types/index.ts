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
}

export interface Detection {
  id: string;
  cameraId: string;
  species: string;
  confidence: number;
  threatLevel: ThreatLevel;
  bbox: { x: number; y: number; w: number; h: number };
  timestamp: string;
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
}

export interface ActivityEvent {
  id: string;
  type: 'detection' | 'alert' | 'system' | 'deterrence' | 'auth';
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
