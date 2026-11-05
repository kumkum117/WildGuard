# WildGuard AI

Real-time wildlife intrusion detection and early warning for forest-edge villages.
Cameras (or recorded footage) are analysed by a two-stage AI pipeline, by day and by
night. High-risk animals raise alerts (dashboard, e-mail, SQLite log) and trigger
non-lethal deterrence.

## Quick start (Windows)

```bat
start.bat          :: backend + dashboard in dev mode → http://localhost:3000
start.bat prod     :: build the dashboard once, serve everything → http://localhost:5000
```

The first start installs missing dependencies and loads the AI models (~30 s).
Sign in with any phone number and the code **123456**. The real one-time code is
also printed in the backend window.

### Manual start (any OS)

```bash
py -m pip install -r requirements/backend.txt      # python3 -m pip … on macOS/Linux
py backend/server.py                                # API + cameras on http://127.0.0.1:5000

cd frontend
npm install
npm run dev                                         # dashboard on http://localhost:3000
```

`py backend/server.py --host 0.0.0.0` makes the server reachable from other devices on
the LAN (ranger tablets). `--model yolov8n.pt` uses the faster COCO model;
`--no-classifier` disables CLIP species verification.

If the backend is not running, the dashboard still opens in **demo mode** with simulated
data. It switches to live data automatically as soon as the backend is reachable. The
header shows `LIVE`, `DEMO` or `RECONNECTING`.

## What it does

| Area | Features |
|---|---|
| **Live cameras** | Webcams, RTSP/HTTP IP cameras and video files (looped as demo feeds). Smooth annotated MJPEG streams, auto-reconnect, add/pause/remove cameras from Settings. |
| **Detection** | YOLO-World finds animals; CLIP verifies the species on a crop of each box; a tracker confirms an animal after 3 inference frames and votes on its species across frames. 29 species, from tiger, leopard, elephant and gaur to livestock. |
| **Night vision** | Each frame is classed as day / low-light / infrared. Dark frames are denoised, brightened and contrast-equalised before detection; species are named from the original pixels. The dashboard can show the enhanced "night view". |
| **Media analysis** | Upload photos or videos. Images return in seconds with annotated, night-view and original versions. Videos run as background jobs with a live preview, an annotated MP4, a sightings timeline (click to seek) and keyframes. Any uploaded video can become a camera feed. |
| **Alerts** | High-risk animals go through the existing `AlertManager`: confidence threshold, per-camera cooldown, SQLite log and e-mail with snapshot. Acknowledge and resolve from the dashboard. |
| **Deterrence** | Auto mode: HIGH threat → siren + lights, MEDIUM → lights, auto-disarm after 30 s. Manual override, villager broadcasts, optional hardware webhook. |

## How day/night detection works

```
frame ──► lighting check ──► day: as is
                           └► low-light / IR: denoise → gamma lift → CLAHE
          │
          ▼
   YOLO-World proposals (enhanced frame)  ──►  CLIP species check (original pixels)
          │                                             │
          └──────────────► tracker: link boxes across frames, vote on species,
                           confirm after 3 frames ──► sighting / alert / deterrence
```

Measured on the project's own clips (`data/videos/`):

* **Species identity**: YOLO-World alone labels the running cheetah "dog" in 18 of 32
  detections and "cow" in 9 more. This is why `alerts/` was full of `wolf_*.jpg` snapshots. With CLIP
  verification and tracking, the clip resolves to **cheetah** (alert snapshot at 61–70%).
  Cattle are recognised at 0.7–0.98.
* **Night**: the same frames were darkened to four night levels (12 frames). With
  enhancement the engine found **67 animals vs 49** without, and at the darkest level
  animals were only found with enhancement. Species accuracy was **78% vs 71%**.
  Infrared-style footage of the cheetah is identified at 0.66–0.87.

Night results are for simulated darkness. Real IR or low-light camera footage
should be used to confirm them before deployment.

## Configuration

**`.env`** (project root, read by `AlertManager`): `ALERT_EMAIL_FROM`, `ALERT_EMAIL_PASSWORD`,
`ALERT_EMAIL_TO`, `SMTP_HOST`, `SMTP_PORT`, `ALERT_HIGH_RISK_ANIMALS`,
`ALERT_CONFIDENCE_THRESHOLD`, `ALERT_COOLDOWN_SECONDS`. Optional server settings:

| Variable | Default | Purpose |
|---|---|---|
| `WILDGUARD_MODEL` | `models/yolov8s-worldv2.pt` | Detector weights |
| `WILDGUARD_HOST` / `WILDGUARD_PORT` | `127.0.0.1` / `5000` | Bind address |
| `WILDGUARD_TORCH_THREADS` | half the cores, max 8 | CPU threads per inference |
| `WILDGUARD_DEMO_OTP` | `123456` | Demo login code (empty to disable) |
| `WILDGUARD_RANGER_NAME` | `Sania` | Name shown after sign-in |
| `DETERRENCE_WEBHOOK_URL` | — | POST target for siren/light/broadcast events (relay board, ESP32…) |

**Dashboard → Settings** (saved in `data/wildguard_config.json`): AI sensitivity
(detector threshold), night-vision mode (auto / always / off), night view on live feeds,
AI frame rate, CLIP on/off, e-mail alerts on/off, notification preferences, camera fleet.

> **E-mail:** with credentials in `.env`, every high-risk sighting sends an e-mail
> (5-minute cooldown per animal per camera). The demo feed loops a cheetah clip, so a
> running server e-mails every 5 minutes. Switch **E-mail alerts** off in Settings while
> demoing.

## Project structure

```
backend/
  server.py            API server — start here (REST, SSE events, MJPEG, serves the built dashboard)
  wildlife_engine.py   two-stage detection engine (YOLO-World + CLIP), drawing helpers
  night_vision.py      lighting classification + low-light / IR enhancement
  species_classifier.py CLIP zero-shot species verification
  tracker.py           multi-frame tracking + species voting
  camera_manager.py    live camera fleet (built on video_stream.VideoStream)
  media_analyzer.py    image + video upload analysis
  alert_store.py       alert feed / triage on top of alert_manager.AlertManager
  deterrence.py        siren / lights state, auto-response, broadcasts
  event_bus.py         Server-Sent Events hub      settings_store.py  persisted settings
  auth.py              one-time-passcode sign-in
  app.py, pipeline.py, main.py, detector.py, alert_manager.py, video_stream.py
                       original single-camera tools and modules (unchanged, reused)
frontend/src/
  hooks/useSocket.ts   live backend connection (falls back to demo simulation)
  services/backend.ts  API client + mapping to the dashboard's types
  pages/AnalyzePage.tsx, components/Analysis/   media analysis UI
data/videos/           sample clips (used as demo camera feeds)
data/analyses/         uploaded media + results (runtime)
alerts/                alert snapshots (runtime)      wildguard_alerts.db   alert log (runtime)
```

## API

| Method & path | Purpose |
|---|---|
| `GET /api/health`, `GET /api/bootstrap` | Status / everything the dashboard needs at load |
| `GET /api/events` | Server-Sent Events: `detection`, `alert`, `activity`, `cameras`, `deterrence`, `analysis`, `settings` |
| `GET/POST /api/cameras`, `PATCH/DELETE /api/cameras/<id>` | Camera fleet |
| `GET /api/cameras/<id>/stream` · `/snapshot` | Annotated MJPEG stream / latest JPEG |
| `GET /api/alerts`, `POST /api/alerts/<id>/acknowledge` · `resolve` · `reopen`, `GET /api/alerts/<id>/snapshot` | Alerts |
| `POST /api/analyze` (multipart `file`, `night_mode`, `raise_alerts`) | Analyse an image (sync) or video (job) |
| `GET /api/analyses`, `GET/DELETE /api/analyses/<id>`, `POST …/cancel`, `GET …/preview`, `GET …/files/<name>` | Analysis history & files |
| `GET/POST /api/deterrence`, `POST /api/broadcasts` | Deterrence |
| `GET/PUT /api/settings` | Settings |
| `POST /api/auth/send-otp` · `verify-otp` | Sign-in |
| `GET /stream`, `GET /detections` | Same shape as the original `app.py` (first camera) |

## Notes

* **CPU only** works fine. Two 1080p feeds plus the two-model AI use about half of an
  8-core laptop. Lower the AI frame rate in Settings or pause a camera to reduce load. A
  CUDA build of PyTorch is used automatically when an NVIDIA GPU is present.
* The original tools still work on their own: `py backend/app.py --source …` (single-camera
  web view), `py backend/pipeline.py` (headless) and `py backend/main.py` (OpenCV window).
  They write to the same alert database, so their alerts also appear in the dashboard.
* SMS / voice notifications are stored as preferences but need an SMS gateway (e.g. Twilio,
  MSG91). Plug it in at `backend/auth.py::_deliver` and next to the e-mail sender in
  `alert_manager.py`.
