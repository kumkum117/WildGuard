// @ts-nocheck
import { useEffect } from 'react';
import { socket } from '../services/socketService';
import { useAlertStore } from '../store/alertStore';
import { useDetectionStore } from '../store/detectionStore';
import { useActivityStore } from '../store/activityStore';
import { generateActivity, generateAlert, generateCameras, generateDetection, seedActivity, seedAlerts } from '../utils/mockData';
import { useDeterrenceStore } from '../store/deterrenceStore';

// Boots the simulated socket and seeds initial data when authenticated.
export function useSocket(enabled: boolean) {
  const setCameras = useDetectionStore((s) => s.setCameras);
  const addDetection = useDetectionStore((s) => s.addDetection);
  const setThreat = useDetectionStore((s) => s.setThreatState);
  const cameras = useDetectionStore((s) => s.cameras);
  const setAlerts = useAlertStore((s) => s.setAlerts);
  const addAlert = useAlertStore((s) => s.addAlert);
  const setEvents = useActivityStore((s) => s.setEvents);
  const pushEvent = useActivityStore((s) => s.push);
  const setSiren = useDeterrenceStore((s) => s.setSiren);
  const setLights = useDeterrenceStore((s) => s.setLights);
  const mode = useDeterrenceStore((s) => s.mode);

  useEffect(() => {
    if (!enabled) return;
    const cams = generateCameras();
    setCameras(cams);
    setAlerts(seedAlerts(cams, 8));
    setEvents(seedActivity(cams, 14));
    socket.connect();

    const tDetection = socket.scheduleInterval(() => {
      const det = generateDetection(cams);
      addDetection(det);
      pushEvent({
        id: `EVT-${det.id}`,
        type: 'detection',
        message: `${det.species} detected on ${det.cameraId} — ${det.confidence}%`,
        level: det.threatLevel === 'high' ? 'danger' : det.threatLevel === 'medium' ? 'warning' : 'info',
        timestamp: det.timestamp,
      });
      if (det.threatLevel === 'high') {
        setThreat('alert');
        const a = generateAlert(cams);
        a.animal = det.species;
        a.confidence = det.confidence;
        addAlert(a);
        if (mode === 'auto') {
          setLights(true);
          setSiren(true);
        }
        window.setTimeout(() => setThreat('monitoring'), 6000);
      } else if (det.threatLevel === 'medium') {
        setThreat('detected');
        if (mode === 'auto') setLights(true);
        window.setTimeout(() => setThreat('monitoring'), 4500);
      } else {
        setThreat('monitoring');
      }
    }, 7000);

    const tActivity = socket.scheduleInterval(() => {
      pushEvent(generateActivity(cams, 'system'));
    }, 11000);

    return () => {
      window.clearInterval(tDetection);
      window.clearInterval(tActivity);
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return cameras;
}
