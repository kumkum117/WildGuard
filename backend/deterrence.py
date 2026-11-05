"""
Deterrence controller — sirens, warning lights and villager broadcasts.

The server owns all deterrence state and timing; every dashboard only
displays it. A sighting of a dangerous animal starts an *engagement*:

  * outputs follow a species-specific playbook (PROFILES): elephants get
    flood lights, then a bee-swarm buzz, and only later a siren (sudden loud
    noise can provoke a charge); big cats get strobe + yelp at once;
    livestock is ignored; lights and sirens do nothing for snakes, so those
    only notify;
  * while the animal stays in view (keep-alives from the camera workers) the
    engagement escalates one step every STEP_SECONDS: Warn → Repel →
    Alert village → Escalate to rangers, and the siren pattern rotates
    between steps to slow habituation;
  * when the animal has not been seen for WINDOW_SECONDS the outputs stop
    ("animal left"); an engagement never runs longer than
    MAX_ENGAGEMENT_SECONDS (habituation, disturbance to neighbours);
  * if the same animal comes back to the same camera within RETURN_WINDOW,
    the previous engagement is marked "returned" rather than "repelled".

Manual mode hands control to the ranger: sightings produce suggestions
instead of outputs, and auto mode resumes after 30 minutes so a forgotten
override never leaves the village unprotected overnight.

Physical outputs (relay board, ESP32, PA system…) are driven by POSTing every
change to DETERRENCE_WEBHOOK_URL. Without it the system runs browser-only:
the dashboards play the siren sound themselves.
"""

import itertools
import json
import os
import threading
import time
import urllib.request
from collections import deque

WINDOW_SECONDS = 30            # outputs stay on this long after the last sighting
STEP_SECONDS = 30              # time on one escalation step before the next
MAX_ENGAGEMENT_SECONDS = 300
MANUAL_OVERRIDE_SECONDS = 30 * 60
SUGGESTION_SECONDS = 90
RETURN_WINDOW_SECONDS = 10 * 60
SIGHTING_THROTTLE_SECONDS = 5
CAP_PAUSE_SECONDS = 5 * 60     # after the cap, that animal/camera is left alone (rangers were notified)

PATTERNS = ("wail", "yelp", "hilo", "pulse", "bee")
LIGHT_MODES = ("strobe", "flood")
STAGES = ("Warn", "Repel", "Alert village", "Escalate")


def _step(stage: int, lights: "str | None" = None, sound: "str | None" = None,
          village: "str | None" = None, ranger: bool = False) -> dict:
    return {"stage": stage, "lights": lights, "sound": sound, "village": village, "ranger": ranger}


_BIG_CAT = {
    "note": "Strobe and a yelp siren straight away, then warn villagers to keep livestock in.",
    "steps": [_step(1, "strobe", "yelp"), _step(1, "strobe", "wail"),
              _step(2, "strobe", "hilo", village="warning"), _step(3, "strobe", "hilo", ranger=True)],
}
_HEAVY_GRAZER = {
    "note": "Strobe first; add a siren only if it stays.",
    "steps": [_step(0, "strobe"), _step(1, "strobe", "pulse"), _step(1, "strobe", "wail"),
              _step(3, "strobe", "wail", ranger=True)],
}
_PACK = {
    "note": "Strobe and a yelp siren; escalate to rangers if it stays.",
    "steps": [_step(1, "strobe", "yelp"), _step(1, "strobe", "hilo"), _step(3, "strobe", "wail", ranger=True)],
}
_IGNORE = {"note": "Domestic or harmless animal — logged, no deterrence.", "ignore": True, "steps": []}

PROFILES = {
    "elephant": {
        "note": "Flood lights first, then a bee-swarm buzz (as in Indian Railways' Plan Bee) before any "
                "siren — sudden loud noise can provoke an elephant to charge.",
        "steps": [_step(0, "flood"), _step(1, "flood", "bee"), _step(1, "strobe", "hilo"),
                  _step(2, "strobe", "hilo", village="warning"), _step(3, "strobe", "hilo", ranger=True)],
    },
    "tiger": _BIG_CAT, "leopard": _BIG_CAT, "lion": _BIG_CAT, "cheetah": _BIG_CAT,
    "bear": {
        "note": "Siren and strobe together; bears usually retreat from noise and light.",
        "steps": [_step(1, "strobe", "wail"), _step(1, "strobe", "yelp"),
                  _step(2, "strobe", "hilo", village="warning"), _step(3, "strobe", "hilo", ranger=True)],
    },
    "wild boar": _HEAVY_GRAZER, "gaur": _HEAVY_GRAZER, "buffalo": _HEAVY_GRAZER,
    "rhinoceros": _HEAVY_GRAZER, "hippopotamus": _HEAVY_GRAZER,
    "wolf": _PACK, "hyena": _PACK, "jackal": _PACK, "crocodile": _PACK,
    "snake": {"note": "Lights and sirens do not deter snakes — rangers are notified instead.",
              "notify_only": True, "steps": []},
    **{s: _IGNORE for s in ("dog", "cow", "horse", "goat", "sheep", "cat", "bird")},
}
_FALLBACK = {"HIGH": _BIG_CAT, "MEDIUM": _HEAVY_GRAZER}

BROADCASTS = {
    "evacuation": {
        "title": "Village evacuation", "level": "danger",
        "template": "WildGuard EMERGENCY: {Animal} near {place} ({time}). Move away from the forest "
                    "edge now and follow ranger instructions.",
    },
    "warning": {
        "title": "Stay indoors", "level": "warning",
        "template": "WildGuard WARNING: {Animal} seen near {place} at {time}. Stay indoors and keep "
                    "livestock secured.",
    },
    "allclear": {
        "title": "All-clear", "level": "success",
        "template": "WildGuard ALL CLEAR: the {animal} near {place} has left ({time}). You may "
                    "resume normal activity.",
    },
}


def profile_for(species: str, level: str) -> "tuple[str, dict | None]":
    key = species.lower()
    if key in PROFILES:
        return key, PROFILES[key]
    return key, _FALLBACK.get(level)


class DeterrenceController:
    def __init__(self, bus) -> None:
        self.bus = bus
        self._lock = threading.RLock()
        self._ids = itertools.count(1)
        self.webhook = os.environ.get("DETERRENCE_WEBHOOK_URL", "").strip()
        self.state = {
            "mode": "auto",
            "manual_until": None,
            "siren": False,
            "lights": False,
            "sound": True,
            "pattern": "wail",
            "light_mode": "strobe",
            "zones": [],
            "engaged": False,
            "source": None,
            "engagement_started_at": None,
            "activated_at": None,
            "disarm_at": None,
            "window_s": WINDOW_SECONDS,
            "max_engagement_s": MAX_ENGAGEMENT_SECONDS,
            "stage": None,
            "step": None,
            "steps_total": 0,
            "next_step_at": None,
            "profile": None,
            "last_trigger": None,
            "last_seen_at": None,
            "suggestion": None,
            "episode_id": None,
            "hardware": {"configured": bool(self.webhook), "ok": None, "last_at": None,
                         "latency_ms": None, "error": None},
        }
        self.episodes: "deque[dict]" = deque(maxlen=100)
        self.broadcasts: "deque[dict]" = deque(maxlen=50)
        self._episode: "dict | None" = None
        self._steps: "list[dict]" = []
        self._last_sighting: "dict[tuple, float]" = {}
        self._paused_until: "dict[tuple, float]" = {}
        self._escalated = False

        # Wired by the server: SMS rangers on escalation / villagers on broadcast.
        self.on_escalate = None                  # callable(trigger: dict, reason: str)
        self.sms_sender = None                   # callable(text, on_done) or None
        self.sms_status = {"available": False, "recipients": 0, "reason": "No SMS gateway configured"}

        self._stop = threading.Event()
        threading.Thread(target=self._tick_loop, daemon=True, name="WildGuard-deterrence").start()

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------

    def get(self) -> dict:
        with self._lock:
            return self._snapshot()

    def _snapshot(self) -> dict:
        snap = json.loads(json.dumps(self.state))
        snap["server_time"] = time.time()
        snap["stages"] = list(STAGES)
        return snap

    def profiles(self) -> "list[dict]":
        out = []
        for species, p in PROFILES.items():
            out.append({"species": species, "note": p["note"], "ignore": bool(p.get("ignore")),
                        "notify_only": bool(p.get("notify_only")), "steps": p["steps"]})
        return out

    def history(self, limit: int = 30) -> "list[dict]":
        with self._lock:
            items = list(self.episodes)
            if self._episode:
                items.append(self._episode)
        return [dict(e) for e in reversed(items)][:limit]

    # ------------------------------------------------------------------
    # Sightings (called by camera workers for every stable sighting)
    # ------------------------------------------------------------------

    def on_sighting(self, species: str, level: str, camera_id: str, camera_name: str,
                    confidence: float) -> None:
        now = time.time()
        key = (camera_id, species)
        with self._lock:
            if now - self._last_sighting.get(key, 0.0) < SIGHTING_THROTTLE_SECONDS:
                return
            self._last_sighting[key] = now
            profile_key, profile = profile_for(species, level)
            if profile is None or profile.get("ignore"):
                return
            trigger = {"species": species, "label": species.title(), "level": level,
                       "camera_id": camera_id, "camera": camera_name,
                       "confidence": round(float(confidence), 3), "at": now}

            if profile.get("notify_only"):
                if now - self._last_sighting.get(("notify",) + key, 0.0) > RETURN_WINDOW_SECONDS:
                    self._last_sighting[("notify",) + key] = now
                    self._log(f"{trigger['label']} near {camera_name} — no deterrent works; rangers notified",
                              "warning")
                    self._escalate(trigger, "notify-only species")
                return

            self._mark_return(trigger)

            if self.state["mode"] == "manual":
                self._suggest(trigger, profile)
                self._publish()
                return

            if not self.state["engaged"] and now < self._paused_until.get(key, 0.0):
                return          # capped recently — repeating the same outputs only habituates it
            if not self.state["engaged"]:
                self._engage(trigger, profile_key, profile, source="auto", actor="Auto")
            else:
                self._keepalive(trigger, profile_key, profile, now)
            self._publish()

    def _engage(self, trigger: "dict | None", profile_key: "str | None", profile: "dict | None",
                source: str, actor: str) -> None:
        now = time.time()
        st = self.state
        st.update(engaged=True, source=source, engagement_started_at=now, activated_at=now,
                  disarm_at=now + WINDOW_SECONDS, suggestion=None)
        self._escalated = False
        self._steps = list(profile["steps"]) if profile else []
        if trigger:
            st.update(last_trigger=trigger, last_seen_at=trigger["at"], zones=[trigger["camera_id"]])
        st["profile"] = {"species": profile_key, "note": profile["note"]} if profile else None
        self._episode = {
            "id": f"DTR-{int(now * 1000)}-{next(self._ids)}",
            "started_at": now, "ended_at": None, "source": source, "actor": actor,
            "trigger": trigger, "max_stage": 0, "patterns": [], "extensions": 0,
            "ended_by": None, "duration_s": None, "outcome": "active", "returned_after_s": None,
        }
        st["episode_id"] = self._episode["id"]
        if self._steps:
            self._apply_step(0, now)
        else:
            st.update(stage=None, step=None, steps_total=0, next_step_at=None)
        what = f"{trigger['label']} at {trigger['camera']}" if trigger else "operator request"
        self._log(f"Deterrence engaged — {self._outputs_text()} for {what}",
                  "danger" if st["siren"] else "warning")
        self.bus.publish("deterrence_episode", dict(self._episode))
        self._hardware({"event": "outputs", "source": source})

    def _keepalive(self, trigger: dict, profile_key: str, profile: dict, now: float) -> None:
        st = self.state
        current = st["last_trigger"] or {}
        if trigger["camera_id"] not in st["zones"]:
            st["zones"] = st["zones"] + [trigger["camera_id"]]
        # A more dangerous animal takes over the engagement's playbook.
        if trigger["level"] == "HIGH" and current.get("level") != "HIGH" and st["source"] == "auto":
            self._steps = list(profile["steps"])
            st["profile"] = {"species": profile_key, "note": profile["note"]}
            self._log(f"Engagement re-targeted to {trigger['label']} at {trigger['camera']}", "danger")
            self._apply_step(0, now)
            if self._episode:
                self._episode["trigger"] = trigger
        if trigger["species"] == current.get("species") or trigger["level"] == "HIGH":
            st["last_trigger"] = trigger
        st["last_seen_at"] = now
        cap = st["engagement_started_at"] + MAX_ENGAGEMENT_SECONDS
        st["disarm_at"] = max(st["disarm_at"] or 0, min(now + WINDOW_SECONDS, cap))
        if (st["source"] == "auto" and self._steps and st["next_step_at"]
                and now >= st["next_step_at"] and st["step"] < len(self._steps) - 1):
            self._apply_step(st["step"] + 1, now)
            self._log(f"Escalated to “{STAGES[st['stage']]}” — {trigger['label']} still at "
                      f"{trigger['camera']} ({self._outputs_text()})", "danger")
            self._hardware({"event": "outputs", "source": "escalation"})

    def _apply_step(self, idx: int, now: float) -> None:
        st = self.state
        step = self._steps[idx]
        st["step"], st["steps_total"], st["stage"] = idx, len(self._steps), step["stage"]
        st["next_step_at"] = now + STEP_SECONDS if idx < len(self._steps) - 1 else None
        st["lights"] = step["lights"] is not None
        if step["lights"]:
            st["light_mode"] = step["lights"]
        st["siren"] = step["sound"] is not None
        if step["sound"]:
            st["pattern"] = step["sound"]
            if self._episode is not None and step["sound"] not in self._episode["patterns"]:
                self._episode["patterns"].append(step["sound"])
        if self._episode is not None:
            self._episode["max_stage"] = max(self._episode["max_stage"], step["stage"])
        if step["village"]:
            trigger = st["last_trigger"] or {}
            st["suggestion"] = {
                "type": "broadcast", "broadcast": step["village"],
                "species": trigger.get("species"), "label": trigger.get("label"),
                "camera_id": trigger.get("camera_id"), "camera": trigger.get("camera"),
                "message": self.render_broadcast(step["village"]),
                "expires_at": now + SUGGESTION_SECONDS,
            }
        if step["ranger"] and not self._escalated:
            self._escalated = True
            self._escalate(st["last_trigger"] or {}, "still present after escalation")

    def _suggest(self, trigger: dict, profile: dict) -> None:
        st = self.state
        current = st["suggestion"]
        now = time.time()
        if (current and current.get("type") == "deter" and current.get("species") == trigger["species"]
                and current.get("camera_id") == trigger["camera_id"]):
            current["expires_at"] = now + SUGGESTION_SECONDS
            current["confidence"] = trigger["confidence"]
            return
        first = next((s for s in profile["steps"] if s["lights"] or s["sound"]), None) or {}
        st["suggestion"] = {
            "type": "deter", "species": trigger["species"], "label": trigger["label"],
            "level": trigger["level"], "camera_id": trigger["camera_id"], "camera": trigger["camera"],
            "confidence": trigger["confidence"],
            "recommended": {"lights": first.get("lights"), "sound": first.get("sound")},
            "note": profile["note"], "expires_at": now + SUGGESTION_SECONDS,
        }
        st["last_trigger"] = trigger
        self._log(f"Manual mode: {trigger['label']} at {trigger['camera']} — deterrence suggested, "
                  "waiting for a ranger", "warning")

    def _mark_return(self, trigger: dict) -> None:
        if self.state["engaged"]:
            return
        for ep in reversed(self.episodes):
            t = ep.get("trigger") or {}
            if (ep["outcome"] == "repelled" and t.get("species") == trigger["species"]
                    and t.get("camera_id") == trigger["camera_id"]
                    and trigger["at"] - (ep["ended_at"] or 0) <= RETURN_WINDOW_SECONDS):
                ep["outcome"] = "returned"
                ep["returned_after_s"] = round(trigger["at"] - ep["ended_at"])
                self.bus.publish("deterrence_episode", dict(ep))
                break

    def _escalate(self, trigger: dict, reason: str) -> None:
        if self.on_escalate:
            try:
                self.on_escalate(dict(trigger), reason)
            except Exception as exc:
                print(f"[Deterrence] escalation hook failed — {exc}")

    # ------------------------------------------------------------------
    # Operator actions
    # ------------------------------------------------------------------

    def fire(self, siren: "bool | None" = None, lights: "bool | None" = None, pattern: "str | None" = None,
             light_mode: "str | None" = None, zones: "list[str] | None" = None, actor: str = "Operator") -> dict:
        with self._lock:
            st = self.state
            if pattern in PATTERNS:
                st["pattern"] = pattern
            if light_mode in LIGHT_MODES:
                st["light_mode"] = light_mode
            if siren is not None:
                st["siren"] = bool(siren)
            if lights is not None:
                st["lights"] = bool(lights)
            if zones is not None:
                st["zones"] = [str(z) for z in zones][:50] or ["*"]
            if not (st["siren"] or st["lights"]):
                if st["engaged"]:
                    self._disengage("operator", actor)
                self._publish()
                return self._snapshot()
            if not st["engaged"]:
                if not st["zones"]:
                    st["zones"] = ["*"]
                trigger = st["suggestion"] if st["suggestion"] and st["suggestion"].get("type") == "deter" else None
                self._engage(self._trigger_from(trigger), None, None, source="operator", actor=actor)
                st["siren"] = bool(siren) if siren is not None else st["siren"]
                st["lights"] = bool(lights) if lights is not None else st["lights"]
            else:
                st["disarm_at"] = max(st["disarm_at"] or 0, time.time() + WINDOW_SECONDS)
                self._hardware({"event": "outputs", "source": "operator"})
            if self._episode is not None and st["siren"] and st["pattern"] not in self._episode["patterns"]:
                self._episode["patterns"].append(st["pattern"])
            st["suggestion"] = None
            self._publish()
            return self._snapshot()

    def _trigger_from(self, suggestion: "dict | None") -> "dict | None":
        if not suggestion:
            return None
        return {k: suggestion.get(k) for k in ("species", "label", "level", "camera_id", "camera", "confidence")} | {
            "at": time.time()}

    def stop(self, actor: str = "Operator") -> dict:
        with self._lock:
            if self.state["engaged"]:
                self._disengage("operator", actor)
            else:
                self.state.update(siren=False, lights=False)
            self._publish()
            return self._snapshot()

    def extend(self, seconds: float = 30, actor: str = "Operator") -> dict:
        with self._lock:
            st = self.state
            if st["engaged"]:
                seconds = max(5.0, min(float(seconds), 300.0))
                st["disarm_at"] = min(max(st["disarm_at"] or time.time(), time.time()) + seconds,
                                      time.time() + MAX_ENGAGEMENT_SECONDS)
                if self._episode is not None:
                    self._episode["extensions"] += 1
                self._log(f"{actor} extended deterrence by {int(seconds)} s", "info")
                self._publish()
            return self._snapshot()

    def set_mode(self, mode: str, actor: str = "Operator", extend: bool = False) -> dict:
        with self._lock:
            st = self.state
            if extend and st["mode"] == "manual":
                st["manual_until"] = (st["manual_until"] or time.time()) + MANUAL_OVERRIDE_SECONDS
            elif mode in ("auto", "manual") and mode != st["mode"]:
                st["mode"] = mode
                st["manual_until"] = time.time() + MANUAL_OVERRIDE_SECONDS if mode == "manual" else None
                st["suggestion"] = None
                self._log(f"{actor} switched deterrence to {mode} mode"
                          + (" — auto resumes in 30 min" if mode == "manual" else ""), "info")
            self._publish()
            return self._snapshot()

    def set_style(self, pattern: "str | None" = None, light_mode: "str | None" = None) -> dict:
        with self._lock:
            if pattern in PATTERNS:
                self.state["pattern"] = pattern
            if light_mode in LIGHT_MODES:
                self.state["light_mode"] = light_mode
            if self.state["engaged"]:
                self._hardware({"event": "outputs", "source": "operator"})
            self._publish()
            return self._snapshot()

    def dismiss_suggestion(self) -> dict:
        with self._lock:
            self.state["suggestion"] = None
            self._publish()
            return self._snapshot()

    def set_sound(self, on: bool) -> dict:
        with self._lock:
            self.state["sound"] = bool(on)
            self._publish()
            return self._snapshot()

    def update(self, patch: dict, source: str = "operator") -> dict:
        """Backward-compatible POST /api/deterrence {siren, lights, mode, sound, pattern, light_mode}."""
        if patch.get("mode") in ("auto", "manual"):
            self.set_mode(patch["mode"])
        if "sound" in patch:
            self.set_sound(bool(patch["sound"]))
        if "pattern" in patch or "light_mode" in patch:
            self.set_style(patch.get("pattern"), patch.get("light_mode"))
        if "siren" in patch or "lights" in patch:
            return self.fire(siren=patch.get("siren"), lights=patch.get("lights"))
        return self.get()

    def test(self, output: str = "all", seconds: float = 3, pattern: "str | None" = None,
             actor: str = "Operator") -> dict:
        """Self-test: exercises the relay webhook without starting an engagement."""
        payload = {"event": "test", "siren": output in ("siren", "all"), "lights": output in ("lights", "all"),
                   "pattern": pattern if pattern in PATTERNS else self.state["pattern"],
                   "light_mode": self.state["light_mode"], "duration_s": max(1, min(int(seconds), 10)),
                   "zones": ["*"], "test": True}
        if not self.webhook:
            self._log(f"Self-test by {actor}: no relay configured — browser audio only", "info")
            return {"configured": False}
        self._log(f"Self-test by {actor}: pinging relay…", "info")
        self._hardware(payload, report=True)
        return {"configured": True}

    # ------------------------------------------------------------------
    # Villager broadcasts
    # ------------------------------------------------------------------

    def render_broadcast(self, kind: str) -> str:
        spec = BROADCASTS.get(kind)
        if not spec:
            return ""
        trigger = self.state.get("last_trigger") or {}
        animal = (trigger.get("species") or "wild animal").lower()
        return spec["template"].format(
            Animal=animal[:1].upper() + animal[1:], animal=animal,
            place=trigger.get("camera") or "the forest edge",
            time=time.strftime("%H:%M"),
        )

    def broadcast_info(self) -> dict:
        with self._lock:
            return {
                "templates": {k: {"title": v["title"], "level": v["level"], "message": self.render_broadcast(k)}
                              for k, v in BROADCASTS.items()},
                "channels": {
                    "dashboard": {"available": True},
                    "loudspeaker": {"available": bool(self.webhook),
                                    "reason": None if self.webhook else "Set DETERRENCE_WEBHOOK_URL to drive a PA system"},
                    "sms": dict(self.sms_status),
                },
                "history": [dict(b) for b in reversed(self.broadcasts)][:20],
            }

    def broadcast(self, kind: str, message: "str | None" = None, actor: str = "Operator") -> dict:
        spec = BROADCASTS.get(kind)
        if spec is None:
            raise ValueError("Unknown broadcast type")
        text = (message or "").strip()[:480] or self.render_broadcast(kind)
        record = {
            "id": f"BRC-{int(time.time() * 1000)}-{next(self._ids)}",
            "type": kind, "title": spec["title"], "level": spec["level"], "message": text,
            "timestamp": time.time(), "actor": actor,
            "channels": {"dashboard": "sent",
                         "loudspeaker": "sending" if self.webhook else "not configured",
                         "sms": "not configured"},
            "recipients": 0,
        }
        with self._lock:
            self.broadcasts.append(record)
            if self.state["suggestion"] and self.state["suggestion"].get("type") == "broadcast":
                self.state["suggestion"] = None
                self._publish()
        self._log(f'{actor} sent villager broadcast: "{spec["title"]}"', spec["level"])

        if self.webhook:
            def loudspeaker_done(ok: bool):
                record["channels"]["loudspeaker"] = "sent" if ok else "failed"
                self.bus.publish("broadcast", dict(record))
            self._hardware({"event": "broadcast", "type": kind, "message": text}, done=loudspeaker_done)

        if self.sms_sender and self.sms_status.get("available"):
            record["recipients"] = self.sms_status.get("recipients", 0)
            record["channels"]["sms"] = "sending"

            def sms_done(sent: int, failed: int, error: "str | None"):
                record["channels"]["sms"] = f"sent {sent}/{sent + failed}" if not failed else \
                    f"{failed} failed ({error})"
                self.bus.publish("broadcast", dict(record))

            self.sms_sender(text, sms_done)
        self.bus.publish("broadcast", dict(record))
        return dict(record)

    # ------------------------------------------------------------------
    # Internals (lock held)
    # ------------------------------------------------------------------

    def _outputs_text(self) -> str:
        st = self.state
        parts = []
        if st["siren"]:
            parts.append(f"siren ({st['pattern']})")
        if st["lights"]:
            parts.append(f"{st['light_mode']} lights")
        return " + ".join(parts) or "no outputs"

    def _disengage(self, ended_by: str, actor: str = "Auto") -> None:
        st = self.state
        now = time.time()
        if self._episode is not None:
            ep = self._episode
            ep.update(ended_at=now, ended_by=ended_by, duration_s=round(now - ep["started_at"], 1))
            ep["outcome"] = {"animal-left": "repelled", "operator": "stopped", "cap": "persisted",
                             "timer": "completed"}.get(ended_by, ended_by)
            if ended_by == "operator":
                ep["stopped_by"] = actor
            self.episodes.append(ep)
            self.bus.publish("deterrence_episode", dict(ep))
            self._episode = None
        st.update(siren=False, lights=False, engaged=False, source=None, engagement_started_at=None,
                  activated_at=None, disarm_at=None, stage=None, step=None, steps_total=0,
                  next_step_at=None, episode_id=None, zones=[])
        self._steps = []
        messages = {
            "animal-left": ("Deterrence stopped — animal has left", "success"),
            "operator": (f"Deterrence stopped by {actor}", "info"),
            "cap": ("Deterrence paused after 5 min to avoid habituation — animal still present, rangers notified",
                    "danger"),
            "timer": ("Deterrence timer finished", "info"),
        }
        text, level = messages.get(ended_by, (f"Deterrence stopped ({ended_by})", "info"))
        self._log(text, level)
        if ended_by == "cap":
            trigger = st.get("last_trigger") or {}
            if trigger.get("camera_id"):
                self._paused_until[(trigger["camera_id"], trigger.get("species"))] = now + CAP_PAUSE_SECONDS
            self._escalate(trigger, "still present after 5 minutes of deterrence")
        self._hardware({"event": "outputs", "source": ended_by})

    def _tick_loop(self) -> None:
        while not self._stop.wait(1.0):
            try:
                with self._lock:
                    if self._tick(time.time()):
                        self._publish()
            except Exception as exc:
                print(f"[Deterrence] tick failed — {exc}")

    def _tick(self, now: float) -> bool:
        st = self.state
        changed = False
        if st["engaged"] and st["disarm_at"] and now >= st["disarm_at"]:
            capped = st["engagement_started_at"] and now >= st["engagement_started_at"] + MAX_ENGAGEMENT_SECONDS - 1
            seen_recently = st["last_seen_at"] and now - st["last_seen_at"] < WINDOW_SECONDS - 1
            if st["source"] == "auto":
                self._disengage("cap" if capped and seen_recently else "animal-left")
            else:
                self._disengage("timer")
            changed = True
        if st["mode"] == "manual" and st["manual_until"] and now >= st["manual_until"]:
            st.update(mode="auto", manual_until=None, suggestion=None)
            self._log("Manual override expired — automatic deterrence resumed", "warning")
            changed = True
        if st["suggestion"] and now >= st["suggestion"]["expires_at"]:
            st["suggestion"] = None
            changed = True
        return changed

    def _publish(self) -> None:
        self.bus.publish("deterrence", self._snapshot())

    def _log(self, message: str, level: str) -> None:
        print(f"[Deterrence] {message}")
        self.bus.log("deterrence", message, level)

    def _hardware(self, payload: dict, report: bool = False, done=None) -> None:
        """POST state to the relay webhook on a background thread and record its health."""
        if not self.webhook:
            if done:
                done(False)
            return
        st = self.state
        body = {"siren": st["siren"], "lights": st["lights"], "pattern": st["pattern"],
                "light_mode": st["light_mode"], "zones": st["zones"] or ["*"],
                "duration_s": max(0, round((st["disarm_at"] or time.time()) - time.time())),
                "episode_id": st["episode_id"], **payload}

        def send():
            t0 = time.perf_counter()
            ok, error = False, None
            try:
                req = urllib.request.Request(self.webhook, data=json.dumps(body).encode(),
                                             headers={"Content-Type": "application/json"}, method="POST")
                urllib.request.urlopen(req, timeout=5).close()
                ok = True
            except Exception as exc:
                error = str(getattr(exc, "reason", exc))
                print(f"[Deterrence] Relay webhook failed — {error}")
            latency = round((time.perf_counter() - t0) * 1000)
            with self._lock:
                self.state["hardware"] = {"configured": True, "ok": ok, "last_at": time.time(),
                                          "latency_ms": latency if ok else None, "error": error}
                self._publish()
            if report:
                self._log(f"Self-test: relay {'OK' if ok else 'FAILED'}"
                          + (f" ({latency} ms)" if ok else f" — {error}"), "success" if ok else "warning")
            if done:
                done(ok)

        threading.Thread(target=send, daemon=True).start()

    def shutdown(self) -> None:
        self._stop.set()
