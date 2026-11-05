import { useEffect } from 'react';
import { socket } from '../services/socketService';
import {
  backend,
  mapActivity,
  mapAlert,
  mapCamera,
  mapDetection,
  openEventStream,
  titleCase,
  type RawCamera,
  type RawDeterrence,
  type RawDetection,
} from '../services/backend';
import { useAlertStore } from '../store/alertStore';
import { useDetectionStore } from '../store/detectionStore';
import { useActivityStore } from '../store/activityStore';
import { useDeterrenceStore } from '../store/deterrenceStore';
import { notify } from '../services/notify';
import { useConnectionStore } from '../store/connectionStore';
import { useAnalysisStore } from '../store/analysisStore';
import { generateActivity, generateAlert, generateCameras, generateDetection, seedActivity, seedAlerts } from '../utils/mockData';
import type { Analysis, Detection, ThreatState } from '../types';

const PROBE_TIMEOUT_MS = 2500;
const DEMO_RETRY_MS = 5000;      // while in demo mode, keep checking for a backend
const HEALTH_POLL_MS = 10000;

// Connects the dashboard to the WildGuard backend when one is reachable
// ("live" mode) and otherwise runs the built-in simulation ("demo" mode).
// A backend started later is picked up automatically.
export function useSocket(enabled: boolean) {
  const cameras = useDetectionStore((s) => s.cameras);
  const mode = useConnectionStore((s) => s.mode);

  useEffect(() => {
    const conn = useConnectionStore.getState();
    if (!enabled) {
      conn.setMode('connecting');
      return;
    }
    let cancelled = false;
    let timer: number | undefined;
    const probe = async () => {
      try {
        const health = await backend.health(PROBE_TIMEOUT_MS);
        if (cancelled) return;
        conn.setHealth(health);
        conn.setSettings(health.settings);
        conn.setMode('live');
      } catch {
        if (cancelled) return;
        if (useConnectionStore.getState().mode === 'connecting') conn.setMode('demo');
        timer = window.setTimeout(probe, DEMO_RETRY_MS);
      }
    };
    probe();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || mode !== 'demo') return;
    return startDemo();
  }, [enabled, mode]);

  useEffect(() => {
    if (!enabled || mode !== 'live') return;
    return startLive();
  }, [enabled, mode]);

  return cameras;
}

// ---------------------------------------------------------------------------
// Live mode — WildGuard backend
// ---------------------------------------------------------------------------

const THREAT_RANK: Record<ThreatState, number> = { safe: 0, monitoring: 1, detected: 2, alert: 3 };

// Repeats of the same thing (same animal on the same camera…) share a group
// key, so they update one notification / one toast instead of piling up.
const notifyDetection = (d: Detection) => {
  if (d.threatLevel === 'low') return;
  const high = d.threatLevel === 'high';
  notify(
    {
      kind: 'threat',
      level: high ? 'danger' : 'warning',
      title: `${d.species} ${high ? 'detected' : 'nearby'}`,
      message: `${d.cameraName ?? d.cameraId}${d.night ? ' · night vision' : ''} · ${d.confidence}% confidence`,
      groupKey: `threat:${d.cameraId}:${d.species}`,
      link: '/detection',
    },
    { toast: true }
  );
};

function startLive(): () => void {
  const conn = useConnectionStore.getState();
  let closed = false;
  let applyingRemote = false;
  let threatTimer: number | undefined;
  const cameraStatus = new Map<string, string>();
  const analysisStatus = new Map<string, string>();
  let deterrenceArmed = false;

  const applyDeterrence = (d: RawDeterrence) => {
    const armed = d.siren || d.lights;
    if (armed && !deterrenceArmed && d.last_trigger && Date.now() / 1000 - d.last_trigger.at < 10) {
      notify({
        kind: 'deterrence',
        level: d.last_trigger.level === 'HIGH' ? 'danger' : 'warning',
        title: d.siren ? 'Siren + lights activated' : 'Warning lights activated',
        message: `Auto response to ${d.last_trigger.label} at ${d.last_trigger.camera}`,
        groupKey: `deterrence:${d.last_trigger.camera}`,
        link: '/deterrence',
      });
    }
    deterrenceArmed = armed;
    applyingRemote = true;
    useDeterrenceStore.setState({
      siren: d.siren,
      lights: d.lights,
      sound: d.sound,
      mode: d.mode,
      activatedAt: d.activated_at ? new Date(d.activated_at * 1000).toISOString() : undefined,
    });
    applyingRemote = false;
  };

  const resync = async () => {
    try {
      const b = await backend.bootstrap();
      if (closed) return;
      conn.setHealth(b.health);
      conn.setSettings(b.settings);
      useDetectionStore.setState({
        cameras: b.cameras.map(mapCamera),
        detections: b.detections.map(mapDetection),
        threatState: b.cameras.some((c) => c.status === 'online') ? 'monitoring' : 'safe',
      });
      useAlertStore.getState().setAlerts(b.alerts.map(mapAlert));
      useActivityStore.getState().setEvents(b.activity.map(mapActivity));
      useAnalysisStore.getState().setItems(b.analyses);
      b.cameras.forEach((c) => cameraStatus.set(c.id, c.status));
      b.analyses.forEach((a) => analysisStatus.set(a.id, a.status));
      deterrenceArmed = b.deterrence.siren || b.deterrence.lights;
      applyDeterrence(b.deterrence);
    } catch (err) {
      console.warn('[WildGuard] bootstrap failed', err);
    }
  };

  const onDetection = (raw: RawDetection) => {
    const det = mapDetection(raw);
    const store = useDetectionStore.getState();
    if (store.detections.some((d) => d.id === det.id)) return;
    store.addDetection(det);

    const next: ThreatState =
      det.threatLevel === 'high' ? 'alert' : det.threatLevel === 'medium' ? 'detected' : 'monitoring';
    if (THREAT_RANK[next] >= THREAT_RANK[store.threatState]) {
      store.setThreatState(next);
      if (next !== 'monitoring') {
        window.clearTimeout(threatTimer);
        threatTimer = window.setTimeout(
          () => useDetectionStore.getState().setThreatState('monitoring'),
          next === 'alert' ? 6000 : 4500
        );
      }
    }

    notifyDetection(det);
  };

  const onCameras = (list: RawCamera[]) => {
    for (const c of list) {
      const prev = cameraStatus.get(c.id);
      cameraStatus.set(c.id, c.status);
      if (!prev || prev === c.status) continue;
      if (c.status === 'offline') {
        notify(
          { kind: 'system', level: 'warning', title: `${c.id} lost signal`, message: `${c.name} stopped sending video`, groupKey: `camera:${c.id}`, link: '/detection' },
          { toast: true }
        );
      } else if (c.status === 'online' && prev === 'offline') {
        notify({ kind: 'system', level: 'success', title: `${c.id} back online`, message: `${c.name} is streaming again`, groupKey: `camera:${c.id}`, link: '/detection' });
      }
    }
    useDetectionStore.getState().setCameras(list.map(mapCamera));
  };

  const onAnalysis = (a: Analysis) => {
    const prev = analysisStatus.get(a.id);
    analysisStatus.set(a.id, a.status);
    useAnalysisStore.getState().upsert(a);
    if (prev === a.status || a.kind !== 'video') return;
    if (a.status === 'completed') {
      const species = a.species ?? [];
      notify(
        {
          kind: 'analysis',
          level: species.some((s) => s.threat_level === 'HIGH') ? 'danger' : 'success',
          title: `Video analysed: ${a.filename}`,
          message: species.length
            ? species.map((s) => `${titleCase(s.label)} ×${s.count}`).join(', ')
            : 'No animals found',
          groupKey: `analysis:${a.id}`,
          link: '/analyze',
        },
        { toast: true }
      );
    } else if (a.status === 'failed') {
      notify(
        { kind: 'analysis', level: 'warning', title: 'Video analysis failed', message: `${a.filename}: ${a.error ?? 'unknown error'}`, groupKey: `analysis:${a.id}`, link: '/analyze' },
        { toast: true }
      );
    }
  };

  const close = openEventStream({
    open: () => conn.setOnline(true),
    error: () => conn.setOnline(false),
    // Sent on every (re)connection — resync anything missed while offline.
    hello: () => resync(),
    cameras: onCameras,
    detection: onDetection,
    alert: (raw) => {
      const alert = mapAlert(raw);
      useAlertStore.getState().upsertAlert(alert);
      // The sighting already popped a toast; uploads have no live sighting.
      notify(
        {
          kind: 'alert',
          level: alert.threatLevel === 'high' ? 'danger' : 'warning',
          title: raw.camera_id === 'UPLOAD' ? `Alert from uploaded media: ${alert.animal}` : `Alert logged: ${alert.animal}`,
          message: `${alert.cameraName} · ${alert.confidence}% confidence`,
          groupKey: `alert:${alert.cameraId}:${alert.animal}`,
          link: '/alerts',
        },
        { toast: raw.camera_id === 'UPLOAD' }
      );
    },
    alert_update: (raw) => useAlertStore.getState().upsertAlert(mapAlert(raw)),
    activity: (raw) => {
      const ev = mapActivity(raw);
      const store = useActivityStore.getState();
      if (!store.events.some((e) => e.id === ev.id)) store.push(ev);
    },
    deterrence: applyDeterrence,
    settings: (s) => conn.setSettings(s),
    analysis: onAnalysis,
  });

  // Operator actions on the Deterrence page are written back to the backend.
  const unsubscribe = useDeterrenceStore.subscribe((s, prev) => {
    if (applyingRemote) return;
    const patch: Partial<RawDeterrence> = {};
    if (s.siren !== prev.siren) patch.siren = s.siren;
    if (s.lights !== prev.lights) patch.lights = s.lights;
    if (s.sound !== prev.sound) patch.sound = s.sound;
    if (s.mode !== prev.mode) patch.mode = s.mode;
    if (Object.keys(patch).length) backend.setDeterrence(patch).catch(() => {});
  });

  const poll = window.setInterval(() => {
    backend.health().then((h) => !closed && conn.setHealth(h)).catch(() => {});
  }, HEALTH_POLL_MS);

  return () => {
    closed = true;
    close();
    unsubscribe();
    window.clearInterval(poll);
    window.clearTimeout(threatTimer);
    conn.setOnline(false);
  };
}

// ---------------------------------------------------------------------------
// Demo mode — simulated feed (no backend reachable)
// ---------------------------------------------------------------------------

function startDemo(): () => void {
  const { setCameras, addDetection, setThreatState: setThreat } = useDetectionStore.getState();
  const { setAlerts, addAlert } = useAlertStore.getState();
  const { setEvents, push: pushEvent } = useActivityStore.getState();

  const cams = generateCameras();
  setCameras(cams);
  setAlerts(seedAlerts(cams, 8));
  setEvents(seedActivity(cams, 14));
  socket.connect();

  const tDetection = socket.scheduleInterval(() => {
    // Read deterrence state fresh each tick to avoid stale closure
    const { setSiren, setLights, mode } = useDeterrenceStore.getState();

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
      notifyDetection(det);
      if (mode === 'auto') {
        setLights(true);
        setSiren(true);
      }
      window.setTimeout(() => setThreat('monitoring'), 6000);
    } else if (det.threatLevel === 'medium') {
      setThreat('detected');
      notifyDetection(det);
      if (mode === 'auto') setLights(true);
      window.setTimeout(() => setThreat('monitoring'), 4500);
    } else {
      setThreat('monitoring');
    }
  }, 30000);

  const tActivity = socket.scheduleInterval(() => {
    pushEvent(generateActivity(cams, 'system'));
  }, 45000);

  return () => {
    window.clearInterval(tDetection);
    window.clearInterval(tActivity);
    socket.disconnect();
  };
}
