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
Sign in with your phone number. Until an SMS provider is set up (below), the
one-time code is printed in the backend window and the demo code **123456** also works.

### Real SMS sign-in codes

Pick one provider, put its keys in `.env` (see `.env.example`), and restart the backend.
The code is then texted to whatever number is entered on the login screen, and the
demo code stops working.

| `SMS_PROVIDER` | Cost | Setup | Can also send alerts/broadcasts |
|---|---|---|---|
| `textbee` | Free (50 SMS/day) | Install the TextBee app on an Android phone with a SIM, sign up at textbee.dev, copy the API key → `TEXTBEE_API_KEY` | Yes |
| `smsgate` | Free | Install "SMS Gateway for Android" (sms-gate.app), enable Cloud server, copy username/password → `SMSGATE_USERNAME`/`SMSGATE_PASSWORD` | Yes |
| `twilio_verify` | Trial credit, then paid | Twilio account → Verify service → `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`. Trial accounts only text numbers verified in the console | No (codes only) |
| `twilio` | Paid per SMS | Twilio number → `TWILIO_FROM_NUMBER` plus SID/token | Yes |
| `fast2sms` | Paid (India) | Recharge, copy API key → `FAST2SMS_API_KEY`. Fixed "Your OTP: …" message, +91 only | No (codes only) |

For a student demo, **TextBee** is the easiest: no business registration, and the SMS
comes from your own phone's number. Indian commercial bulk SMS normally requires DLT
registration, which the phone-based gateways avoid for small personal volumes.

With a provider that can send free text, `ALERT_SMS_TO` (ranger numbers) receives a
text for every new high-risk alert and escalation, and `VILLAGER_SMS_TO` receives the
village broadcasts sent from the Deterrence page. `WILDGUARD_USERS` restricts sign-in to
registered numbers.

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
| **Alerts** | High-risk animals go through the existing `AlertManager`: confidence threshold, per-camera cooldown, SQLite log, e-mail (and SMS) with snapshot. An animal that stays in view updates one open alert ("seen 14×") instead of creating new ones; repeats are grouped, with bulk acknowledge/resolve. |
| **Notifications** | Bell with a grouped notification centre (unread badge capped at 9+, ×N counters, filters, mark-all-read). Toasts merge repeats instead of stacking, at most three at once, and hovering pauses them. "Notify me about" sets the threshold. |
| **Deterrence** | Response console run by the server. Species playbooks: elephants get flood lights, then a bee-swarm buzz, before any siren; big cats get strobe and siren; livestock is ignored. Escalation (warn → repel → alert village → rangers) happens while the animal stays, capped at 5 minutes. Manual override auto-reverts after 30 min. The siren is synthesised in the browser on every page (wail, yelp, hi-lo, pulse, bee). Also: hold-to-fire controls, zone targeting, self-test, engagement history with outcomes, and village broadcasts with editable messages and real recipients. |

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
| `WILDGUARD_DEMO_OTP` | `123456` without SMS, off with SMS | Demo login code (empty to disable) |
| `WILDGUARD_USERS` | anyone | Registered numbers allowed to sign in |
| `WILDGUARD_REQUIRE_AUTH` | `1` | Every API call needs a signed-in session |
| `SMS_PROVIDER` + keys | console | Real SMS (see *Real SMS sign-in codes*) |
| `WILDGUARD_RANGER_NAME` | `Sania` | Name shown after sign-in |
| `DETERRENCE_WEBHOOK_URL` | — | POST target for siren/light/broadcast events (relay board, ESP32…) |

**Dashboard → Settings** (saved in `data/wildguard_config.json`): AI sensitivity
(detector threshold), night-vision mode (auto / always / off), night view on live feeds,
AI frame rate, CLIP on/off, e-mail alerts on/off, notification preferences, camera fleet.

> **E-mail:** with credentials in `.env`, each new high-risk incident sends one e-mail.
> While the animal stays in view the same alert is updated rather than re-sent. Switch
> **E-mail alerts** off in Settings while demoing.

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
  auth.py, sms.py      one-time-passcode sign-in, sessions, SMS gateways
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
| `GET /api/deterrence`, `POST /api/deterrence/fire` · `stop` · `extend` · `mode` · `style` · `test`, `GET /api/deterrence/history` · `profiles` | Deterrence console |
| `GET/POST /api/broadcasts` | Villager broadcasts (templates, channels, history) |
| `POST /api/alerts/bulk` | Acknowledge / resolve many alerts |
| `GET/PUT /api/settings` | Settings |
| `GET /api/auth/config`, `POST /api/auth/send-otp` · `verify-otp` · `logout` | Sign-in (sets an HttpOnly session cookie) |
| `GET /stream`, `GET /detections` | Same shape as the original `app.py` (first camera) |

## Notes

* **CPU only** works fine. Two 1080p feeds plus the two-model AI use about half of an
  8-core laptop. Lower the AI frame rate in Settings or pause a camera to reduce load. A
  CUDA build of PyTorch is used automatically when an NVIDIA GPU is present.
* The original tools still work on their own: `py backend/app.py --source …` (single-camera
  web view), `py backend/pipeline.py` (headless) and `py backend/main.py` (OpenCV window).
  They write to the same alert database, so their alerts also appear in the dashboard.
* Voice-call alerts are stored as a preference only; no voice gateway is wired up.
* Deterrence hardware: set `DETERRENCE_WEBHOOK_URL` and every change is POSTed as JSON:
  `{event, siren, lights, pattern, light_mode, zones, duration_s, episode_id, source}`.
  A relay board or ESP32 can switch the siren/lights from that. Use **Self-test** on the
  Deterrence page to check the link.
