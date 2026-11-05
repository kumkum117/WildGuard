"""
Persistent runtime configuration for the WildGuard server.

Stores operator settings (sensitivity, night-vision mode, notification
preferences...) and the camera fleet in data/wildguard_config.json so they
survive restarts. Alert thresholds, cooldowns and e-mail credentials stay in
.env where AlertManager reads them.
"""

import copy
import json
import threading
from pathlib import Path

from night_vision import NIGHT_MODES

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "data"
CONFIG_PATH = DATA_DIR / "wildguard_config.json"

DEFAULT_SETTINGS = {
    "sensitivity": 72,          # 20–100 %, mapped to the detector threshold
    "night_mode": "auto",       # auto | on | off — low-light / IR enhancement
    "night_view": True,         # show the enhanced picture on live feeds at night
    "species_classifier": True, # CLIP species verification
    "email_alerts": True,       # gate for AlertManager e-mails (DB logging always on)
    "notifications": {"push": True, "sms": True, "call": False},
    "max_inference_fps": 2.0,   # per live camera (3 inferences confirm a sighting)
    "analysis_fps": 6.0,        # sampled frames per second for uploaded videos
}

# Demo fleet used on first run: the project's sample clips play on loop as
# camera feeds, placed at two of the dashboard's Bannerghatta locations.
DEFAULT_CAMERAS = [
    {
        "id": "CAM-01",
        "name": "North Perimeter",
        "source": "data/videos/1000106721.mp4",
        "location": {"name": "North Perimeter", "lat": 12.967, "lng": 77.587},
        "enabled": True,
    },
    {
        "id": "CAM-02",
        "name": "Village Gate",
        "source": "data/videos/test.mp4",
        "location": {"name": "Village Gate", "lat": 12.965, "lng": 77.59},
        "enabled": True,
    },
]


class SettingsStore:
    def __init__(self, path: Path = CONFIG_PATH) -> None:
        self.path = path
        self._lock = threading.Lock()
        self._settings = copy.deepcopy(DEFAULT_SETTINGS)
        self._cameras: "list[dict] | None" = None
        self._load()

    def _load(self) -> None:
        if not self.path.exists():
            return
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            print(f"[Settings] Could not read {self.path.name} ({exc}); using defaults")
            return
        self._settings.update(_validate(raw.get("settings", {}), self._settings))
        if isinstance(raw.get("cameras"), list):
            self._cameras = raw["cameras"]

    def _save(self) -> None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        payload = {"settings": self._settings, "cameras": self._cameras or []}
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        tmp.replace(self.path)

    # ------------------------------------------------------------------

    @property
    def settings(self) -> dict:
        with self._lock:
            return copy.deepcopy(self._settings)

    def get(self, key: str):
        with self._lock:
            return copy.deepcopy(self._settings.get(key))

    def update(self, patch: dict) -> dict:
        with self._lock:
            self._settings.update(_validate(patch, self._settings))
            self._save()
            return copy.deepcopy(self._settings)

    def cameras(self) -> "list[dict]":
        with self._lock:
            return copy.deepcopy(self._cameras if self._cameras is not None else DEFAULT_CAMERAS)

    def save_cameras(self, cameras: "list[dict]") -> None:
        with self._lock:
            self._cameras = copy.deepcopy(cameras)
            self._save()


def _validate(patch: dict, current: dict) -> dict:
    """Keep only known keys with sane values."""
    out = {}
    if "sensitivity" in patch:
        out["sensitivity"] = int(min(max(float(patch["sensitivity"]), 20), 100))
    if patch.get("night_mode") in NIGHT_MODES:
        out["night_mode"] = patch["night_mode"]
    for key in ("night_view", "species_classifier", "email_alerts"):
        if key in patch:
            out[key] = bool(patch[key])
    if isinstance(patch.get("notifications"), dict):
        merged = dict(current.get("notifications", {}))
        for k in ("push", "sms", "call"):
            if k in patch["notifications"]:
                merged[k] = bool(patch["notifications"][k])
        out["notifications"] = merged
    if "max_inference_fps" in patch:
        out["max_inference_fps"] = float(min(max(float(patch["max_inference_fps"]), 0.5), 15))
    if "analysis_fps" in patch:
        out["analysis_fps"] = float(min(max(float(patch["analysis_fps"]), 1), 30))
    return out
