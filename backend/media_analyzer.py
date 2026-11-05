"""
Upload analysis — still images and recorded videos, day or night.

Images are analysed synchronously in "thorough" mode: the detector runs on
both the original and the night-enhanced picture when lighting is poor, and
every box is species-verified by CLIP.

Videos run as background jobs (one at a time, so live cameras keep a share
of the CPU) using the same pipeline as the live cameras: sampled frames →
proposals → tracker with species voting. The job produces:

  * an annotated, browser-playable copy of the video (H.264 MP4 via Windows
    Media Foundation, falling back to VP8 WebM),
  * a sightings timeline (one entry per confirmed animal track),
  * a best keyframe per sighting and a per-species summary,
  * day/night statistics.

High-risk animals found in uploads go through AlertManager like any camera
detection (camera id "UPLOAD") unless the operator unticks "raise alerts".
Every analysis is stored under data/analyses/<id>/ with a result.json, so the
history survives server restarts.
"""

import json
import queue
import re
import shutil
import threading
import time
import uuid
from pathlib import Path

import cv2
import numpy as np

from detector import ALERTS_DIR
from night_vision import LightingMonitor, enhance_frame, should_enhance
from tracker import Tracker, extrapolate
from wildlife_engine import draw_detections, draw_hud, sensitivity_to_conf

PROJECT_ROOT = Path(__file__).resolve().parents[1]
ANALYSES_DIR = PROJECT_ROOT / "data" / "analyses"

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tif", ".tiff"}
VIDEO_EXTS = {".mp4", ".avi", ".mov", ".mkv", ".webm", ".m4v", ".mpg", ".mpeg", ".3gp", ".wmv"}
IMAGE_OUTPUT_MAX = 1920
VIDEO_OUTPUT_MAX = 1280
UPLOAD_CAMERA_ID = "UPLOAD"
_SAFE_NAME = re.compile(r"^[A-Za-z0-9_.-]+$")


def media_kind(filename: str, mimetype: str = "") -> "str | None":
    ext = Path(filename or "").suffix.lower()
    if ext in IMAGE_EXTS or (mimetype or "").startswith("image/"):
        return "image"
    if ext in VIDEO_EXTS or (mimetype or "").startswith("video/"):
        return "video"
    return None


def _summarise(items: "list[dict]") -> "list[dict]":
    """Per-species summary from detections or sightings."""
    species: "dict[str, dict]" = {}
    for item in items:
        s = species.setdefault(item["label"], {
            "label": item["label"], "threat_level": item["threat_level"],
            "count": 0, "max_confidence": 0.0,
        })
        s["count"] += 1
        s["max_confidence"] = max(s["max_confidence"], item.get("max_confidence", item["confidence"]))
        if "start_s" in item:
            s["first_seen_s"] = min(s.get("first_seen_s", item["start_s"]), item["start_s"])
            s["visible_s"] = round(s.get("visible_s", 0.0) + item["end_s"] - item["start_s"], 2)
    order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
    return sorted(species.values(), key=lambda s: (order.get(s["threat_level"], 3), -s["max_confidence"]))


def _open_writer(base: Path, fps: float, size: "tuple[int, int]"):
    """First encoder that works: H.264 MP4 (Media Foundation) → H.264 (FFmpeg) → VP8 WebM."""
    candidates = []
    if hasattr(cv2, "CAP_MSMF"):
        candidates.append((".mp4", cv2.CAP_MSMF, "H264"))
    candidates += [(".mp4", cv2.CAP_FFMPEG, "avc1"), (".webm", cv2.CAP_FFMPEG, "VP80")]
    for ext, api, fourcc in candidates:
        path = base.with_suffix(ext)
        try:
            writer = cv2.VideoWriter(str(path), api, cv2.VideoWriter_fourcc(*fourcc), fps, size)
        except cv2.error:
            continue
        if writer.isOpened():
            return writer, path
        writer.release()
        path.unlink(missing_ok=True)
    return None, None


def _even(n: float) -> int:
    return max(2, int(n) // 2 * 2)


class MediaAnalyzer:
    def __init__(self, ctx) -> None:
        self.ctx = ctx
        ANALYSES_DIR.mkdir(parents=True, exist_ok=True)
        self._jobs: "dict[str, VideoJob]" = {}
        self._queue: "queue.Queue[VideoJob]" = queue.Queue()
        self._recover_interrupted()
        threading.Thread(target=self._worker, daemon=True, name="WildGuard-video-jobs").start()

    # ------------------------------------------------------------------
    # Common
    # ------------------------------------------------------------------

    def _options(self, raw: dict) -> dict:
        settings = self.ctx.settings_snapshot
        night_mode = raw.get("night_mode") if raw.get("night_mode") in ("auto", "on", "off") else settings["night_mode"]
        try:
            sensitivity = float(raw.get("sensitivity", settings["sensitivity"]))
        except (TypeError, ValueError):
            sensitivity = settings["sensitivity"]
        try:
            analysis_fps = float(raw.get("analysis_fps", settings["analysis_fps"]))
        except (TypeError, ValueError):
            analysis_fps = settings["analysis_fps"]
        return {
            "night_mode": night_mode,
            "sensitivity": min(max(sensitivity, 20), 100),
            "raise_alerts": str(raw.get("raise_alerts", "true")).lower() not in ("0", "false", "no", "off"),
            "analysis_fps": min(max(analysis_fps, 1.0), 30.0),
            "species_classifier": settings["species_classifier"],
        }

    def _new_dir(self) -> "tuple[str, Path]":
        aid = time.strftime("%Y%m%d-%H%M%S-") + uuid.uuid4().hex[:6]
        folder = ANALYSES_DIR / aid
        folder.mkdir(parents=True)
        return aid, folder

    def _raise_alert(self, label: str, conf: float, image: np.ndarray, when: float) -> bool:
        alerts = self.ctx.alerts
        if not alerts.would_alert(label, conf, UPLOAD_CAMERA_ID):
            return False
        ALERTS_DIR.mkdir(exist_ok=True)
        path = ALERTS_DIR / f"{label.replace(' ', '_')}_{int(time.time())}.jpg"
        cv2.imwrite(str(path), image, [cv2.IMWRITE_JPEG_QUALITY, 90])
        alerts.trigger(label=label, confidence=conf, camera_id=UPLOAD_CAMERA_ID,
                       snapshot_path=path, timestamp=when)
        return True

    # ------------------------------------------------------------------
    # Images
    # ------------------------------------------------------------------

    def analyze_image(self, data: bytes, filename: str, raw_options: dict) -> dict:
        opts = self._options(raw_options)
        img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Could not read the image — unsupported or corrupt file")

        aid, folder = self._new_dir()
        ext = Path(filename).suffix.lower() if Path(filename).suffix.lower() in IMAGE_EXTS else ".jpg"
        (folder / f"original{ext}").write_bytes(data)

        engine = self.ctx.engine
        t0 = time.perf_counter()
        res = engine.detect(img, conf=sensitivity_to_conf(opts["sensitivity"]),
                            night_mode=opts["night_mode"], thorough=True,
                            classify=opts["species_classifier"])
        detections, lighting = res["detections"], res["lighting"]

        h, w = img.shape[:2]
        scale = min(1.0, IMAGE_OUTPUT_MAX / float(max(h, w)))
        base = cv2.resize(img, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_AREA) if scale < 1 else img.copy()
        annotated = draw_detections(base.copy(), detections, scale)
        draw_hud(annotated, "WILDGUARD AI  IMAGE ANALYSIS", lighting, False)
        cv2.imwrite(str(folder / "annotated.jpg"), annotated, [cv2.IMWRITE_JPEG_QUALITY, 90])
        files = {"original": f"original{ext}", "annotated": "annotated.jpg"}

        if lighting["is_night"] or res["enhanced"]:
            night_view = enhance_frame(base, lighting, quality="high")
            draw_detections(night_view, detections, scale)
            draw_hud(night_view, "WILDGUARD AI  NIGHT VIEW", lighting, True)
            cv2.imwrite(str(folder / "enhanced.jpg"), night_view, [cv2.IMWRITE_JPEG_QUALITY, 90])
            files["enhanced"] = "enhanced.jpg"
        thumb = cv2.resize(annotated, (480, round(480 * annotated.shape[0] / annotated.shape[1])))
        cv2.imwrite(str(folder / "thumb.jpg"), thumb, [cv2.IMWRITE_JPEG_QUALITY, 80])
        files["thumbnail"] = "thumb.jpg"

        alerts_raised = []
        if opts["raise_alerts"]:
            best: "dict[str, dict]" = {}
            for d in detections:
                if d["confidence"] > best.get(d["label"], {"confidence": -1})["confidence"]:
                    best[d["label"]] = d
            for label, d in best.items():
                if self._raise_alert(label, d["confidence"], annotated, time.time()):
                    alerts_raised.append(label)

        result = {
            "id": aid,
            "kind": "image",
            "filename": filename,
            "created_at": time.time(),
            "status": "completed",
            "options": opts,
            "width": w,
            "height": h,
            "lighting": lighting,
            "enhanced": res["enhanced"],
            "inference_ms": res["inference_ms"],
            "processing_ms": round((time.perf_counter() - t0) * 1000, 1),
            "classifier": engine.classifier_active and opts["species_classifier"],
            "detections": detections,
            "species": _summarise(detections),
            "alerts_raised": alerts_raised,
            "files": files,
        }
        (folder / "result.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
        self._log_finished(result)
        return self._public(result)

    # ------------------------------------------------------------------
    # Videos
    # ------------------------------------------------------------------

    def submit_video(self, upload, filename: str, raw_options: dict) -> dict:
        opts = self._options(raw_options)
        aid, folder = self._new_dir()
        ext = Path(filename).suffix.lower() if Path(filename).suffix.lower() in VIDEO_EXTS else ".mp4"
        path = folder / f"original{ext}"
        upload.save(str(path))

        probe = cv2.VideoCapture(str(path))
        ok = probe.isOpened() and probe.read()[0]
        probe.release()
        if not ok:
            shutil.rmtree(folder, ignore_errors=True)
            raise ValueError("Could not decode the video — unsupported codec or corrupt file")

        job = VideoJob(aid, folder, path, filename, opts, self)
        self._jobs[aid] = job
        job.save()
        self._queue.put(job)
        self.ctx.bus.log("analysis", f"Video queued for analysis: {filename}", "info")
        self.ctx.bus.publish("analysis", job.summary())
        return job.summary()

    def _worker(self) -> None:
        while True:
            job = self._queue.get()
            if job.status == "cancelled":
                continue
            try:
                job.run()
            except Exception as exc:
                job.fail(str(exc))
            finally:
                self._log_finished(job.result)

    def _recover_interrupted(self) -> None:
        for path in ANALYSES_DIR.glob("*/result.json"):
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            if data.get("status") in ("queued", "processing"):
                data["status"] = "failed"
                data["error"] = "Interrupted by a server restart"
                path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    # ------------------------------------------------------------------
    # History / files
    # ------------------------------------------------------------------

    def _load(self, aid: str) -> "dict | None":
        if aid in self._jobs and self._jobs[aid].status in ("queued", "processing"):
            return self._jobs[aid].result
        if not _SAFE_NAME.match(aid):
            return None
        path = ANALYSES_DIR / aid / "result.json"
        if not path.exists():
            return None
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None

    def get(self, aid: str) -> "dict | None":
        data = self._load(aid)
        return self._public(data) if data else None

    def list(self, limit: int = 50) -> "list[dict]":
        out = []
        for folder in sorted(ANALYSES_DIR.iterdir(), reverse=True):
            if not folder.is_dir():
                continue
            data = self._load(folder.name)
            if data:
                out.append(self._public(data, brief=True))
            if len(out) >= limit:
                break
        return out

    def delete(self, aid: str) -> bool:
        job = self._jobs.get(aid)
        if job and job.status in ("queued", "processing"):
            job.cancel()
            job.done.wait(timeout=10)
        folder = ANALYSES_DIR / aid
        if not _SAFE_NAME.match(aid) or not folder.is_dir():
            return False
        shutil.rmtree(folder, ignore_errors=True)
        self._jobs.pop(aid, None)
        return True

    def cancel(self, aid: str) -> "dict | None":
        job = self._jobs.get(aid)
        if not job:
            return None
        job.cancel()
        return job.summary()

    def file_path(self, aid: str, name: str) -> "Path | None":
        if not (_SAFE_NAME.match(aid) and _SAFE_NAME.match(name)):
            return None
        path = ANALYSES_DIR / aid / name
        return path if path.is_file() else None

    def job(self, aid: str) -> "VideoJob | None":
        return self._jobs.get(aid)

    def _public(self, data: dict, brief: bool = False) -> dict:
        aid = data["id"]
        files = {k: f"/api/analyses/{aid}/files/{v}" for k, v in data.get("files", {}).items()}
        out = {**data, "urls": files}
        out["source_path"] = f"data/analyses/{aid}/{data['files']['original']}" if data.get("files", {}).get("original") else None
        if brief:
            for key in ("detections", "sightings", "options"):
                out.pop(key, None)
        return out

    def _log_finished(self, result: dict) -> None:
        status = result.get("status")
        name = result.get("filename", "upload")
        if status == "completed":
            species = result.get("species", [])
            if species:
                top = ", ".join(f"{s['label'].title()} ×{s['count']}" for s in species[:3])
                level = "danger" if any(s["threat_level"] == "HIGH" for s in species) else "warning"
                self.ctx.bus.log("analysis", f"{result['kind'].title()} analysed — {top} ({name})", level)
            else:
                self.ctx.bus.log("analysis", f"{result['kind'].title()} analysed — no animals found ({name})", "success")
        elif status == "failed":
            self.ctx.bus.log("analysis", f"Analysis failed for {name}: {result.get('error')}", "warning")
        if result.get("kind") == "video":
            self.ctx.bus.publish("analysis", self._public(result, brief=True))


class VideoJob:
    def __init__(self, aid: str, folder: Path, path: Path, filename: str, opts: dict,
                 analyzer: MediaAnalyzer) -> None:
        self.id = aid
        self.folder = folder
        self.path = path
        self.analyzer = analyzer
        self.ctx = analyzer.ctx
        self._cancel = threading.Event()
        self.done = threading.Event()
        self._preview: "bytes | None" = None
        self._preview_seq = 0
        self._cond = threading.Condition()
        self.result = {
            "id": aid,
            "kind": "video",
            "filename": filename,
            "created_at": time.time(),
            "status": "queued",
            "options": opts,
            "progress": 0.0,
            "files": {"original": path.name},
        }

    @property
    def status(self) -> str:
        return self.result["status"]

    def summary(self) -> dict:
        return self.analyzer._public(self.result, brief=True)

    def save(self) -> None:
        (self.folder / "result.json").write_text(json.dumps(self.result, indent=2), encoding="utf-8")

    def cancel(self) -> None:
        self._cancel.set()
        if self.status == "queued":
            self.result["status"] = "cancelled"
            self.save()
            self.done.set()

    def fail(self, error: str) -> None:
        self.result.update(status="failed", error=error, finished_at=time.time())
        self.save()
        self.done.set()

    def wait_preview(self, after_seq: int, timeout: float = 1.0) -> "tuple[int, bytes | None]":
        with self._cond:
            if self._preview_seq <= after_seq:
                self._cond.wait(timeout)
            return self._preview_seq, self._preview

    def _set_preview(self, img: np.ndarray) -> None:
        jpeg = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 75])[1].tobytes()
        with self._cond:
            self._preview = jpeg
            self._preview_seq += 1
            self._cond.notify_all()

    # ------------------------------------------------------------------

    def run(self) -> None:
        if self._cancel.is_set():
            return
        opts = self.result["options"]
        engine = self.ctx.engine
        bus = self.ctx.bus

        cap = cv2.VideoCapture(str(self.path))
        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        if fps <= 1 or fps > 240:
            fps = 25.0
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        out_scale = min(1.0, VIDEO_OUTPUT_MAX / float(max(width, height)))
        out_size = (_even(width * out_scale), _even(height * out_scale))
        out_step = max(1, round(fps / 30.0))
        stride = max(1, round(fps / opts["analysis_fps"]))
        writer, out_path = _open_writer(self.folder / "annotated", fps / out_step, out_size)

        self.result.update(
            status="processing",
            started_at=time.time(),
            video={"fps": round(fps, 2), "frames": total, "width": width, "height": height,
                   "duration_s": round(total / fps, 2) if total else None},
        )
        self.save()
        bus.publish("analysis", self.summary())

        conf = sensitivity_to_conf(opts["sensitivity"])
        classifier_on = engine.classifier_active and opts["species_classifier"]
        tracker = Tracker(engine.species, max_age_s=max(3.0, 4 * stride / fps))
        monitor = LightingMonitor()
        overlay: "list[dict]" = []
        overlay_t = 0.0
        lighting = monitor.current
        enhanced = False
        sightings: "dict[int, dict]" = {}
        keyframes: "dict[int, tuple[float, np.ndarray]]" = {}
        alerts_raised: "list[str]" = []
        night_frames = analysed = enhanced_frames = 0
        infer_ms = 0.0
        t_start = time.time()
        last_progress = last_preview = 0.0
        idx = 0

        while not self._cancel.is_set():
            ok, frame = cap.read()
            if not ok:
                break
            t = idx / fps
            needs_key: "list[int]" = []
            pending_alerts: "list[dict]" = []

            if idx % stride == 0:
                t0 = time.perf_counter()
                lighting = monitor.update(frame)
                ps = engine.propose(frame, conf=conf, night_mode=opts["night_mode"], lighting=lighting)
                enhanced = ps.enhanced
                seen = tracker.step(ps, lambda boxes: engine.classify(ps.raw, boxes),
                                    engine.fuse, classifier_on, t)
                overlay = [tracker.describe(tr, ps.shape) for tr in seen]
                overlay_t = t
                infer_ms += (time.perf_counter() - t0) * 1000
                analysed += 1
                night_frames += int(lighting["is_night"])
                enhanced_frames += int(enhanced)

                for tr, det in zip(seen, overlay):
                    if not tr.stable:
                        continue
                    s = sightings.get(tr.id)
                    if s is None or s["label"] != det["label"]:
                        keyframes.pop(tr.id, None)
                        labels = (s["labels_seen"] if s else [])
                        s = sightings[tr.id] = {
                            "track_id": tr.id, "label": det["label"],
                            "threat_level": det["threat_level"],
                            "start_s": round(s["start_s"] if s else t, 2),
                            "max_confidence": 0.0, "labels_seen": labels,
                        }
                    if det["label"] not in s["labels_seen"]:
                        s["labels_seen"].append(det["label"])
                    s["end_s"] = round(t, 2)
                    s["confidence"] = det["confidence"]
                    s["species_scores"] = det["species_scores"]
                    s["night"] = bool(lighting["is_night"])
                    if det["confidence"] > s["max_confidence"]:
                        s["max_confidence"] = det["confidence"]
                        s["best_at_s"] = round(t, 2)
                        needs_key.append(tr.id)
                    if (opts["raise_alerts"] and det["label"] not in tr.alerted
                            and self.ctx.alerts.would_alert(det["label"], det["confidence"], UPLOAD_CAMERA_ID)):
                        tr.alerted.add(det["label"])
                        pending_alerts.append(det)

            write_now = writer is not None and idx % out_step == 0
            if write_now or needs_key or pending_alerts or time.time() - last_preview > 0.25:
                disp = cv2.resize(frame, out_size, interpolation=cv2.INTER_AREA)
                if enhanced and lighting["is_night"]:
                    disp = enhance_frame(disp, lighting)
                draw_detections(disp, extrapolate(overlay, t - overlay_t), out_size[0] / float(width))
                draw_hud(disp, f"WILDGUARD AI  {_clock(t)}", lighting, enhanced and lighting["is_night"])
                if write_now:
                    writer.write(disp)
                for tid in needs_key:
                    keyframes[tid] = (sightings[tid]["max_confidence"], disp.copy())
                for det in pending_alerts:
                    if self.analyzer._raise_alert(det["label"], det["confidence"], disp, time.time()):
                        alerts_raised.append(det["label"])
                if time.time() - last_preview > 0.25:
                    last_preview = time.time()
                    self._set_preview(disp)

            idx += 1
            if time.time() - last_progress > 0.5:
                last_progress = time.time()
                elapsed = last_progress - t_start
                progress = idx / total if total else 0.0
                self.result.update(
                    progress=round(min(progress, 0.999), 4),
                    processed_frames=idx,
                    eta_s=round(elapsed / progress - elapsed, 1) if progress > 0.02 else None,
                    live_species=sorted({s["label"] for s in sightings.values()}),
                    live_sightings=len(sightings),
                )
                bus.publish("analysis", self.summary())

        cap.release()
        if writer is not None:
            writer.release()

        if self._cancel.is_set():
            self.result.update(status="cancelled", finished_at=time.time())
            self.save()
            self.done.set()
            return

        files = dict(self.result["files"])
        if out_path is not None and out_path.exists():
            files["annotated"] = out_path.name

        ordered = sorted(sightings.values(), key=lambda s: s["start_s"])
        for s in ordered:
            key = keyframes.get(s["track_id"])
            if key is not None:
                name = f"key_{s['track_id']}.jpg"
                cv2.imwrite(str(self.folder / name), key[1], [cv2.IMWRITE_JPEG_QUALITY, 88])
                s["keyframe_url"] = f"/api/analyses/{self.id}/files/{name}"
        thumb_src = max(keyframes.values(), key=lambda k: k[0])[1] if keyframes else None
        if thumb_src is None:
            cap = cv2.VideoCapture(str(self.path))
            ok, first = cap.read()
            cap.release()
            thumb_src = first if ok else None
        if thumb_src is not None:
            th = cv2.resize(thumb_src, (480, round(480 * thumb_src.shape[0] / thumb_src.shape[1])))
            cv2.imwrite(str(self.folder / "thumb.jpg"), th, [cv2.IMWRITE_JPEG_QUALITY, 80])
            files["thumbnail"] = "thumb.jpg"

        modes = {"night": night_frames, "day": analysed - night_frames}
        self.result.update(
            status="completed",
            finished_at=time.time(),
            progress=1.0,
            processed_frames=idx,
            eta_s=0,
            analysis={
                "stride": stride, "analysed_frames": analysed,
                "avg_inference_ms": round(infer_ms / analysed, 1) if analysed else None,
                "processing_s": round(time.time() - t_start, 1),
                "classifier": classifier_on,
            },
            lighting={
                "night_ratio": round(night_frames / analysed, 3) if analysed else 0.0,
                "enhanced_ratio": round(enhanced_frames / analysed, 3) if analysed else 0.0,
                "dominant": max(modes, key=modes.get) if analysed else "day",
                "mode": monitor.current["mode"],
            },
            sightings=ordered,
            species=_summarise(ordered),
            alerts_raised=alerts_raised,
            files=files,
        )
        self.save()
        self.done.set()


def _clock(seconds: float) -> str:
    m, s = divmod(seconds, 60)
    return f"{int(m):02d}:{s:05.2f}"
