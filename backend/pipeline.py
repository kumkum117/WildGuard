"""
WildGuard — central real-time detection pipeline.

Wires VideoStream → WildGuardDetector → AlertManager into one loop.
Can be run standalone (headless, no web UI) or imported by app.py.

Standalone usage:
    python pipeline.py --source ../data/videos/1000106721.mp4 \
                       --model ../models/yolov8s-worldv2.pt
"""

import argparse
import threading
import time
from pathlib import Path

import cv2

from alert_manager import AlertManager
from detector import WildGuardDetector, WILDLIFE_ANIMALS
from video_stream import VideoStream

PROJECT_ROOT = Path(__file__).resolve().parents[1]


class WildGuardPipeline:
    """
    Coordinates the three core modules. Start the pipeline with start(), then
    call get_latest_jpeg() / get_latest_detections() to read results from
    other threads (e.g. a Flask server).

    Alert flow per frame:
      1. Detector returns detections with threat_level and snapshot path.
      2. For every HIGH-threat detection, alert_manager.trigger() is called
         immediately on the same iteration — no buffering.
      3. trigger() checks confidence threshold + per-(camera, animal) cooldown,
         logs to the DB, then fires the email on a daemon thread.
      4. Any exception in alerting is caught and logged; the detection loop
         keeps running regardless.
    """

    def __init__(
        self,
        source: "int | str",
        model_path: "str | Path",
        camera_id: str = "cam-00",
        frame_interval: int = 5,
    ) -> None:
        model_path = Path(model_path)
        animals = WILDLIFE_ANIMALS if "world" in model_path.name.lower() else None

        self.camera_id     = camera_id
        self.stream        = VideoStream(source, frame_interval)
        self.detector      = WildGuardDetector(model_path=model_path, animals=animals)
        self.alert_manager = AlertManager()

        self._latest_jpeg:       "bytes | None" = None
        self._latest_detections: "list[dict]"   = []
        self._lock = threading.Lock()

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def start(self, stop_event: threading.Event) -> threading.Thread:
        self.stream.start()
        t = threading.Thread(
            target=self._loop,
            args=(stop_event,),
            daemon=True,
            name="WildGuard-pipeline",
        )
        t.start()
        return t

    def stop(self) -> None:
        self.stream.stop()

    # ------------------------------------------------------------------
    # Read interface (called from Flask / other threads)
    # ------------------------------------------------------------------

    def get_latest_jpeg(self) -> "bytes | None":
        with self._lock:
            return self._latest_jpeg

    def get_latest_detections(self) -> "list[dict]":
        with self._lock:
            return list(self._latest_detections)

    # ------------------------------------------------------------------
    # Detection loop
    # ------------------------------------------------------------------

    def _loop(self, stop_event: threading.Event) -> None:
        while not stop_event.is_set():
            frame = self.stream.get_frame()
            if frame is None:
                time.sleep(0.01)
                continue

            # --- detection (errors here skip the frame, never crash) ---
            try:
                annotated, detections = self.detector.process_frame(frame)
            except Exception as exc:
                print(f"[Pipeline] Detection error — {exc}")
                continue

            # --- alert on the exact frame that triggered the detection ---
            ts = time.time()
            for det in detections:
                if det["threat_level"] == "HIGH":
                    try:
                        self.alert_manager.trigger(
                            label=det["label"],
                            confidence=det["confidence"],
                            camera_id=self.camera_id,
                            snapshot_path=det.get("snapshot"),
                            timestamp=ts,
                        )
                    except Exception as exc:
                        # Alert failure must never stop the video loop.
                        print(f"[Pipeline] Alert dispatch error — {exc}")

            # --- encode and publish for the web stream ---
            ok, buf = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 85])
            if ok:
                with self._lock:
                    self._latest_jpeg       = buf.tobytes()
                    self._latest_detections = detections


# ----------------------------------------------------------------------
# Standalone / headless entry point (no Flask)
# ----------------------------------------------------------------------

def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="WildGuard — headless detection pipeline")
    p.add_argument("--source", default="0",
                   help="Webcam index, video path, or RTSP URL (default: 0)")
    p.add_argument("--model", default=str(PROJECT_ROOT / "yolov8n.pt"),
                   help="Path to .pt model file")
    p.add_argument("--camera-id", default="cam-00",
                   help="Camera identifier used in alerts and DB (default: cam-00)")
    p.add_argument("--frame-interval", type=int, default=5,
                   help="Run inference every Nth frame (default: 5)")
    return p.parse_args()


def main() -> None:
    args = _parse_args()

    raw = args.source
    source: "int | str" = int(raw) if raw.isdigit() else raw

    model_path = Path(args.model)
    if not model_path.is_absolute():
        model_path = PROJECT_ROOT / model_path

    pipeline = WildGuardPipeline(
        source=source,
        model_path=model_path,
        camera_id=args.camera_id,
        frame_interval=args.frame_interval,
    )

    stop_event = threading.Event()
    pipeline.start(stop_event)

    print(f"[Pipeline] Running — source={source}  model={model_path.name}  "
          f"camera={args.camera_id}  interval={args.frame_interval}")
    print("[Pipeline] Press Ctrl+C to stop\n")

    try:
        while True:
            time.sleep(1)
            dets = pipeline.get_latest_detections()
            for d in dets:
                print(f"  [{d['threat_level']}] {d['label']} {d['confidence']:.0%}")
    except KeyboardInterrupt:
        print("\n[Pipeline] Stopping...")
    finally:
        stop_event.set()
        pipeline.stop()


if __name__ == "__main__":
    main()
