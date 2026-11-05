"""
Live camera fleet for the WildGuard server.

Each camera is a CameraWorker built on the project's VideoStream:

    VideoStream (capture thread)
        ├─ render thread   → latest frame + last known boxes → JPEG for the
        │                    dashboard's MJPEG stream (smooth, ~15 fps)
        └─ inference thread→ WildlifeEngine proposals → Tracker → sightings
                              ├─ detection events / activity feed (EventBus)
                              ├─ deterrence auto-response
                              └─ AlertManager.trigger() for high-risk animals

Rendering and inference are decoupled so the video stays smooth even though
CPU inference runs at only a few frames per second; boxes are drawn from the
most recent inference. All cameras share one WildlifeEngine (one model in
memory).

Video files are valid camera sources (that is how the sample clips act as
demo feeds): PacedVideoStream plays them at their native frame rate and
loops seamlessly, instead of racing through the file and pausing to
"reconnect" at the end like a dropped RTSP feed.
"""

import os
import threading
import time
from pathlib import Path

import cv2
import numpy as np

from detector import ALERTS_DIR
from night_vision import LightingMonitor, enhance_frame, should_enhance
from tracker import Tracker, extrapolate
from video_stream import VideoStream
from wildlife_engine import draw_detections, draw_hud, sensitivity_to_conf

PROJECT_ROOT = Path(__file__).resolve().parents[1]

DISPLAY_MAX_WIDTH = 960
DISPLAY_FPS = 15
JPEG_QUALITY = 80
SIGHTING_COOLDOWN = 20.0   # s between detection events for one species on one camera
EVENT_MIN_CONFIDENCE = 0.45  # below this a stable track is drawn but not announced
OFFLINE_AFTER = 4.0        # s without frames before a camera counts as offline
OVERLAY_TTL = 2.0          # min s before boxes from a stalled inference are hidden
# An unresolved alert stays open while its animal keeps being seen; once the
# animal has been gone this long, the next sighting raises a new alert.
INCIDENT_GAP_S = float(os.environ.get("WILDGUARD_INCIDENT_GAP_MIN", "10")) * 60
INCIDENT_TOUCH_S = 10.0    # how often an ongoing sighting is recorded on its alert


def normalize_source(raw) -> "int | str":
    text = str(raw).strip()
    if text.isdigit():
        return int(text)
    if "://" in text:
        return text
    path = Path(text)
    if not path.is_absolute():
        path = PROJECT_ROOT / path
    return str(path)


def source_type(raw) -> str:
    text = str(raw).strip()
    if text.isdigit():
        return "webcam"
    if "://" in text:
        return "stream"
    return "file"


def placeholder_jpeg(text: str, sub: str = "") -> bytes:
    img = np.full((540, 960, 3), (14, 17, 15), dtype=np.uint8)
    for x in range(0, 960, 48):
        cv2.line(img, (x, 0), (x, 540), (22, 28, 24), 1)
    for y in range(0, 540, 48):
        cv2.line(img, (0, y), (960, y), (22, 28, 24), 1)
    font = cv2.FONT_HERSHEY_SIMPLEX
    (tw, _), _ = cv2.getTextSize(text, font, 0.9, 2)
    cv2.putText(img, text, ((960 - tw) // 2, 262), font, 0.9, (153, 211, 52), 2, cv2.LINE_AA)
    if sub:
        (sw, _), _ = cv2.getTextSize(sub, font, 0.5, 1)
        cv2.putText(img, sub, ((960 - sw) // 2, 300), font, 0.5, (150, 160, 155), 1, cv2.LINE_AA)
    return cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 80])[1].tobytes()


# ----------------------------------------------------------------------
# Capture
# ----------------------------------------------------------------------

class _LoopingPacedCapture:
    """cv2.VideoCapture wrapper for files: native-speed playback, seamless loop."""

    def __init__(self, cap: cv2.VideoCapture, fps: float) -> None:
        self._cap = cap
        self._dt = 1.0 / max(1.0, min(fps, 120.0))
        self._next = time.perf_counter()

    def read(self):
        now = time.perf_counter()
        if self._next > now:
            time.sleep(self._next - now)
        elif now - self._next > 1.0:
            self._next = now          # fell far behind (e.g. system stall) — resync
        self._next += self._dt
        ok, frame = self._cap.read()
        if not ok:
            self._cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ok, frame = self._cap.read()
        return ok, frame

    def isOpened(self) -> bool:
        return self._cap.isOpened()

    def get(self, prop):
        return self._cap.get(prop)

    def release(self) -> None:
        self._cap.release()


class PacedVideoStream(VideoStream):
    def __init__(self, source: "int | str", frame_interval: int = 1) -> None:
        super().__init__(source, frame_interval)
        self.is_file = isinstance(source, str) and Path(source).is_file()
        self.native_fps: "float | None" = None
        self.resolution: "tuple[int, int] | None" = None

    def _open_capture(self):
        cap = super()._open_capture()
        if cap is None:
            return None
        self.native_fps = cap.get(cv2.CAP_PROP_FPS) or None
        self.resolution = (int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)))
        if self.is_file:
            return _LoopingPacedCapture(cap, self.native_fps or 25.0)
        return cap


# ----------------------------------------------------------------------
# One camera
# ----------------------------------------------------------------------

class CameraWorker:
    def __init__(self, config: dict, ctx) -> None:
        self.config = config
        self.ctx = ctx
        self._stop = threading.Event()
        self._stream: "PacedVideoStream | None" = None
        self._threads: "list[threading.Thread]" = []
        self._tracker = Tracker(ctx.engine.species)
        self._lighting = LightingMonitor()

        self._overlay: "list[dict]" = []
        self._overlay_at = 0.0
        self._overlay_frame_at = 0.0   # when the inferred frame was captured
        self._overlay_lock = threading.Lock()

        self._jpeg: "bytes | None" = None
        self._seq = 0
        self._cond = threading.Condition()

        self.started_at = 0.0
        self._last_frame_at = 0.0
        self._last_inference_at = 0.0
        self._inference_ms = 0.0
        self._inference_gap = 0.0
        self._display_fps = 0.0
        self._last_sighting: "dict[str, float]" = {}
        self._last_incident_touch: "dict[str, float]" = {}

    @property
    def id(self) -> str:
        return self.config["id"]

    @property
    def name(self) -> str:
        return self.config["name"]

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def start(self) -> None:
        if not self.config.get("enabled", True) or self._stream is not None:
            return
        source = normalize_source(self.config["source"])
        interval = 1
        if isinstance(source, str) and Path(source).is_file():
            probe = cv2.VideoCapture(source)
            fps = probe.get(cv2.CAP_PROP_FPS) or 25.0
            probe.release()
            interval = max(1, round(fps / 30.0))   # 60 fps clips → 30 fps feed
        self._stop.clear()
        self._stream = PacedVideoStream(source, interval).start()
        self.started_at = time.time()
        self._threads = [
            threading.Thread(target=self._render_loop, daemon=True, name=f"{self.id}-render"),
            threading.Thread(target=self._infer_loop, daemon=True, name=f"{self.id}-infer"),
        ]
        for t in self._threads:
            t.start()

    def stop(self) -> None:
        self._stop.set()
        if self._stream is not None:
            self._stream.stop()
        for t in self._threads:
            t.join(timeout=3.0)
        self._threads = []
        self._stream = None
        self._tracker.reset()
        with self._overlay_lock:
            self._overlay = []
        with self._cond:
            self._jpeg = None
            self._seq += 1
            self._cond.notify_all()

    # ------------------------------------------------------------------
    # State
    # ------------------------------------------------------------------

    @property
    def status(self) -> str:
        if not self.config.get("enabled", True):
            return "paused"
        if self._stream is None:
            return "offline"
        if time.time() - self._last_frame_at <= OFFLINE_AFTER:
            return "online"
        return "connecting" if time.time() - self.started_at < 15 else "offline"

    def _overlay_fresh(self) -> bool:
        # Inference may run at < 1 fps on a busy CPU; only hide boxes when it stalls.
        return time.time() - self._overlay_at <= max(OVERLAY_TTL, 2.5 * self._inference_gap)

    def to_dict(self) -> dict:
        with self._overlay_lock:
            fresh = self._overlay_fresh()
            active = sum(1 for d in self._overlay if d.get("confirmed")) if fresh else 0
        stream = self._stream
        return {
            "id": self.id,
            "name": self.name,
            "source": str(self.config["source"]),
            "source_type": source_type(self.config["source"]),
            "location": self.config.get("location"),
            "enabled": bool(self.config.get("enabled", True)),
            "status": self.status,
            "fps": round(self._display_fps, 1),
            "inference_ms": round(self._inference_ms, 1),
            "lighting": self._lighting.current,
            "active_tracks": active,
            "resolution": list(stream.resolution) if stream and stream.resolution else None,
            "last_frame_at": self._last_frame_at or None,
            "stream_url": f"/api/cameras/{self.id}/stream",
            "snapshot_url": f"/api/cameras/{self.id}/snapshot",
        }

    def wait_jpeg(self, after_seq: int, timeout: float = 1.0) -> "tuple[int, bytes | None]":
        with self._cond:
            if self._seq <= after_seq:
                self._cond.wait(timeout)
            return self._seq, self._jpeg

    def latest_jpeg(self) -> "bytes | None":
        with self._cond:
            return self._jpeg

    # ------------------------------------------------------------------
    # Render loop — smooth display stream
    # ------------------------------------------------------------------

    def _render_loop(self) -> None:
        last, last_render = None, 0.0
        frames, t0 = 0, time.time()
        min_gap = 1.0 / DISPLAY_FPS
        while not self._stop.is_set():
            frame = self._stream.get_frame() if self._stream else None
            if frame is None or frame is last:
                time.sleep(0.005)
                continue
            last = frame
            now = time.time()
            self._last_frame_at = now
            if now - last_render < min_gap:
                continue
            last_render = now
            try:
                jpeg = self._render(frame)
            except Exception as exc:
                print(f"[{self.id}] render error — {exc}")
                continue
            with self._cond:
                self._jpeg = jpeg
                self._seq += 1
                self._cond.notify_all()
            frames += 1
            if now - t0 >= 2.0:
                self._display_fps = frames / (now - t0)
                frames, t0 = 0, now

    def _render(self, frame: np.ndarray) -> bytes:
        settings = self.ctx.settings_snapshot
        h, w = frame.shape[:2]
        scale = min(1.0, DISPLAY_MAX_WIDTH / float(w))
        disp = (cv2.resize(frame, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_LINEAR)
                if scale < 1.0 else frame.copy())
        lighting = self._lighting.current
        enhanced = settings["night_view"] and should_enhance(lighting, settings["night_mode"])
        if enhanced:
            disp = enhance_frame(disp, lighting)
        with self._overlay_lock:
            overlay = list(self._overlay) if self._overlay_fresh() else []
            frame_at = self._overlay_frame_at
        draw_detections(disp, extrapolate(overlay, time.time() - frame_at), scale)
        # No HUD here: the dashboard overlays its own (alert snapshots keep one).
        return cv2.imencode(".jpg", disp, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])[1].tobytes()

    # ------------------------------------------------------------------
    # Inference loop
    # ------------------------------------------------------------------

    def _infer_loop(self) -> None:
        last = None
        while not self._stop.is_set():
            settings = self.ctx.settings_snapshot
            wait = self._last_inference_at + 1.0 / settings["max_inference_fps"] - time.time()
            if wait > 0:
                self._stop.wait(wait)
                continue
            frame = self._stream.get_frame() if self._stream else None
            if frame is None or frame is last:
                time.sleep(0.02)
                continue
            last = frame
            try:
                self._infer(frame, settings)
            except Exception as exc:
                print(f"[{self.id}] inference error — {exc}")
                self._stop.wait(1.0)

    def _infer(self, frame: np.ndarray, settings: dict) -> None:
        engine = self.ctx.engine
        t0 = time.perf_counter()
        frame_at = time.time()
        lighting = self._lighting.update(frame)
        ps = engine.propose(
            frame,
            conf=sensitivity_to_conf(settings["sensitivity"]),
            night_mode=settings["night_mode"],
            lighting=lighting,
        )
        now = time.time()
        classifier_on = engine.classifier_active and settings["species_classifier"]
        seen = self._tracker.step(ps, lambda boxes: engine.classify(ps.raw, boxes),
                                  engine.fuse, classifier_on, now)
        overlay = [self._tracker.describe(t, ps.shape) for t in seen]
        with self._overlay_lock:
            self._overlay = overlay
            if self._overlay_at:
                self._inference_gap = 0.7 * self._inference_gap + 0.3 * (now - self._overlay_at)
            self._overlay_at = now
            self._overlay_frame_at = frame_at
        self._last_inference_at = now
        self._inference_ms = (time.perf_counter() - t0) * 1000.0

        for track, det in zip(seen, overlay):
            if track.stable and det["confidence"] >= EVENT_MIN_CONFIDENCE:
                self._handle_sighting(track, det, frame, lighting, overlay, now)

    def _handle_sighting(self, track, det: dict, frame: np.ndarray, lighting: dict,
                         overlay: "list[dict]", now: float) -> None:
        ctx = self.ctx
        label, conf, level = det["label"], det["confidence"], det["threat_level"]
        pretty = label.title()

        # 1. Sighting event (once per track/species, throttled per camera).
        if track.emitted_label != label:
            track.emitted_label = label
            if now - self._last_sighting.get(label, 0.0) >= SIGHTING_COOLDOWN:
                self._last_sighting[label] = now
                ctx.bus.detection({
                    "id": f"DET-{self.id}-{track.id}-{int(now * 1000)}",
                    "camera_id": self.id,
                    "camera_name": self.name,
                    "species": label,
                    "confidence": conf,
                    "threat_level": level,
                    "bbox": det["bbox_norm"],
                    "timestamp": now,
                    "lighting": lighting["mode"],
                    "night": lighting["is_night"],
                    "track_id": track.id,
                    "source": "live",
                })
                night = " · night vision" if lighting["is_night"] else ""
                ctx.bus.log(
                    "detection", f"{pretty} detected on {self.id} — {conf:.0%}{night}",
                    {"HIGH": "danger", "MEDIUM": "warning"}.get(level, "info"),
                )
                # 2. Deterrence response matrix (auto mode only).
                ctx.deterrence.on_threat(level, pretty, self.name)

        # 3. Alert. An animal that is still around continues its open incident
        #    (sightings counter on the existing alert) instead of a new alert.
        if label.lower() not in ctx.alerts.high_risk_animals:
            return
        if now - self._last_incident_touch.get(label, 0.0) < INCIDENT_TOUCH_S:
            return
        store = getattr(ctx, "alert_store", None)
        incident = store.open_incident(self.id, label, INCIDENT_GAP_S) if store else None
        if incident is not None:
            track.alerted.add(label)
            self._last_incident_touch[label] = now
            store.touch(incident, now)
            return

        #    New incident — AlertManager decides (high-risk list, threshold,
        #    cooldown); the snapshot is only written when the alert will be logged.
        if label not in track.alerted and ctx.alerts.would_alert(label, conf, self.id):
            track.alerted.add(label)
            self._last_incident_touch[label] = now
            snapshot = self._save_snapshot(label, frame, overlay, lighting)
            try:
                ctx.alerts.trigger(label=label, confidence=conf, camera_id=self.id,
                                   snapshot_path=snapshot, timestamp=now)
            except Exception as exc:
                print(f"[{self.id}] alert dispatch error — {exc}")

    def _save_snapshot(self, label: str, frame: np.ndarray, overlay: "list[dict]",
                       lighting: dict) -> "Path | None":
        try:
            ALERTS_DIR.mkdir(exist_ok=True)
            img = frame.copy()
            draw_detections(img, [d for d in overlay if d.get("confirmed")], 1.0)
            draw_hud(img, f"{self.id}  {self.name.upper()}  {time.strftime('%Y-%m-%d %H:%M:%S')}", lighting)
            path = ALERTS_DIR / f"{label.replace(' ', '_')}_{int(time.time())}.jpg"
            cv2.imwrite(str(path), img, [cv2.IMWRITE_JPEG_QUALITY, 90])
            return path
        except Exception as exc:
            print(f"[{self.id}] snapshot failed — {exc}")
            return None


# ----------------------------------------------------------------------
# Fleet
# ----------------------------------------------------------------------

class CameraManager:
    def __init__(self, ctx) -> None:
        self.ctx = ctx
        self._workers: "dict[str, CameraWorker]" = {}
        self._lock = threading.Lock()
        self._last_status: "dict[str, str]" = {}
        for cfg in ctx.store.cameras():
            self._workers[cfg["id"]] = CameraWorker(cfg, ctx)

    # ------------------------------------------------------------------

    def start_all(self) -> None:
        for worker in list(self._workers.values()):
            worker.start()

    def stop_all(self) -> None:
        for worker in list(self._workers.values()):
            worker.stop()

    def list(self) -> "list[dict]":
        return [w.to_dict() for w in list(self._workers.values())]

    def get(self, camera_id: str) -> "CameraWorker | None":
        return self._workers.get(camera_id)

    def lookup(self, camera_id: str) -> "dict | None":
        worker = self._workers.get(camera_id)
        if worker is None:
            return None
        return {"name": worker.name, "location": worker.config.get("location")}

    def counts(self) -> "tuple[int, int]":
        statuses = [w.status for w in list(self._workers.values())]
        return sum(1 for s in statuses if s == "online"), len(statuses)

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    def add(self, data: dict) -> dict:
        name = str(data.get("name") or "").strip()
        source = str(data.get("source") or "").strip()
        if not name:
            raise ValueError("Camera name is required")
        _validate_source(source)
        with self._lock:
            n = 1
            while f"CAM-{n:02d}" in self._workers:
                n += 1
            cfg = {
                "id": f"CAM-{n:02d}",
                "name": name,
                "source": source,
                "location": _location(data.get("location"), name),
                "enabled": bool(data.get("enabled", True)),
            }
            worker = CameraWorker(cfg, self.ctx)
            self._workers[cfg["id"]] = worker
            self._persist()
        worker.start()
        self.ctx.bus.log("system", f"Camera {cfg['id']} ({name}) added to the fleet", "success")
        self.publish()
        return worker.to_dict()

    def update(self, camera_id: str, patch: dict) -> "dict | None":
        worker = self._workers.get(camera_id)
        if worker is None:
            return None
        restart = False
        with self._lock:
            cfg = worker.config
            if "name" in patch and str(patch["name"]).strip():
                cfg["name"] = str(patch["name"]).strip()
            if "location" in patch:
                cfg["location"] = _location(patch["location"], cfg["name"])
            if "source" in patch and str(patch["source"]).strip() != cfg["source"]:
                _validate_source(str(patch["source"]).strip())
                cfg["source"] = str(patch["source"]).strip()
                restart = True
            if "enabled" in patch and bool(patch["enabled"]) != cfg.get("enabled", True):
                cfg["enabled"] = bool(patch["enabled"])
                restart = True
            self._persist()
        if restart:
            worker.stop()
            worker.start()
            state = "resumed" if cfg.get("enabled", True) else "paused"
            self.ctx.bus.log("system", f"Camera {camera_id} {state}", "info")
        self.publish()
        return worker.to_dict()

    def remove(self, camera_id: str) -> bool:
        with self._lock:
            worker = self._workers.pop(camera_id, None)
            if worker is None:
                return False
            self._persist()
        worker.stop()
        self.ctx.bus.log("system", f"Camera {camera_id} removed from the fleet", "warning")
        self.publish()
        return True

    def _persist(self) -> None:
        self.ctx.store.save_cameras([w.config for w in self._workers.values()])

    # ------------------------------------------------------------------
    # Status publishing
    # ------------------------------------------------------------------

    def publish(self) -> None:
        self.ctx.bus.publish("cameras", self.list())

    def start_status_publisher(self, stop_event: threading.Event) -> None:
        threading.Thread(target=self._status_loop, args=(stop_event,), daemon=True,
                         name="WildGuard-camera-status").start()

    def _status_loop(self, stop_event: threading.Event) -> None:
        while not stop_event.wait(2.0):
            cameras = self.list()
            for cam in cameras:
                prev = self._last_status.get(cam["id"])
                now = cam["status"]
                if prev and prev != now:
                    if now == "online":
                        self.ctx.bus.log("system", f"{cam['id']} {cam['name']} online", "success")
                    elif now == "offline":
                        self.ctx.bus.log("system", f"{cam['id']} {cam['name']} lost signal", "warning")
                self._last_status[cam["id"]] = now
            self.ctx.bus.publish("cameras", cameras)


def _validate_source(source: str) -> None:
    if not source:
        raise ValueError("Camera source is required")
    if source.isdigit() or "://" in source:
        return
    path = Path(normalize_source(source))
    if not path.is_file():
        raise ValueError(f"Video file not found: {source}")


def _location(raw, name: str) -> dict:
    raw = raw if isinstance(raw, dict) else {}

    def num(v):
        try:
            return float(v)
        except (TypeError, ValueError):
            return None

    return {
        "name": str(raw.get("name") or name),
        "lat": num(raw.get("lat")),
        "lng": num(raw.get("lng")),
    }
