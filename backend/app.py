import argparse
import os
import threading
import time
from pathlib import Path

from flask import Flask, Response, jsonify, render_template_string

from pipeline import WildGuardPipeline

PROJECT_ROOT = Path(__file__).resolve().parents[1]

app = Flask(__name__)

_pipeline: WildGuardPipeline | None = None

_INDEX_HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>WildGuard Live</title>
  <style>
    body { background: #111; color: #eee; font-family: monospace; margin: 0; padding: 1rem; }
    h1 { color: #4caf50; margin-bottom: 0.5rem; }
    #feed { max-width: 100%; border: 2px solid #333; display: block; margin-bottom: 1rem; }
    #det { background: #1e1e1e; padding: 0.75rem; border-radius: 4px; white-space: pre-wrap; font-size: 0.85rem; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 3px; font-weight: bold; margin-right: 4px; }
    .HIGH   { background: #f44336; }
    .MEDIUM { background: #ff9800; }
    .LOW    { background: #4caf50; }
  </style>
</head>
<body>
  <h1>WildGuard AI — Live Feed</h1>
  <img id="feed" src="/stream" alt="Live stream loading..." />
  <pre id="det">Waiting for detections...</pre>
  <script>
    function refresh() {
      fetch('/detections')
        .then(r => r.json())
        .then(data => {
          const el = document.getElementById('det');
          if (data.length === 0) { el.textContent = 'No animals detected.'; return; }
          el.textContent = JSON.stringify(data, null, 2);
        })
        .catch(() => {});
    }
    setInterval(refresh, 1000);
  </script>
</body>
</html>
"""


@app.route("/")
def index():
    return render_template_string(_INDEX_HTML)


@app.route("/stream")
def stream():
    return Response(
        _generate_mjpeg(),
        mimetype="multipart/x-mixed-replace; boundary=frame",
    )


@app.route("/detections")
def detections():
    data = _pipeline.get_latest_detections() if _pipeline else []
    return jsonify(data)


def _generate_mjpeg():
    while True:
        frame_bytes = _pipeline.get_latest_jpeg() if _pipeline else None
        if frame_bytes is None:
            time.sleep(0.05)
            continue
        yield (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n\r\n"
            + frame_bytes
            + b"\r\n"
        )
        time.sleep(1 / 30)


def _normalize_source(raw: str) -> "int | str":
    if raw.isdigit():
        return int(raw)
    path = Path(raw)
    if not path.is_absolute():
        path = PROJECT_ROOT / path
    return str(path)


def main() -> None:
    global _pipeline

    parser = argparse.ArgumentParser(description="WildGuard AI — live web stream")
    parser.add_argument("--source", default=None,
                        help="Webcam index (0), video file path, or RTSP URL.")
    parser.add_argument("--model", default=None,
                        help="Path to a .pt model file (default: yolov8n.pt).")
    parser.add_argument("--frame-interval", type=int, default=5,
                        help="Run inference every Nth captured frame (default: 5).")
    parser.add_argument("--port", type=int, default=5000,
                        help="Port for the web server (default: 5000).")
    args = parser.parse_args()

    raw_source  = args.source or os.environ.get("WILDGUARD_SOURCE", "0")
    source      = _normalize_source(raw_source)
    camera_id   = f"cam-{raw_source}" if raw_source != "0" else "cam-00"
    model_path  = PROJECT_ROOT / args.model if args.model else PROJECT_ROOT / "yolov8n.pt"

    _pipeline = WildGuardPipeline(
        source=source,
        model_path=model_path,
        camera_id=camera_id,
        frame_interval=args.frame_interval,
    )

    stop_event = threading.Event()
    _pipeline.start(stop_event)

    model_label = args.model or "yolov8n.pt (default)"
    print(f"[WildGuard] Web server at http://0.0.0.0:{args.port}/")
    print(f"[WildGuard] Source: {source}  |  Model: {model_label}"
          f"  |  Camera: {camera_id}  |  Interval: {args.frame_interval}")

    try:
        app.run(host="0.0.0.0", port=args.port, use_reloader=False, threaded=True)
    finally:
        print("[WildGuard] Shutting down...")
        stop_event.set()
        _pipeline.stop()


if __name__ == "__main__":
    main()
