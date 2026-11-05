# WildGuard AI — Complete Project Report
**Prepared for presentation | May 2026**

---

## 1. WHAT IS WILDGUARD?

WildGuard AI is a **real-time wildlife intrusion detection and early-warning system** built to protect villages, farms, and forest corridors from dangerous animal encounters. The system uses computer-vision AI cameras placed around a forest perimeter to detect wildlife, classify the threat level, alert rangers through a web dashboard, send email notifications, and automatically trigger non-lethal deterrents (sirens and strobe lights) to drive animals back into the forest.

**The problem it solves:** In areas like Bannerghatta (Karnataka), wildlife regularly enters villages at night, injuring livestock and sometimes people. Rangers cannot watch every camera feed manually. WildGuard automates that surveillance — every frame of video is analyzed by an AI model, and only confirmed high-risk animals raise an alarm.

---

## 2. SYSTEM ARCHITECTURE (BIG PICTURE)

```
CAMERAS (video feed)
        ↓
  [VideoStream] — captures frames continuously, thread-safe
        ↓
  [WildGuardDetector] — runs YOLOv8 / YOLO-World AI model
        ↓  (detections with bounding boxes + confidence)
  [WildGuardPipeline] — the central coordinator
     ├── [AlertManager] — filters, cooldowns, SQLite DB, email dispatch
     └── [Flask API] — serves annotated MJPEG stream + JSON detections
              ↓ (HTTP)
  [React Frontend] — dashboard, live camera, alerts, deterrence controls
```

The backend and frontend are **decoupled** — the backend exposes HTTP endpoints, and the React frontend will connect to them. Currently the frontend runs with a **realistic simulation** (mock socket) while waiting for the backend to be deployed, so you can demonstrate the full UI without real cameras.

---

## 3. BACKEND — PYTHON / AI ENGINE

### 3.1 Files and their purpose

| File | Role |
|---|---|
| `backend/detector.py` | Loads the YOLO model, runs inference on each frame, classifies threat level |
| `backend/video_stream.py` | Reads frames from webcam / video file / RTSP URL in a background thread |
| `backend/pipeline.py` | Wires VideoStream + Detector + AlertManager into one continuous loop |
| `backend/alert_manager.py` | Filters detections, logs to SQLite, sends email alerts |
| `backend/app.py` | Flask web server — exposes `/stream` (MJPEG) and `/detections` (JSON) |
| `backend/main.py` | Alternative entry point |
| `backend/clean_dataset.py` | Dataset cleaning utility |
| `backend/download_model.py` | Downloads the YOLO model weights |
| `backend/test_alert.py` | Tests the alert email system |

---

### 3.2 AI Detection — `detector.py`

**What it does:** Takes a single video frame (a numpy array from OpenCV), runs the YOLO neural network on it, and returns a list of detected animals with their bounding boxes, confidence scores, and threat levels.

**Two model types supported:**

| Model | File | How it works |
|---|---|---|
| **YOLOv8n** | `yolov8n.pt` | Classic YOLO — fast, detects a fixed set of 80 COCO classes (dog, cat, cow, horse, sheep) |
| **YOLO-World v2** | `yolov8s-worldv2.pt` | Open-vocabulary YOLO — you give it a list of text class names (leopard, tiger, wolf…) and it finds them |

**The detection flow:**
1. Model runs `predict()` on the frame
2. For each detected bounding box, check if the label is in the target animal list
3. Apply a **frame counter threshold** (default: 3 frames) — an animal must appear in 3 consecutive frames before it's considered confirmed. This eliminates false positives from single-frame glitches.
4. If confirmed, classify the threat level and return the detection

**Threat classification:**
```python
HIGH   → cheetah, lion, leopard, tiger, crocodile, wolf, bear
MEDIUM → elephant, rhinoceros, hippopotamus, buffalo, dog, cow, horse, hyena
LOW    → deer, antelope, monkey, and anything else detected
```

**Bounding box annotation:** The detector uses OpenCV to draw colored rectangles on the frame:
- RED = HIGH threat
- ORANGE = MEDIUM threat
- GREEN = LOW threat

**Alert snapshot:** When a HIGH-threat animal is confirmed, the detector saves a JPEG snapshot of that exact frame to the `alerts/` directory (filename: `wolf_1778852154.jpg` format).

---

### 3.3 Video Stream — `video_stream.py`

**What it does:** Reads video frames in a background thread and makes the latest frame available to the detection pipeline without blocking.

**Key design decisions:**
- **Threaded capture:** Reading from a camera is slow (waiting for the next frame). By running it in a background daemon thread, the main loop never has to wait.
- **Frame interval:** Only every Nth frame (default: every 5th) is passed to the AI model. This is called **frame skipping** — it saves huge amounts of GPU/CPU compute without missing animals because animals move slowly relative to 30fps video.
- **Reconnection logic:** If the camera disconnects (network drop, RTSP timeout), the stream automatically retries with **exponential backoff** (2s → 4s → 8s… up to 60s). This means the system self-heals without needing a restart.
- **Input sources:** Accepts webcam index (0, 1, 2), local video file path, or RTSP URL (IP camera on a network).

---

### 3.4 Pipeline — `pipeline.py`

The `WildGuardPipeline` class coordinates all three modules. It is the single object that `app.py` (or any script) uses.

**Thread safety:** The pipeline runs its detection loop on a **daemon thread**. The Flask server runs on another thread. They share `_latest_jpeg` and `_latest_detections` through a `threading.Lock()` — this prevents data corruption when one thread is writing while another is reading.

**The detection loop (runs every frame):**
1. Get the latest frame from `VideoStream`
2. Run `WildGuardDetector.process_frame()` → get annotated frame + detections
3. For every HIGH-threat detection → call `AlertManager.trigger()`
4. Encode annotated frame as JPEG → store in `_latest_jpeg` for the web stream
5. Store detection list in `_latest_detections` for the `/detections` JSON endpoint

**Error isolation:** Detection errors only skip that one frame (`continue`). Alert dispatch errors are caught and logged but never stop the video loop. The system is designed to keep running even if something goes wrong.

---

### 3.5 Alert Manager — `alert_manager.py`

This is the most sophisticated backend module. It handles filtering, deduplication, persistence, and notification.

**The 5-step filter chain (every trigger() call goes through all 5):**

1. **Animal filter** — Is this animal in the `high_risk_animals` list? If not, skip.
2. **Confidence filter** — Is the model's confidence above the threshold (default: 60%)? If not, skip.
3. **Cooldown check** — Has enough time passed since the last alert for **this exact (camera, animal) pair**? Default cooldown is 300 seconds (5 minutes). This prevents a wolf that stays at the perimeter from sending 100 emails in 10 minutes. **Importantly, the cooldown is per (camera, animal) pair** — a wolf on CAM-01 doesn't block a tiger alert on CAM-01.
4. **Log to SQLite** — Write the alert to the database IMMEDIATELY, before sending email. This means there's always a record even if email fails.
5. **Fire email on daemon thread** — Email sending happens on a background thread so it never delays the detection loop. After sending, the thread updates `email_sent=1` in the database.

**SQLite database schema (`wildguard_alerts.db`):**
```sql
CREATE TABLE alerts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    animal      TEXT,
    confidence  REAL,
    timestamp   REAL,
    camera_id   TEXT,
    snapshot    TEXT,    -- path to the saved JPEG
    email_sent  INTEGER, -- 0 = failed/pending, 1 = sent
    logged_at   TEXT
)
```

**Email format:**
- Subject: `[WildGuard] HIGH ALERT: Wolf detected on cam-00`
- Body: animal name, confidence %, camera ID, timestamp
- Attachment: snapshot JPEG if one was saved

**Configuration via `.env` file:**
```
ALERT_EMAIL_FROM=sender@gmail.com
ALERT_EMAIL_PASSWORD=your_app_password
ALERT_EMAIL_TO=ranger@example.com
ALERT_CONFIDENCE_THRESHOLD=0.6
ALERT_COOLDOWN_SECONDS=300
ALERT_HIGH_RISK_ANIMALS=tiger,wolf,bear,leopard
```

---

### 3.6 Flask Web Server — `app.py`

Exposes three HTTP endpoints:

| Route | Method | Returns |
|---|---|---|
| `/` | GET | HTML page with live video feed and detection JSON viewer |
| `/stream` | GET | **MJPEG stream** — a continuous multipart HTTP response, each part is a JPEG frame. This is how IP cameras stream video over HTTP. |
| `/detections` | GET | JSON array of the latest detections: `[{label, confidence, bbox, threat_level, snapshot}]` |

**MJPEG streaming** is the key technique: the server keeps the HTTP connection open and continuously pushes new JPEG frames with the multipart boundary `--frame`. Any `<img src="/stream">` tag in a browser will display it as live video.

**Command line arguments:**
```bash
python app.py --source 0             # webcam
python app.py --source data/videos/clip.mp4
python app.py --source rtsp://192.168.1.10:554/stream
python app.py --model models/yolov8s-worldv2.pt
python app.py --frame-interval 3    # run AI every 3rd frame
python app.py --port 8080
```

---

### 3.7 AI Models

| Model | Size | Speed | Best for |
|---|---|---|---|
| `yolov8n.pt` (nano) | 6 MB | Very fast, runs on CPU | Basic animal detection (dog, cat, cow, horse, sheep from COCO classes) |
| `yolov8s-worldv2.pt` (small-world) | ~44 MB | Moderate speed | Open-vocabulary wildlife detection — finds any animal you name in text |

**What is YOLOv8?** YOLO stands for "You Only Look Once." It's a neural network architecture that processes the entire image in a single forward pass (unlike older two-stage detectors) to simultaneously predict bounding boxes and class labels. YOLOv8 (2023, by Ultralytics) is the current industry standard for real-time object detection.

**What is YOLO-World?** An extension of YOLOv8 that replaces fixed class labels with a text encoder. Instead of being trained only on 80 COCO classes, you can give it any list of class names at runtime. For WildGuard this means you can detect `["leopard", "tiger", "wolf"]` without retraining the model.

**Why both models?** `yolov8n` is the fallback — it runs on any machine without GPU. `yolov8s-worldv2` is used when you need species-level wildlife detection and have enough compute.

---

### 3.8 Real Alert Data

The `alerts/` directory contains **real snapshots** from actual detection runs — 39 JPEG images named `wolf_<timestamp>.jpg`, all captured during testing when the system detected wolves in the test video footage. These are real outputs from the AI model running on the `yolov8s-worldv2.pt` model.

---

## 4. FRONTEND — REACT WEB DASHBOARD

### 4.1 Technology Stack

| Technology | Version | Purpose |
|---|---|---|
| **React** | 18.3 | UI component framework |
| **TypeScript** | 5.6 | Type-safe JavaScript |
| **Vite** | 5.4 | Build tool and dev server (replaces Webpack, extremely fast) |
| **Tailwind CSS** | 3.4 | Utility-first CSS framework |
| **Zustand** | 5.0 | Lightweight global state management |
| **Framer Motion** | 11.x | Animations and transitions |
| **React Router DOM** | 6.28 | Client-side routing (SPA navigation) |
| **Lucide React** | 0.460 | SVG icon library |
| **clsx + tailwind-merge** | latest | Conditional className utilities |

**Why Vite over Create React App?** Vite uses ES modules natively and only transforms files on demand. Dev server starts in under 300ms. CRA bundles everything first, which takes seconds.

**Why Zustand over Redux?** Zustand is ~1KB, requires zero boilerplate (no actions, reducers, dispatch). You define state and setters in one function. Redux is more powerful for very large apps but overkill here.

---

### 4.2 Project Structure

```
frontend/src/
├── pages/           6 page-level components (one per route)
├── components/
│   ├── Auth/        LoginScreen, OTPScreen, AuthLayout
│   ├── Common/      Shared: AnimatedCounter, GlowingBadge, LoadingSpinner, NotificationCard
│   ├── Dashboard/   QuickStats, LiveCameraPanel, MapSection, StatusIndicator, RecentAlerts, ActivityFeed
│   ├── Detection/   DetectionMonitor, CameraFeed, DetectionTimeline, EventStream
│   ├── Alerts/      AlertManagement, AlertCard, AlertFilter, AlertDetailModal
│   ├── Deterrence/  DeterrenceControl, SirenToggle, LightToggle, SystemStatus
│   ├── Layout/      Header, Sidebar
│   └── Settings/    NotificationSettings, CameraManagement, AccountSettings
├── hooks/           useAuth, useAlerts, useSocket, useDetections, useDeterrence
├── store/           authStore, alertStore, detectionStore, activityStore, deterrenceStore, toastStore
├── services/        authService, api, socketService, detectionService, alertService
├── utils/           cn, constants, formatters, validators, mockData
└── types/           index.ts — all TypeScript interfaces
```

---

### 4.3 Authentication Flow

**How it works:**

1. User opens the app → `RequireAuth` component checks `isAuthenticated` in the auth store → if not authenticated, redirect to `/login`
2. Login page shows `AuthLayout` (forest background split-screen) + `LoginScreen`
3. User enters phone number → validated with `isValidPhone()` regex → `sendOtp()` called
4. `authService.sendOtp()` simulates 700ms network delay → sets `pendingPhone` in store
5. UI switches to `OTPScreen` — 6 input boxes, auto-focus, auto-advance, paste support
6. User enters OTP → `verifyOtp()` called → `authService.verifyOtp()` simulates 800ms → returns a mock JWT token + User object
7. `setSession(token, user)` writes token to localStorage and sets `isAuthenticated = true`
8. `RequireAuth` now passes, user lands on dashboard

**Auth persistence:** The `authStore` uses **Zustand persist middleware** — session is saved to `localStorage` key `wg-auth`. Refreshing the page keeps you logged in.

**Demo credentials:** Any 6-digit OTP works. The demo code `123456` is shown as a subdued footnote on the OTP screen.

**Why OTP instead of password?** OTP is better for rangers in the field — no password to remember or forget, works from any device, tied to phone number.

---

### 4.4 Routing (`App.tsx`)

React Router DOM v6 with `<Routes>` and `<Route>`:

| Path | Page | Protected? |
|---|---|---|
| `/login` | LoginPage | No |
| `/` | DashboardPage | Yes |
| `/detection` | DetectionPage | Yes |
| `/alerts` | AlertsPage | Yes |
| `/deterrence` | DeterrencePage | Yes |
| `/settings` | SettingsPage | Yes |
| `*` | → redirect to `/` | — |

All protected routes are wrapped in `RequireAuth` → `Shell` (Sidebar + Header + main content area). The shell margin-left is `lg:ml-60` to account for the 240px fixed sidebar on desktop.

`AnimatePresence` from Framer Motion wraps the routes so pages fade/slide in when navigating.

---

### 4.5 State Management — Zustand Stores

**6 stores**, each covering one domain:

#### `authStore`
```
user, token, isAuthenticated, pendingPhone
→ setSession(), logout(), setPendingPhone()
→ Persisted to localStorage via zustand/middleware/persist
```

#### `detectionStore`
```
cameras[], detections[], threatState
→ setCameras(), addDetection(), setThreatState()
→ Keeps last 100 detections (slice to 100)
```

#### `alertStore`
```
alerts[], filter, search
→ setAlerts(), addAlert(), acknowledge(), resolve(), setFilter(), setSearch()
→ Keeps last 200 alerts
```

#### `activityStore`
```
events[]  (detection, alert, system, deterrence, auth types)
→ setEvents(), push()
→ Keeps last 60 events
```

#### `deterrenceStore`
```
siren, lights, sound, mode ('auto'|'manual'), countdownSec
→ setSiren(), setLights(), setSound(), setMode(), setCountdown(), reset()
```

#### `toastStore` (added during this session)
```
toasts[]  (id, title, message, level, duration)
→ push(), dismiss()
→ Auto-dismisses after 5 seconds (or custom duration)
```

---

### 4.6 The Simulated Socket — `useSocket.ts` & `socketService.ts`

Because the backend is not yet connected to the frontend via WebSocket, all real-time behavior is simulated.

**MockSocket class** (`socketService.ts`): A minimal event emitter that mirrors the socket.io client API (`on`, `emit`, `connect`, `disconnect`, `scheduleInterval`). When the real backend is ready, this entire file can be replaced with `socket.io-client` and the rest of the code stays the same.

**`useSocket(enabled)` hook:** Called in `App.tsx` when the user is authenticated:
1. Generates 6 cameras from `CAMERA_LOCATIONS`
2. Seeds 8 back-dated alerts
3. Seeds 14 activity events
4. Starts two intervals:
   - **Every 30 seconds:** Generate a random detection → update stores → check threat level → if auto mode, trigger deterrence
   - **Every 45 seconds:** Generate a system heartbeat activity event

**The stale closure bug we fixed:** Originally `mode` (auto/manual) was captured once when the effect mounted. So changing the mode switch had no effect on whether deterrence auto-fired. Fixed by reading `useDeterrenceStore.getState().mode` directly inside the interval callback — this reads the **current** store value, not the stale captured value.

---

### 4.7 Data Generation — `mockData.ts`

All simulated data is generated procedurally:

**`generateCameras()`** — Creates 6 camera objects from `CAMERA_LOCATIONS` (real GPS coordinates near Bannerghatta):
- North Perimeter (12.967°N, 77.587°E)
- Village Gate (12.965°N, 77.590°E)
- River Bend (12.970°N, 77.583°E)
- East Watchtower (12.972°N, 77.595°E)
- South Fence (12.962°N, 77.589°E) — set to `maintenance` status
- Forest Trail (12.974°N, 77.582°E)

**`generateDetection(cameras)`** — Picks a random camera and random species, generates a random bounding box (x, y, w, h as fractions 0–1), confidence 70–99%.

**`generateAlert(cameras)`** — Generates a full alert object with ID, animal, threat level, camera, location, confidence, timestamp, status.

**`generateActivity(cameras, type?)`** — Generates one activity event with a type-appropriate message.

---

### 4.8 Pages In Detail

#### Dashboard (`/`)
**Components:** QuickStats → LiveCameraPanel + MapSection → StatusIndicator + ActivityFeed → RecentAlerts

- **QuickStats:** 4 stat cards. "Active cameras" and "Alerts today" are live from stores. "AI confidence" and "System uptime" are currently display values.
- **LiveCameraPanel:** 16:10 aspect ratio main camera view with a strip of 6 thumbnail selectors at the bottom. Shows real-time bounding box overlays, species name + confidence, GPS coordinates, and HUD overlays (LIVE badge, clock, threat state). The main camera switches when you click a thumbnail.
- **MapSection:** SVG-based topographic map of the Bannerghatta area. Shows 3 geo-fence zones (Village Safe Zone in green, Forest Buffer in amber, Deep Wild in red), camera pin locations, and pulsing alert markers for active alerts. Has a toggle to show/hide the geo-fence zones.
- **StatusIndicator:** Circular progress ring that changes color and icon based on the 4 threat states. Live data for cameras online and AI confidence.
- **ActivityFeed:** Scrolling log of the last 10 events. Newest entry highlighted in green. Auto-animates new items in with Framer Motion layout animation.
- **RecentAlerts:** Last 5 alerts as compact rows with camera thumbnail, animal name, threat badge, location, and relative timestamp. Click any to go to full alerts page.

#### Live Detection (`/detection`)
**Components:** DetectionMonitor (6-camera grid) + DetectionTimeline + EventStream

- **DetectionMonitor:** 3-column grid of `CameraFeed` tiles. Each tile shows the camera image with scanline animation, bounding box overlay for the latest detection on that camera, live/camera ID badge, and threat level indicator.
- **DetectionTimeline:** Vertical timeline of the last 14 detections. Each item has a colored dot (red/amber/green), species name, camera ID, timestamp, and an animated confidence progress bar.
- **EventStream:** Real-time log of system events — detections, alerts, system heartbeats, deterrence triggers. Color-coded by severity.

#### Alerts (`/alerts`)
**Components:** AlertFilter + AlertCard grid + AlertDetailModal

- **AlertFilter:** Search input (wired to `alertStore.search`) + threat level filter pills (all / high / medium / low). The search also works from the header search bar.
- **AlertCard:** Each alert has a camera thumbnail, animal name + threat badge, status pill (active/acknowledged/resolved), GPS coordinates, camera ID, relative timestamp + confidence. Action buttons: View (opens modal), Acknowledge, Resolve.
- **AlertDetailModal:** Full-screen modal with the alert image, two views (officer report / civilian alert), simulated video frames, and all metadata.
- **Alert workflow:** active → acknowledge (claim ownership) → resolve (threat cleared)

#### Deterrence (`/deterrence`)
**Components:** DeterrenceControl + VillagerAlertPanel

- **DeterrenceControl:** 
  - Auto/Manual toggle — in auto mode, high threats trigger siren+lights automatically; medium threats trigger lights only. In manual mode, nothing fires automatically.
  - **SirenToggle** — Big red animated button. When active, shows pulsing ring animation, "Broadcasting · 4 zones" text, and the switch glows red.
  - **LightToggle** — Amber animated button. When active, shows strobe bar animation.
  - **Audio playback** — `/siren.mp3` plays via HTML5 Audio when siren is on, sound is enabled, and threat state is `alert`. Browser autoplay policy means it needs a user gesture first — the sound toggle button counts.
  - **Countdown panel** — Shows MM:SS countdown timer. Siren/lights auto-disarm after 30 seconds.
  - **SystemStatus** — Shows telemetry (AI compute: 6.2 TOPS, LoRa mesh strength, 4G uplink, power source), current mode/threat/sound state pills.
  - **Response matrix** — Visual protocol table showing what fires at each threat level.

- **VillagerAlertPanel** (added this session):
  - Three broadcast types: Village Evacuation (danger), Stay Indoors Warning (warning), All-Clear (safe)
  - Select one → Send button activates → 900ms simulated sending delay → toast fires → activity event logged
  - Confirmation badge animates in on the panel

#### Settings (`/settings`)
**Components:** NotificationSettings + CameraManagement + AccountSettings

- **NotificationSettings:** Push/SMS/Voice call toggles with animated switch UI. AI sensitivity slider (20–100%). Currently stores state locally (resets on refresh — production would persist to a user settings API).
- **CameraManagement:** List of all 6 cameras with thumbnail, name, GPS, status badge, and configure/delete buttons. Buttons now show contextual dialogs (added this session).
- **AccountSettings:** User profile card with initials avatar, role, phone, region, clearance level. Logout button.

---

### 4.9 Design System

**Color palette:**
| Name | Hex | Use |
|---|---|---|
| `forest-950` | `#060908` | Deepest background |
| `forest-900` | `#0C0D0C` | App background |
| `moss-400` | `#34D399` | Primary green accent, active states |
| `moss-500` | `#10B981` | Secondary green |
| `threat-500` | `#EF4444` | High threat / danger |
| `amber2-500` | `#F59E0B` | Medium threat / warning |

**Typography:**
- Display/UI text: `Outfit` (loaded from Google Fonts) — clean modern geometric sans
- Code/data/mono: `JetBrains Mono` — all timestamps, IDs, GPS coordinates, percentages

**CSS utilities:**
- `.glass` — semi-transparent dark surface, subtle blur, used for cards
- `.glass-strong` — more opaque, used for sidebar and modals
- `.panel` — fully solid dark background, no blur, for nested cards
- `.pill` — rounded-full badge for status indicators
- `.grid-bg` — subtle grid pattern overlay
- `.noise` — film grain overlay on camera feeds
- `.scanline` — animated horizontal line sweep on camera feeds (CRT monitor effect)
- `.glow-threat-strong` — red box-shadow used when threat state is `alert`

**Animation patterns:**
- `animate-blink` — status dot pulse (1.2s ease-in-out)
- `animate-scan` — scanline sweep (4s linear)
- Framer Motion `layout` prop — smooth list reordering when new activity events arrive
- Framer Motion `layoutId="sidebar-indicator"` — the active nav indicator animates between items with spring physics
- `whileHover={{ y: -3 }}` — cards lift on hover

---

### 4.10 Component Architecture Decisions

**Why functional components + hooks everywhere?** React hooks (`useState`, `useEffect`, `useMemo`) replaced class components in 2019. They're simpler, composable, and easier to test.

**Why Zustand instead of prop drilling?** Many components need the same data (e.g., both Header and Sidebar need `threatState`). Passing it as props through 3–4 component levels ("prop drilling") is messy. Zustand stores are global — any component just calls `useDetectionStore(s => s.threatState)` and gets the current value with automatic re-renders.

**Why separate the mock socket into a hook?** `useSocket.ts` contains all the simulation logic. When the real backend WebSocket is ready, only this one file needs changing — nothing else in the UI knows or cares where the data comes from.

**The `cn()` utility:** Combines `clsx` (conditional classes) and `tailwind-merge` (removes conflicting Tailwind classes). Example: `cn('px-4 py-2', isActive && 'bg-moss-500', className)`.

---

## 5. DATA FLOW — END TO END

### When the app loads (authenticated):
1. `App.tsx` calls `useSocket(true)`
2. `useSocket` generates cameras, seeds alerts and activity events into their stores
3. Starts 30s detection interval and 45s activity interval

### Every 30 seconds (simulated detection tick):
1. `generateDetection(cams)` → random species + camera + bounding box
2. `addDetection(det)` → pushed to `detectionStore.detections[]`
3. Activity event pushed to `activityStore`
4. Threat level decision:
   - **HIGH** → `setThreatState('alert')` + `addAlert()` + toast notification + if `mode === 'auto'` → `setSiren(true)` + `setLights(true)` → 6s timer → reset to `monitoring`
   - **MEDIUM** → `setThreatState('detected')` + toast + if auto → `setLights(true)` → 4.5s timer → reset
   - **LOW** → `setThreatState('monitoring')`

### When user triggers "Alert Villagers":
1. Select broadcast type → click Send
2. 900ms simulated delay
3. `useToastStore.push()` → toast appears bottom-right, auto-dismisses in 7s
4. `activityStore.push()` → event logged as `deterrence` type in activity feed

### When real backend is connected (future):
- Replace `socketService.ts` MockSocket with `socket.io-client`
- Replace `authService.ts` with real API calls using `api.ts` (fetch wrapper with Bearer token)
- Backend `/detections` JSON → frontend detection store
- Backend alert email → SQLite record → future REST API → frontend alert store

---

## 6. BUGS FIXED DURING THIS SESSION

### Bug 1: Auto/Manual mode had no effect on deterrence
**Root cause:** JavaScript closure bug. In `useSocket.ts`, the `useEffect` callback runs once when the component mounts. The `mode` variable from `useDeterrenceStore` was captured in that closure — when the user switched mode in the UI, the store updated, but the interval callback still saw the old `mode` value (always `'auto'`).

**Fix:** Read `useDeterrenceStore.getState().mode` directly inside the interval callback. `getState()` reads the current store value at the moment of calling, bypassing the stale closure entirely.

```javascript
// Before (broken — stale closure):
const mode = useDeterrenceStore((s) => s.mode);
// mode is always the value from when the effect ran

// After (fixed — reads current value):
const { setSiren, setLights, mode } = useDeterrenceStore.getState();
// mode is whatever the store says RIGHT NOW
```

### Bug 2: Camera names displayed incorrectly
**Root cause:** Camera names were stored as `"Camera 1 — North Perimeter"` and the code parsed them with `.split('—')[1]?.trim()`. An em dash (`—`) is a specific Unicode character, not a hyphen. If the name format ever changed, this would silently fall back to the full name.

**Fix:** Used `camera.location.name` directly (which is `"North Perimeter"`) — the clean source of truth already in the data model.

### Bug 3: Branding inconsistency
The login screen showed `"Sentinel · OS"` while the header showed `"WildGuard · Sentinel"` and the mobile drawer showed `"WildGuard AI"` — three different strings for the same app. Fixed all three to use the `APP_NAME` constant from `constants.ts`.

### Bug 4: Header search was non-functional
The search input was purely decorative. Fixed by wiring it to `alertStore.setSearch()`, auto-navigating to `/alerts` when focused or on Enter, and showing a clear (✕) button when text is typed.

### Bug 5: Buttons with no onClick handlers
Camera settings/delete buttons and the "Add camera" button had no handlers — clicking them did nothing with no visual feedback. Added `onClick` dialogs with contextual messages.

### Bug 6: StatusIndicator showed hardcoded values
"Cameras online: 5 / 6" and "AI confidence: 98.4%" were hardcoded strings. Fixed to compute from live store data (`cameras.filter(c => c.status === 'online').length`, average of recent detection confidence scores).

### Bug 7: Detection/activity notifications too frequent
Detection simulation ran every 7 seconds. At 7 seconds, the UI felt chaotic and unrealistic. Changed to 30 seconds for detections and 45 seconds for activity heartbeats.

---

## 7. FEATURES ADDED DURING THIS SESSION

1. **Toast notification system** — Global `toastStore` + `ToastOverlay` component in `App.tsx`. Bottom-right stacked toasts with auto-dismiss and click-to-close. High and medium threat detections now surface as toasts.

2. **Alert Villagers panel** — Three broadcast types (evacuation / stay indoors / all-clear). Select one, click Send, get visual feedback (900ms delay, "Broadcast sent" badge, toast, activity log entry).

3. **Modern ops-center UI redesign:**
   - Cleaner, more solid card surfaces (less blur/glass effect)
   - New compact sidebar (240px) with left-border active indicator, live camera count, live threat state, settings split to bottom
   - Alerts badge count on nav item
   - Cleaner header (56px flat bar, smaller typography, no gradient)
   - Quieter background (single subtle radial gradient)
   - Thinner scrollbars (4px)
   - Reduced noise/scanline opacity for a more professional look

---

## 8. TECHNOLOGY DECISIONS — WHY EACH CHOICE

| Decision | Chosen | Why |
|---|---|---|
| AI framework | Ultralytics YOLO | Best balance of accuracy, speed, and ease of use for object detection. Industry standard. |
| Video | OpenCV | Universal, handles webcams/files/RTSP, fast frame processing |
| Web server | Flask | Lightweight, easy to add routes, good for small APIs. FastAPI would be better for a production REST API. |
| Database | SQLite | Zero-setup, single file, perfect for embedded systems / single-server deployments. No separate DB server needed. |
| Frontend | React + TypeScript | Industry standard for complex UIs. TypeScript catches type errors at compile time. |
| State | Zustand | Simplest global state for React. No boilerplate. |
| Styling | Tailwind CSS | Write styles directly in JSX. No separate CSS files to maintain. Design tokens (colors, spacing) in config. |
| Animations | Framer Motion | Best animation library for React. Declarative, physics-based springs, layout animations. |
| Build tool | Vite | 10x faster than Webpack in dev mode. Uses native ES modules. |
| Icons | Lucide React | Clean, consistent, SVG icons as React components. MIT licensed. |

---

## 9. HARDWARE / DEPLOYMENT CONTEXT

**Intended deployment:**
- **Edge device:** Raspberry Pi 5 or Jetson Nano at the forest perimeter — runs the Python backend + camera feeds
- **Network:** 4G SIM card for internet connectivity from the forest
- **Cameras:** IP cameras over RTSP or USB webcams
- **Alert delivery:** Email to ranger phones, SMS (configurable), frontend dashboard on ranger tablet
- **Power:** Solar panel + battery backup (hence the "grid + solar" telemetry value)

**LoRa mesh:** Referenced in the SystemStatus telemetry — LoRa (Long Range) is a low-power radio protocol used for IoT sensor networks in rural areas. The idea is that cameras communicate back to a central hub over LoRa even without 4G.

---

## 10. POTENTIAL QUESTIONS AND ANSWERS

**Q: How accurate is the AI?**
YOLOv8s-World at 25% confidence threshold catches most animals but may have false positives. The 3-frame confirmation threshold significantly reduces false positives. In testing on wolf video footage, the system correctly detected and saved 39 snapshots.

**Q: Does it work at night?**
The current implementation works on visible light video. For night detection, infrared or thermal cameras would be needed. The software pipeline handles any video input — the camera hardware determines night capability.

**Q: What happens if the internet goes down?**
The detection pipeline keeps running and logs to SQLite. Emails queue and will fail (they require SMTP connectivity). The local Flask server and dashboard still work on the local network.

**Q: What happens if the camera disconnects?**
`VideoStream` has exponential backoff reconnection — it retries at 2s, 4s, 8s... up to 60s intervals, automatically reconnecting without any restart needed.

**Q: Can it handle multiple cameras?**
The current architecture runs one `WildGuardPipeline` per camera source. For multi-camera, you'd run multiple pipeline instances (one per camera), each with a different `camera_id`, writing to the same SQLite database.

**Q: Why not use cloud AI (Google Vision, AWS Rekognition)?**
Latency. Cloud APIs add 200–2000ms per frame. For real-time detection, edge inference is required. YOLO runs in ~20–50ms per frame on a mid-range GPU or ~100–300ms on a CPU.

**Q: Is the frontend connected to the backend?**
Not yet. The frontend currently runs with a simulated data layer (the MockSocket) that generates realistic random detections every 30 seconds. When the backend is ready, `socketService.ts` is replaced with `socket.io-client` and `authService.ts` is pointed at the real API — no other code changes needed.

**Q: How does the OTP auth work in production?**
Currently mocked. In production, `authService.sendOtp()` would call a backend endpoint that uses an SMS provider (Twilio, MSG91) to send a real OTP. The backend generates and stores a time-limited OTP, and `verifyOtp()` checks it against the stored value.

**Q: What is the threat classification based on?**
Pure rule-based logic in `WildGuardDetector.classify_threat()`. Animals are manually categorized into HIGH/MEDIUM/LOW based on how dangerous they are to humans. A more sophisticated approach would use location data (animal near village boundary = higher threat).

**Q: How many animals can it track simultaneously?**
YOLO processes all detections in a single frame pass, so it can technically detect unlimited animals in one frame. The `_frame_counter` dictionary tracks persistence per species label. The limiting factor is GPU memory for the model.

**Q: Can rangers customize alert thresholds?**
Currently through `.env` configuration. The `ALERT_CONFIDENCE_THRESHOLD` and `ALERT_COOLDOWN_SECONDS` variables can be changed per deployment. The Settings page has an AI sensitivity slider that will map to this threshold in the production version.

---

## 11. PROJECT FILE SUMMARY

```
wildguard/
├── backend/
│   ├── app.py              Flask server (MJPEG stream + JSON API)
│   ├── pipeline.py         Central coordinator (VideoStream → Detector → AlertManager)
│   ├── detector.py         YOLOv8 inference + threat classification
│   ├── video_stream.py     Threaded camera reader with auto-reconnect
│   ├── alert_manager.py    SQLite logging + email dispatch
│   ├── main.py             Headless entry point
│   ├── utils.py            Shared utilities
│   ├── clean_dataset.py    Dataset cleaning script
│   ├── download_model.py   Model download helper
│   └── test_alert.py       Alert system test
├── frontend/
│   ├── src/
│   │   ├── pages/          6 pages (Dashboard, Detection, Alerts, Deterrence, Settings, Login)
│   │   ├── components/     30+ React components
│   │   ├── hooks/          5 custom hooks
│   │   ├── store/          6 Zustand stores
│   │   ├── services/       5 service modules
│   │   ├── utils/          formatters, validators, mockData, constants, cn
│   │   └── types/          TypeScript interfaces
│   ├── public/             favicon.svg, forest-bg.png, siren.mp3
│   ├── package.json        Dependencies
│   ├── tailwind.config.js  Design tokens
│   ├── vite.config.ts      Build config
│   └── tsconfig.json       TypeScript config
├── models/
│   └── yolov8s-worldv2.pt  YOLO-World wildlife detection model
├── alerts/                 Saved JPEG snapshots from real detections (39 wolf images)
├── data/
│   ├── images/             Training/test images
│   └── videos/             Test video files
├── yolov8n.pt              YOLOv8 nano model (fast, basic classes)
├── wildguard_alerts.db     SQLite database (all alert records)
└── .env                    Email credentials (not committed to git)
```

---

## 12. WHAT WAS BUILT IN THIS SESSION (SUMMARY)

During this development session the following was done:

1. **Added the frontend to git** — staged and committed all 71 frontend files
2. **Fixed 7 UI bugs** — branding, camera names, search, empty buttons, hardcoded values, stale closures, notification frequency
3. **Fixed auto/manual deterrence** — the core functionality bug where mode changes had no effect
4. **Built toast notification system** — `toastStore` + global overlay in App.tsx
5. **Built Alert Villagers feature** — new panel on Deterrence page with 3 broadcast types, animated send flow, toast + activity log integration
6. **Redesigned the UI** — modern ops-center aesthetic: cleaner backgrounds, compact sidebar with live data, flat header, reduced blur/noise effects

---

*WildGuard AI — Protecting communities through intelligent wildlife surveillance.*
