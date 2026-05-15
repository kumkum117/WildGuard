// @ts-nocheck
import { create } from 'zustand';
import type { Camera, Detection, ThreatState } from '../types';

interface DetectionState {
  cameras: Camera[];
  detections: Detection[];
  threatState: ThreatState;
  setCameras: (c: Camera[]) => void;
  addDetection: (d: Detection) => void;
  setThreatState: (s: ThreatState) => void;
}

export const useDetectionStore = create<DetectionState>((set) => ({
  cameras: [],
  detections: [],
  threatState: 'safe',
  setCameras: (cameras) => set({ cameras }),
  addDetection: (d) => set((s) => ({ detections: [d, ...s.detections].slice(0, 100) })),
  setThreatState: (threatState) => set({ threatState }),
}));
