import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  BroadcastRecord,
  DeterrenceEpisode,
  DeterrenceServer,
  DeterrenceState,
  DeterrenceTrigger,
  LightMode,
  SirenPattern,
} from '../types';
import { backend } from '../services/backend';
import { isLive } from './connectionStore';
import { useToastStore } from './toastStore';

// Deterrence state. In live mode the server owns everything (outputs,
// countdown, escalation) and this store only mirrors it; actions call the
// API and roll back with an error toast if the controller can't be reached.
// In demo mode the same actions run a small local simulation.
//
// Audio playback is a per-device preference: muting one browser does not
// silence the siren for every other operator.

type Action = 'fire' | 'stop' | 'extend' | 'mode' | 'style' | 'test' | 'dismiss';

const WINDOW_S = 30;
const MANUAL_S = 30 * 60;

const idle: DeterrenceServer = {
  mode: 'auto',
  manual_until: null,
  siren: false,
  lights: false,
  sound: true,
  pattern: 'wail',
  light_mode: 'strobe',
  zones: [],
  engaged: false,
  source: null,
  engagement_started_at: null,
  disarm_at: null,
  window_s: WINDOW_S,
  max_engagement_s: 300,
  stage: null,
  step: null,
  steps_total: 0,
  next_step_at: null,
  profile: null,
  last_trigger: null,
  last_seen_at: null,
  suggestion: null,
  episode_id: null,
  hardware: { configured: false, ok: null, last_at: null, latency_ms: null, error: null },
  server_time: 0,
  stages: ['Warn', 'Repel', 'Alert village', 'Escalate'],
};

interface DeterrenceStoreState extends DeterrenceState {
  server: DeterrenceServer;
  /** server clock − browser clock, ms (countdowns use the server's deadlines). */
  clockOffset: number;
  pending: Partial<Record<Action, boolean>>;
  episodes: DeterrenceEpisode[];
  broadcasts: BroadcastRecord[];
  playHere: boolean;
  volume: number;

  applyServer: (s: DeterrenceServer) => void;
  setEpisodes: (e: DeterrenceEpisode[]) => void;
  upsertEpisode: (e: DeterrenceEpisode) => void;
  setBroadcasts: (b: BroadcastRecord[]) => void;
  upsertBroadcast: (b: BroadcastRecord) => void;
  fire: (opts: { siren?: boolean; lights?: boolean; pattern?: SirenPattern; light_mode?: LightMode; zones?: string[] }) => Promise<void>;
  stop: () => Promise<void>;
  extend: (seconds?: number) => Promise<void>;
  setMode: (mode: 'auto' | 'manual', extend?: boolean) => Promise<void>;
  setStyle: (style: { pattern?: SirenPattern; light_mode?: LightMode }) => Promise<void>;
  dismissSuggestion: () => Promise<void>;
  setPlayHere: (v: boolean) => void;
  setVolume: (v: number) => void;
  /** Demo mode: what the server would do for a simulated sighting. */
  simulateSighting: (t: DeterrenceTrigger, threat: 'high' | 'medium' | 'low') => void;
  reset: () => void;

  // Legacy setters (pre-console API), kept so older callers still work.
  setSiren: (v: boolean) => void;
  setLights: (v: boolean) => void;
  setSound: (v: boolean) => void;
  setCountdown: (n: number) => void;
}

const nowS = () => (Date.now() + useDeterrenceStore.getState().clockOffset) / 1000;

/** Mirror server fields onto the legacy top-level fields components already read. */
const legacy = (s: DeterrenceServer): Partial<DeterrenceStoreState> => ({
  server: s,
  siren: s.siren,
  lights: s.lights,
  sound: s.sound,
  mode: s.mode,
  activatedAt: s.activated_at ? new Date(s.activated_at * 1000).toISOString() : undefined,
});

// ---- demo-mode simulation -------------------------------------------------

let demoTimer: number | undefined;
let demoEpisode: DeterrenceEpisode | null = null;

function demoSchedule() {
  window.clearTimeout(demoTimer);
  const s = useDeterrenceStore.getState().server;
  if (!s.engaged || !s.disarm_at) return;
  demoTimer = window.setTimeout(() => demoDisengage('animal-left'), Math.max(0, s.disarm_at * 1000 - Date.now()));
}

function demoDisengage(endedBy: string) {
  window.clearTimeout(demoTimer);
  const st = useDeterrenceStore.getState();
  if (demoEpisode) {
    const ended = Date.now() / 1000;
    const ep: DeterrenceEpisode = {
      ...demoEpisode,
      ended_at: ended,
      ended_by: endedBy,
      duration_s: Math.round(ended - demoEpisode.started_at),
      outcome: endedBy === 'operator' ? 'stopped' : 'repelled',
    };
    st.upsertEpisode(ep);
    demoEpisode = null;
  }
  st.applyServer({
    ...st.server,
    siren: false,
    lights: false,
    engaged: false,
    source: null,
    engagement_started_at: null,
    disarm_at: null,
    stage: null,
    step: null,
    steps_total: 0,
    next_step_at: null,
    zones: [],
    episode_id: null,
    server_time: Date.now() / 1000,
  });
}

function demoEngage(patch: Partial<DeterrenceServer>, source: 'auto' | 'operator', trigger: DeterrenceTrigger | null) {
  const st = useDeterrenceStore.getState();
  const t = Date.now() / 1000;
  const wasEngaged = st.server.engaged;
  if (!wasEngaged) {
    demoEpisode = {
      id: `DTR-demo-${Date.now()}`,
      started_at: t,
      ended_at: null,
      source,
      actor: source === 'auto' ? 'Auto' : 'Operator',
      trigger,
      max_stage: patch.stage ?? 1,
      patterns: patch.siren ? [patch.pattern ?? st.server.pattern] : [],
      extensions: 0,
      ended_by: null,
      duration_s: null,
      outcome: 'active',
      returned_after_s: null,
    };
    st.upsertEpisode(demoEpisode);
  }
  st.applyServer({
    ...st.server,
    ...patch,
    engaged: true,
    source: wasEngaged ? st.server.source : source,
    engagement_started_at: wasEngaged ? st.server.engagement_started_at : t,
    activated_at: wasEngaged ? st.server.activated_at : t,
    disarm_at: Math.max(st.server.disarm_at ?? 0, t + WINDOW_S),
    last_trigger: trigger ?? st.server.last_trigger,
    episode_id: demoEpisode?.id ?? st.server.episode_id,
    server_time: t,
  } as DeterrenceServer);
  demoSchedule();
}

// ---- store ------------------------------------------------------------------

async function run(action: Action, call: () => Promise<DeterrenceServer | void>, demo: () => void, failMsg: string) {
  const store = useDeterrenceStore;
  if (!isLive()) {
    demo();
    return;
  }
  const before = store.getState().server;
  store.setState((s) => ({ pending: { ...s.pending, [action]: true } }));
  try {
    const result = await call();
    if (result) store.getState().applyServer(result);
  } catch (err) {
    store.getState().applyServer(before);
    useToastStore.getState().push({
      key: `deterrence-error-${action}`,
      title: 'Deterrence controller unreachable',
      message: `${failMsg} — ${(err as Error).message}`,
      level: 'danger',
      duration: 7000,
    });
  } finally {
    store.setState((s) => ({ pending: { ...s.pending, [action]: false } }));
  }
}

export const useDeterrenceStore = create<DeterrenceStoreState>()(
  persist(
    (set, get) => ({
      ...legacy(idle),
      siren: false,
      lights: false,
      sound: true,
      mode: 'auto',
      countdownSec: 0,
      server: idle,
      clockOffset: 0,
      pending: {},
      episodes: [],
      broadcasts: [],
      playHere: true,
      volume: 0.35,

      applyServer: (s) =>
        set({
          ...legacy(s),
          clockOffset: s.server_time ? s.server_time * 1000 - Date.now() : get().clockOffset,
        }),
      setEpisodes: (episodes) => set({ episodes }),
      upsertEpisode: (e) =>
        set((st) => {
          const rest = st.episodes.filter((x) => x.id !== e.id);
          return { episodes: [e, ...rest].sort((a, b) => b.started_at - a.started_at).slice(0, 50) };
        }),
      setBroadcasts: (broadcasts) => set({ broadcasts }),
      upsertBroadcast: (b) =>
        set((st) => ({ broadcasts: [b, ...st.broadcasts.filter((x) => x.id !== b.id)].slice(0, 30) })),

      fire: (opts) =>
        run(
          'fire',
          () => backend.fire(opts),
          () => {
            const s = get().server;
            const next = {
              siren: opts.siren ?? s.siren,
              lights: opts.lights ?? s.lights,
              pattern: opts.pattern ?? s.pattern,
              light_mode: opts.light_mode ?? s.light_mode,
              zones: opts.zones ?? (s.zones.length ? s.zones : ['*']),
              suggestion: null,
            };
            if (!next.siren && !next.lights) demoDisengage('operator');
            else demoEngage(next, 'operator', s.suggestion?.type === 'deter' ? get().server.last_trigger : null);
          },
          'Siren / lights not changed'
        ),
      stop: () => run('stop', () => backend.stopDeterrence(), () => demoDisengage('operator'), 'Could not stop'),
      extend: (seconds = 30) =>
        run(
          'extend',
          () => backend.extendDeterrence(seconds),
          () => {
            const s = get().server;
            if (!s.engaged) return;
            get().applyServer({ ...s, disarm_at: (s.disarm_at ?? nowS()) + seconds, server_time: Date.now() / 1000 });
            demoSchedule();
          },
          'Could not extend'
        ),
      setMode: (mode, extend = false) =>
        run(
          'mode',
          () => backend.setDeterrenceMode(mode, extend),
          () => {
            const s = get().server;
            const t = Date.now() / 1000;
            get().applyServer({
              ...s,
              mode: extend ? s.mode : mode,
              manual_until: extend ? (s.manual_until ?? t) + MANUAL_S : mode === 'manual' ? t + MANUAL_S : null,
              suggestion: null,
              server_time: t,
            });
          },
          'Mode not changed'
        ),
      setStyle: (style) =>
        run(
          'style',
          () => backend.setDeterrenceStyle(style),
          () => get().applyServer({ ...get().server, ...style, server_time: Date.now() / 1000 }),
          'Pattern not changed'
        ),
      dismissSuggestion: () =>
        run(
          'dismiss',
          () => backend.dismissSuggestion(),
          () => get().applyServer({ ...get().server, suggestion: null, server_time: Date.now() / 1000 }),
          'Suggestion not dismissed'
        ),
      setPlayHere: (playHere) => set({ playHere }),
      setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)) }),

      simulateSighting: (t, threat) => {
        const s = get().server;
        if (threat === 'low') return;
        if (s.mode === 'manual') {
          get().applyServer({
            ...s,
            last_trigger: t,
            suggestion: {
              type: 'deter',
              species: t.species,
              label: t.label,
              level: t.level,
              camera_id: t.camera_id,
              camera: t.camera,
              confidence: t.confidence,
              recommended: { lights: 'strobe', sound: threat === 'high' ? 'yelp' : null },
              expires_at: Date.now() / 1000 + 90,
            },
            server_time: Date.now() / 1000,
          });
          return;
        }
        const elephant = t.species === 'elephant';
        demoEngage(
          {
            lights: true,
            light_mode: elephant ? 'flood' : 'strobe',
            siren: threat === 'high' && !elephant,
            pattern: threat === 'high' ? 'yelp' : s.pattern,
            stage: threat === 'high' && !elephant ? 1 : 0,
            step: 0,
            steps_total: 4,
            zones: [t.camera_id],
          },
          'auto',
          t
        );
      },
      reset: () => {
        window.clearTimeout(demoTimer);
        demoEpisode = null;
        set({ ...legacy(idle), countdownSec: 0, pending: {}, episodes: [], broadcasts: [] });
      },

      setSiren: (v) => get().fire({ siren: v }),
      setLights: (v) => get().fire({ lights: v }),
      setSound: (v) => set({ playHere: v, sound: v }),
      setCountdown: (countdownSec) => set({ countdownSec }),
    }),
    {
      name: 'wg-deterrence-device',
      partialize: (s) => ({ playHere: s.playHere, volume: s.volume }),
    }
  )
);

/** Seconds left on the current engagement, using the server's clock. */
export const remainingSeconds = (s: DeterrenceServer, offsetMs: number, nowMs = Date.now()) =>
  s.engaged && s.disarm_at ? Math.max(0, s.disarm_at - (nowMs + offsetMs) / 1000) : 0;
