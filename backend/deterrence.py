"""
Deterrence controller — siren, warning lights and villager broadcasts.

Holds the authoritative deterrence state shared by every dashboard and
implements the response matrix shown on the Deterrence page:

    auto mode   HIGH threat   → siren + lights
                MEDIUM threat → lights only
                LOW threat    → monitor & log
    manual mode               → nothing fires automatically

Active outputs auto-disarm after AUTO_DISARM_SECONDS, matching the 30 s
countdown on the dashboard. Physical hardware (relay board, ESP32, PLC...)
can be driven by setting DETERRENCE_WEBHOOK_URL: every state change is POSTed
there as JSON. Without it the controller only logs, which is what the demo
setup needs.
"""

import json
import os
import threading
import time
import urllib.request

AUTO_DISARM_SECONDS = 30

BROADCASTS = {
    "evacuation": ("Village evacuation", "danger"),
    "warning": ("Stay indoors warning", "warning"),
    "allclear": ("All-clear broadcast", "success"),
}


class DeterrenceController:
    def __init__(self, bus) -> None:
        self.bus = bus
        self._lock = threading.Lock()
        self._timer: "threading.Timer | None" = None
        self.state = {
            "siren": False,
            "lights": False,
            "sound": True,
            "mode": "auto",
            "activated_at": None,
            "disarm_at": None,
            "last_trigger": None,
        }
        self.broadcasts: "list[dict]" = []
        self.webhook = os.environ.get("DETERRENCE_WEBHOOK_URL", "").strip()

    def get(self) -> dict:
        with self._lock:
            return dict(self.state)

    # ------------------------------------------------------------------

    def update(self, patch: dict, source: str = "operator") -> dict:
        with self._lock:
            before = dict(self.state)
            for key in ("siren", "lights", "sound"):
                if key in patch:
                    self.state[key] = bool(patch[key])
            if patch.get("mode") in ("auto", "manual"):
                self.state["mode"] = patch["mode"]
            changed = self._after_change(before, source)
            state = dict(self.state)
        if changed:
            self.bus.publish("deterrence", state)
        return state

    def on_threat(self, level: str, label: str, camera_name: str) -> None:
        """Called for every confirmed sighting; applies the auto response."""
        with self._lock:
            if self.state["mode"] != "auto" or level not in ("HIGH", "MEDIUM"):
                return
            before = dict(self.state)
            self.state["lights"] = True
            if level == "HIGH":
                self.state["siren"] = True
            self.state["last_trigger"] = {
                "level": level, "label": label, "camera": camera_name, "at": time.time(),
            }
            changed = self._after_change(before, "auto")
            outputs_changed = (self.state["siren"], self.state["lights"]) != (before["siren"], before["lights"])
            state = dict(self.state)
        if changed:
            self.bus.publish("deterrence", state)
        if outputs_changed:
            outputs = "siren + lights" if level == "HIGH" else "warning lights"
            self.bus.log("deterrence", f"Auto-deterrence: {outputs} for {label} at {camera_name}",
                         "danger" if level == "HIGH" else "warning")

    def broadcast(self, kind: str) -> dict:
        title, level = BROADCASTS.get(kind, (kind, "info"))
        record = {"type": kind, "title": title, "level": level, "timestamp": time.time()}
        self.broadcasts.insert(0, record)
        del self.broadcasts[50:]
        self.bus.log("deterrence", f'Villager alert broadcast: "{title}"', level)
        self._notify_hardware({"event": "broadcast", **record})
        return record

    def shutdown(self) -> None:
        with self._lock:
            if self._timer:
                self._timer.cancel()

    # ------------------------------------------------------------------
    # Internals (call with self._lock held)
    # ------------------------------------------------------------------

    def _after_change(self, before: dict, source: str) -> bool:
        armed = self.state["siren"] or self.state["lights"]
        was_armed = before["siren"] or before["lights"]
        # (Re)start the disarm countdown when outputs change, and on every
        # automatic trigger — an animal still in view keeps deterrence active.
        if armed and (source == "auto" or not was_armed or self.state["siren"] != before["siren"]
                      or self.state["lights"] != before["lights"]):
            self.state["activated_at"] = time.time()
            self.state["disarm_at"] = time.time() + AUTO_DISARM_SECONDS
            self._arm_timer()
        elif not armed:
            self.state["activated_at"] = None
            self.state["disarm_at"] = None
            if self._timer:
                self._timer.cancel()
                self._timer = None

        changed = any(self.state[k] != before[k] for k in self.state)
        if changed and (self.state["siren"] != before["siren"] or self.state["lights"] != before["lights"]):
            print(f"[Deterrence] siren={'ON' if self.state['siren'] else 'off'} "
                  f"lights={'ON' if self.state['lights'] else 'off'} ({source})")
            self._notify_hardware({"event": "outputs", "siren": self.state["siren"],
                                   "lights": self.state["lights"], "source": source})
        return changed

    def _arm_timer(self) -> None:
        if self._timer:
            self._timer.cancel()
        self._timer = threading.Timer(AUTO_DISARM_SECONDS, self._auto_disarm)
        self._timer.daemon = True
        self._timer.start()

    def _auto_disarm(self) -> None:
        state = self.update({"siren": False, "lights": False}, source="auto-disarm")
        if not (state["siren"] or state["lights"]):
            self.bus.log("deterrence", "Deterrence auto-disarmed after 30 s", "info")

    def _notify_hardware(self, payload: dict) -> None:
        if not self.webhook:
            return

        def send():
            try:
                req = urllib.request.Request(
                    self.webhook, data=json.dumps(payload).encode(),
                    headers={"Content-Type": "application/json"}, method="POST",
                )
                urllib.request.urlopen(req, timeout=5).close()
            except Exception as exc:
                print(f"[Deterrence] Hardware webhook failed — {exc}")

        threading.Thread(target=send, daemon=True).start()
