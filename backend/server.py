"""
WildGuard API server — connects the React dashboard to the detection system.

    py backend/server.py                    # http://127.0.0.1:5000
    py backend/server.py --host 0.0.0.0     # reachable from other devices on the LAN
    py backend/server.py --model yolov8n.pt # fast COCO model instead of YOLO-World

What it runs:
  * the live camera fleet (camera_manager) — the two sample clips play as
    demo feeds until you add real webcams / RTSP cameras from Settings;
  * upload analysis for images and videos (media_analyzer);
  * alerts from the existing AlertManager + SQLite DB (alert_store);
  * deterrence state and villager broadcasts (deterrence);
  * a Server-Sent Events stream (/api/events) that pushes everything live.

If frontend/dist exists (npm run build), the dashboard itself is served at
the root URL, so one process is enough. During development run the Vite
dev server instead — it proxies /api to this server.

app.py, pipeline.py and main.py remain available as the original
single-camera tools; they share the same alerts database.
"""

import argparse
import datetime
import os
import sys
import threading
import time
from pathlib import Path

from flask import Flask, Response, g, jsonify, request, send_file

PROJECT_ROOT = Path(__file__).resolve().parents[1]

try:
    from dotenv import load_dotenv
    load_dotenv(PROJECT_ROOT / ".env")
except ImportError:
    pass

from alert_store import AlertStore, ManagedAlertManager
from auth import AuthError, AuthService
from camera_manager import CameraManager, placeholder_jpeg
from deterrence import DeterrenceController
from event_bus import EventBus
from media_analyzer import VIDEO_EXTS, MediaAnalyzer, media_kind
from settings_store import SettingsStore
from sms import build_gateway
from wildlife_engine import WildlifeEngine, classify_threat, sensitivity_to_conf

VERSION = "1.2.0"
FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"
MAX_IMAGE_BYTES = 40 * 1024 * 1024
SESSION_COOKIE = "wg_session"
# Every /api route except these requires a signed-in session (set
# WILDGUARD_REQUIRE_AUTH=0 to switch the check off, e.g. for scripts).
PUBLIC_API = {"/api/health", "/api/auth/config", "/api/auth/send-otp", "/api/auth/verify-otp",
              "/api/auth/logout"}
REQUIRE_AUTH = os.environ.get("WILDGUARD_REQUIRE_AUTH", "1").strip().lower() not in ("0", "false", "no", "off")


class ServerContext:
    """Shared services handed to cameras and the media analyzer."""

    def __init__(self, engine, store, bus, alerts, deterrence) -> None:
        self.engine = engine
        self.store = store
        self.bus = bus
        self.alerts = alerts
        self.deterrence = deterrence
        self.alert_store = None        # set once the camera fleet exists (AlertStore needs its lookup)
        self.started_at = time.time()
        self.settings_snapshot: dict = {}
        self.apply_settings(store.settings)

    def apply_settings(self, settings: dict) -> None:
        self.settings_snapshot = settings          # replaced atomically; workers read it per loop
        self.alerts.email_enabled = settings["email_alerts"]


def resolve_model(arg: "str | None") -> Path:
    for candidate in (arg, os.environ.get("WILDGUARD_MODEL"),
                      "models/yolov8s-worldv2.pt", "yolov8s-worldv2.pt", "yolov8n.pt"):
        if not candidate:
            continue
        path = Path(candidate)
        if not path.is_absolute():
            path = PROJECT_ROOT / path
        if path.exists():
            return path
    raise SystemExit("No model weights found — run backend/download_model.py or pass --model")


def _start_of_today() -> float:
    now = datetime.datetime.now()
    return now.replace(hour=0, minute=0, second=0, microsecond=0).timestamp()


# ----------------------------------------------------------------------
# App
# ----------------------------------------------------------------------

def create_app(ctx: ServerContext, cameras: CameraManager, alert_store: AlertStore,
               analyzer: MediaAnalyzer, auth: AuthService) -> Flask:
    app = Flask(__name__, static_folder=None)
    app.config["MAX_CONTENT_LENGTH"] = 1024 ** 3      # 1 GB uploads
    app.json.sort_keys = False

    def error(message: str, status: int = 400, **extra):
        return jsonify({"error": message, **extra}), status

    def body() -> dict:
        data = request.get_json(silent=True)
        return data if isinstance(data, dict) else {}

    def session_token() -> "str | None":
        header = request.headers.get("Authorization", "")
        if header.startswith("Bearer "):
            return header[7:].strip() or None
        # <img> MJPEG streams and EventSource cannot set headers: cookie (same
        # origin) or ?token= (dashboard served from another origin).
        return request.cookies.get(SESSION_COOKIE) or request.args.get("token") or None

    @app.before_request
    def require_session():
        g.user = auth.user_for(session_token())
        if not REQUIRE_AUTH or request.method == "OPTIONS":
            return None
        path = request.path
        protected = (path.startswith("/api/") and path not in PUBLIC_API) or path in ("/stream", "/detections")
        if protected and g.user is None:
            return error("Sign in required", 401, code="auth_required")
        return None

    @app.after_request
    def cors(resp):
        resp.headers["Access-Control-Allow-Origin"] = "*"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
        # Lets the dashboard tell a real backend answer from a dev-proxy error page.
        resp.headers["X-WildGuard"] = VERSION
        resp.headers["Access-Control-Expose-Headers"] = "X-WildGuard"
        return resp

    @app.errorhandler(AuthError)
    def auth_error(exc: AuthError):
        resp = jsonify(exc.to_dict())
        if exc.extra.get("retry_after"):
            resp.headers["Retry-After"] = str(exc.extra["retry_after"])
        return resp, exc.status

    @app.route("/api/<path:_any>", methods=["OPTIONS"])
    def preflight(_any):
        return "", 204

    @app.errorhandler(413)
    def too_large(_e):
        return error("File too large (limit 1 GB)", 413)

    def mjpeg(next_frame, finished=lambda: False, offline_text="NO SIGNAL"):
        def generate():
            seq, last_sent = -1, 0.0
            placeholder = placeholder_jpeg(offline_text, "WildGuard AI")
            while True:
                new_seq, jpeg = next_frame(seq)       # blocks ≤ 1 s waiting for a new frame
                fresh = new_seq != seq
                seq = new_seq
                if jpeg is not None and fresh:
                    jpeg_out = jpeg
                elif jpeg is None and time.time() - last_sent >= 1.0 and not finished():
                    jpeg_out = placeholder               # also lets us notice closed clients
                elif finished():
                    return
                else:
                    continue
                last_sent = time.time()
                yield (b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: "
                       + str(len(jpeg_out)).encode() + b"\r\n\r\n" + jpeg_out + b"\r\n")

        return Response(generate(), mimetype="multipart/x-mixed-replace; boundary=frame",
                        headers={"Cache-Control": "no-cache, no-store", "X-Accel-Buffering": "no"})

    # ------------------------------------------------------------------
    # System
    # ------------------------------------------------------------------

    def health() -> dict:
        online, total = cameras.counts()
        alerts = ctx.alerts
        return {
            "status": "ok",
            "version": VERSION,
            "server_time": time.time(),
            "started_at": ctx.started_at,
            "uptime_s": round(time.time() - ctx.started_at, 1),
            "engine": ctx.engine.info(),
            "detection_threshold": sensitivity_to_conf(ctx.settings_snapshot["sensitivity"]),
            "cameras": {"online": online, "total": total},
            "alerts": {
                "today": alert_store.count_since(_start_of_today()),
                "email_configured": alerts.email_configured,
                "email_enabled": alerts.email_enabled,
                "high_risk_animals": sorted(alerts.high_risk_animals),
                "confidence_threshold": alerts.confidence_threshold,
                "cooldown_seconds": alerts.cooldown_seconds,
            },
            "settings": ctx.settings_snapshot,
            "clients": ctx.bus.subscriber_count,
        }

    @app.get("/api/health")
    def get_health():
        if REQUIRE_AUTH and g.user is None:
            # Enough for launch scripts and the login screen; details need a session.
            return jsonify({"status": "ok", "version": VERSION, "auth_required": True})
        return jsonify(health())

    @app.get("/api/bootstrap")
    def bootstrap():
        """Everything a freshly opened dashboard needs, in one request."""
        return jsonify({
            "health": health(),
            "cameras": cameras.list(),
            "alerts": alert_store.list(200),
            "detections": list(ctx.bus.detections)[:100],
            "activity": list(ctx.bus.activity)[:60],
            "deterrence": ctx.deterrence.get(),
            "settings": ctx.settings_snapshot,
            "analyses": analyzer.list(20),
        })

    @app.get("/api/events")
    def events():
        return Response(
            ctx.bus.sse_stream(hello={"server_time": time.time(), "version": VERSION}),
            mimetype="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    # ------------------------------------------------------------------
    # Auth
    # ------------------------------------------------------------------

    @app.get("/api/auth/config")
    def auth_config():
        return jsonify(auth.config())

    @app.post("/api/auth/send-otp")
    def send_otp():
        return jsonify(auth.send_otp(str(body().get("phone", ""))))

    @app.post("/api/auth/verify-otp")
    def verify_otp():
        data = body()
        session = auth.verify_otp(str(data.get("phone", "")), str(data.get("otp", "")))
        ctx.bus.log("auth", f"{session['user']['role'].title()} {session['user']['name']} signed in", "info")
        resp = jsonify(session)
        resp.set_cookie(SESSION_COOKIE, session["token"], max_age=int(session["expires_at"] - time.time()),
                        httponly=True, samesite="Lax", path="/")
        return resp

    @app.post("/api/auth/logout")
    def logout():
        auth.logout(session_token())
        resp = jsonify({"ok": True})
        resp.delete_cookie(SESSION_COOKIE, path="/")
        return resp

    @app.get("/api/auth/me")
    def me():
        return jsonify(g.user) if g.user else error("Not signed in", 401, code="auth_required")

    # ------------------------------------------------------------------
    # Cameras
    # ------------------------------------------------------------------

    @app.get("/api/cameras")
    def list_cameras():
        return jsonify(cameras.list())

    @app.post("/api/cameras")
    def add_camera():
        try:
            return jsonify(cameras.add(body())), 201
        except ValueError as exc:
            return error(str(exc))

    @app.patch("/api/cameras/<camera_id>")
    def update_camera(camera_id):
        try:
            cam = cameras.update(camera_id, body())
        except ValueError as exc:
            return error(str(exc))
        return jsonify(cam) if cam else error("Camera not found", 404)

    @app.delete("/api/cameras/<camera_id>")
    def delete_camera(camera_id):
        return ("", 204) if cameras.remove(camera_id) else error("Camera not found", 404)

    @app.get("/api/cameras/<camera_id>/stream")
    def camera_stream(camera_id):
        worker = cameras.get(camera_id)
        if worker is None:
            return error("Camera not found", 404)
        text = "CAMERA PAUSED" if not worker.config.get("enabled", True) else "NO SIGNAL"
        return mjpeg(lambda seq: worker.wait_jpeg(seq, 1.0),
                     finished=lambda: cameras.get(camera_id) is not worker,
                     offline_text=text)

    @app.get("/api/cameras/<camera_id>/snapshot")
    def camera_snapshot(camera_id):
        worker = cameras.get(camera_id)
        if worker is None:
            return error("Camera not found", 404)
        jpeg = worker.latest_jpeg()
        if jpeg is None:
            jpeg = placeholder_jpeg("CAMERA PAUSED" if not worker.config.get("enabled", True) else "NO SIGNAL",
                                    worker.name)
        return Response(jpeg, mimetype="image/jpeg", headers={"Cache-Control": "no-cache, no-store"})

    @app.get("/api/sources")
    def video_sources():
        """Video files that can be used as camera feeds."""
        out = []
        sample_dir = PROJECT_ROOT / "data" / "videos"
        for p in sorted(sample_dir.glob("*")) if sample_dir.exists() else []:
            if p.suffix.lower() in VIDEO_EXTS:
                out.append({"path": p.relative_to(PROJECT_ROOT).as_posix(), "name": p.name,
                            "group": "Sample videos", "size_mb": round(p.stat().st_size / 1e6, 1)})
        for item in analyzer.list(100):
            if item["kind"] == "video" and item.get("source_path"):
                p = PROJECT_ROOT / item["source_path"]
                if p.exists():
                    out.append({"path": item["source_path"], "name": item["filename"],
                                "group": "Uploaded videos", "size_mb": round(p.stat().st_size / 1e6, 1)})
        return jsonify(out)

    # ------------------------------------------------------------------
    # Detections / activity
    # ------------------------------------------------------------------

    @app.get("/api/detections")
    def list_detections():
        limit = request.args.get("limit", 100, type=int)
        return jsonify(list(ctx.bus.detections)[:limit])

    @app.get("/api/activity")
    def list_activity():
        limit = request.args.get("limit", 60, type=int)
        return jsonify(list(ctx.bus.activity)[:limit])

    # ------------------------------------------------------------------
    # Alerts
    # ------------------------------------------------------------------

    @app.get("/api/alerts")
    def list_alerts():
        return jsonify(alert_store.list(request.args.get("limit", 200, type=int)))

    @app.get("/api/alerts/<int:alert_id>")
    def get_alert(alert_id):
        alert = alert_store.get(alert_id)
        return jsonify(alert) if alert else error("Alert not found", 404)

    @app.post("/api/alerts/bulk")
    def alerts_bulk():
        """{action: acknowledge|resolve, ids?: [..]} — without ids: every open alert."""
        data = body()
        status = {"acknowledge": "acknowledged", "resolve": "resolved"}.get(str(data.get("action")))
        if status is None:
            return error("action must be acknowledge or resolve")
        ids = data.get("ids")
        if ids is None:
            scope = ("active",) if status == "acknowledged" else ("active", "acknowledged")
            ids = alert_store.ids_with_status(scope)
        try:
            ids = [int(i) for i in ids][:5000]
        except (TypeError, ValueError):
            return error("ids must be a list of alert ids")
        changed = alert_store.set_status_many(ids, status)
        if changed:
            who = g.user["name"] if g.user else "Operator"
            ctx.bus.log("alert", f"{who} {status} {len(changed)} alert{'s' if len(changed) != 1 else ''}",
                        "success" if status == "resolved" else "info")
        return jsonify({"updated": len(changed), "status": status})

    @app.post("/api/alerts/<int:alert_id>/<action>")
    def alert_action(alert_id, action):
        status = {"acknowledge": "acknowledged", "resolve": "resolved", "reopen": "active"}.get(action)
        if status is None:
            return error("Unknown action", 404)
        alert = alert_store.set_status(alert_id, status)
        if alert is None:
            return error("Alert not found", 404)
        ctx.bus.log("alert", f"Alert #{alert_id} ({alert['animal'].title()}) {status}",
                    "success" if status == "resolved" else "info")
        return jsonify(alert)

    @app.get("/api/alerts/<int:alert_id>/snapshot")
    def alert_snapshot(alert_id):
        path = alert_store.snapshot_path(alert_id)
        if path is None:
            return error("No snapshot for this alert", 404)
        return send_file(path, mimetype="image/jpeg", max_age=3600)

    # ------------------------------------------------------------------
    # Deterrence
    # ------------------------------------------------------------------

    @app.get("/api/deterrence")
    def get_deterrence():
        return jsonify(ctx.deterrence.get())

    @app.post("/api/deterrence")
    def set_deterrence():
        return jsonify(ctx.deterrence.update(body()))

    @app.post("/api/broadcasts")
    def broadcast():
        kind = str(body().get("type", "")).strip()
        if not kind:
            return error("Broadcast type is required")
        return jsonify(ctx.deterrence.broadcast(kind)), 201

    # ------------------------------------------------------------------
    # Settings
    # ------------------------------------------------------------------

    @app.get("/api/settings")
    def get_settings():
        return jsonify(ctx.settings_snapshot)

    @app.put("/api/settings")
    def put_settings():
        try:
            settings = ctx.store.update(body())
        except (TypeError, ValueError) as exc:
            return error(f"Invalid settings: {exc}")
        ctx.apply_settings(settings)
        ctx.bus.publish("settings", settings)
        return jsonify(settings)

    # ------------------------------------------------------------------
    # Upload analysis
    # ------------------------------------------------------------------

    @app.post("/api/analyze")
    def analyze():
        upload = request.files.get("file")
        if upload is None or not upload.filename:
            return error("No file uploaded")
        kind = media_kind(upload.filename, upload.mimetype or "")
        options = request.form.to_dict()
        try:
            if kind == "image":
                data = upload.read(MAX_IMAGE_BYTES + 1)
                if len(data) > MAX_IMAGE_BYTES:
                    return error("Image too large (limit 40 MB)", 413)
                return jsonify(analyzer.analyze_image(data, upload.filename, options))
            if kind == "video":
                return jsonify(analyzer.submit_video(upload, upload.filename, options)), 202
        except ValueError as exc:
            return error(str(exc), 422)
        return error("Unsupported file type — upload an image (JPG, PNG, WebP…) or a video (MP4, AVI, MOV…)", 415)

    @app.get("/api/analyses")
    def list_analyses():
        return jsonify(analyzer.list(request.args.get("limit", 50, type=int)))

    @app.get("/api/analyses/<aid>")
    def get_analysis(aid):
        data = analyzer.get(aid)
        return jsonify(data) if data else error("Analysis not found", 404)

    @app.delete("/api/analyses/<aid>")
    def delete_analysis(aid):
        return ("", 204) if analyzer.delete(aid) else error("Analysis not found", 404)

    @app.post("/api/analyses/<aid>/cancel")
    def cancel_analysis(aid):
        job = analyzer.cancel(aid)
        return jsonify(job) if job else error("No running job with that id", 404)

    @app.get("/api/analyses/<aid>/preview")
    def analysis_preview(aid):
        job = analyzer.job(aid)
        if job is None:
            return error("No running job with that id", 404)
        return mjpeg(lambda seq: job.wait_preview(seq, 1.0),
                     finished=lambda: job.done.is_set(), offline_text="QUEUED")

    @app.get("/api/analyses/<aid>/files/<name>")
    def analysis_file(aid, name):
        path = analyzer.file_path(aid, name)
        if path is None:
            return error("File not found", 404)
        return send_file(path, conditional=True, max_age=3600)

    # ------------------------------------------------------------------
    # Legacy endpoints (same shape as app.py) — first camera
    # ------------------------------------------------------------------

    @app.get("/stream")
    def legacy_stream():
        cams = cameras.list()
        return camera_stream(cams[0]["id"]) if cams else error("No cameras", 404)

    @app.get("/detections")
    def legacy_detections():
        cams = cameras.list()
        worker = cameras.get(cams[0]["id"]) if cams else None
        if worker is None:
            return jsonify([])
        with worker._overlay_lock:
            overlay = [d for d in worker._overlay if d.get("confirmed")]
        return jsonify([{"label": d["label"], "confidence": d["confidence"], "bbox": d["bbox"],
                         "threat_level": d["threat_level"], "snapshot": None} for d in overlay])

    # ------------------------------------------------------------------
    # Dashboard (production build)
    # ------------------------------------------------------------------

    @app.get("/")
    @app.get("/<path:path>")
    def frontend(path: str = ""):
        if path.startswith("api/"):
            return error("Not found", 404)
        index = FRONTEND_DIST / "index.html"
        if not index.exists():
            return (
                "<h2>WildGuard API is running.</h2><p>The dashboard has not been built. "
                "Run <code>npm run dev</code> in <code>frontend/</code> and open "
                "<a href='http://localhost:3000'>http://localhost:3000</a>, or "
                "<code>npm run build</code> to serve it from here.</p>"
            )
        target = (FRONTEND_DIST / path).resolve()
        if path and target.is_file() and FRONTEND_DIST.resolve() in target.parents:
            return send_file(target)
        return send_file(index)

    return app


# ----------------------------------------------------------------------
# Entry point
# ----------------------------------------------------------------------

def main() -> None:
    # Windows consoles default to cp1252; never let a log line crash the server.
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(errors="replace")
        except (AttributeError, ValueError):
            pass

    parser = argparse.ArgumentParser(description="WildGuard API server")
    parser.add_argument("--host", default=os.environ.get("WILDGUARD_HOST", "127.0.0.1"),
                        help="Interface to bind (default 127.0.0.1; use 0.0.0.0 for LAN access)")
    parser.add_argument("--port", type=int, default=int(os.environ.get("WILDGUARD_PORT", "5000")))
    parser.add_argument("--model", default=None, help="Path to .pt weights (default: models/yolov8s-worldv2.pt)")
    parser.add_argument("--no-classifier", action="store_true", help="Disable CLIP species verification")
    args = parser.parse_args()

    model_path = resolve_model(args.model)
    print(f"[WildGuard] Loading {model_path.name} — first start can take ~30 s ...")
    engine = WildlifeEngine(model_path, use_classifier=not args.no_classifier)
    engine.warmup()

    bus = EventBus()
    store = SettingsStore()
    alerts = ManagedAlertManager()
    deterrence = DeterrenceController(bus)
    ctx = ServerContext(engine, store, bus, alerts, deterrence)

    stop = threading.Event()
    cameras = CameraManager(ctx)
    alert_store = AlertStore(alerts.db_path, bus, cameras.lookup, classify_threat)
    alert_store.start_watcher(stop)
    ctx.alert_store = alert_store
    analyzer = MediaAnalyzer(ctx)
    auth = AuthService(build_gateway())

    info = engine.info()
    bus.log("system", f"WildGuard server started — {info['model_type']} on {info['device'].upper()}"
                      + (" + CLIP species verification" if info["classifier_enabled"] else ""), "success")
    cameras.start_all()
    cameras.start_status_publisher(stop)

    app = create_app(ctx, cameras, alert_store, analyzer, auth)
    url = f"http://{'localhost' if args.host in ('127.0.0.1', '0.0.0.0') else args.host}:{args.port}"
    print(f"[WildGuard] API ready at {url}/api/health")
    if (FRONTEND_DIST / "index.html").exists():
        print(f"[WildGuard] Dashboard at {url}/")
    else:
        print("[WildGuard] Dashboard: run `npm run dev` in frontend/ and open http://localhost:3000")

    try:
        app.run(host=args.host, port=args.port, threaded=True, use_reloader=False)
    finally:
        print("[WildGuard] Shutting down...")
        stop.set()
        cameras.stop_all()
        deterrence.shutdown()
        alerts.shutdown(timeout=5)


if __name__ == "__main__":
    main()
