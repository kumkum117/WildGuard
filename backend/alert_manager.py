"""
AlertManager — high-risk wildlife alert dispatch with DB audit trail.

Flow for every trigger() call:
  1. Filter: is the animal high-risk? is confidence above threshold?
  2. Cooldown: has enough time passed since the last alert for THIS
     (camera, animal) pair? A different animal on the same camera is
     never blocked by another animal's cooldown.
  3. Log to SQLite immediately — the record exists even if email fails.
  4. Fire email on a daemon thread — never blocks the detection loop.
  5. Background thread updates the DB row with email_sent=1 on success.

Configuration (load from .env if python-dotenv is installed):
    ALERT_EMAIL_FROM            sender Gmail address
    ALERT_EMAIL_PASSWORD        Gmail App Password
    ALERT_EMAIL_TO              recipient address
    SMTP_HOST                   default: smtp.gmail.com
    SMTP_PORT                   default: 587
    ALERT_HIGH_RISK_ANIMALS     comma-separated, e.g. tiger,wolf,bear
    ALERT_CONFIDENCE_THRESHOLD  float 0–1, default 0.6
    ALERT_COOLDOWN_SECONDS      seconds between repeat alerts per animal
                                per camera, default 300
"""

import datetime
import os
import smtplib
import sqlite3
import threading
import time
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
except ImportError:
    pass

PROJECT_ROOT = Path(__file__).resolve().parents[1]

_DEFAULT_HIGH_RISK: frozenset[str] = frozenset({
    "tiger", "elephant", "leopard", "bear", "lion",
    "crocodile", "wolf", "cheetah", "rhinoceros", "hippopotamus",
})

_DB_SCHEMA = """
CREATE TABLE IF NOT EXISTS alerts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    animal      TEXT    NOT NULL,
    confidence  REAL    NOT NULL,
    timestamp   REAL    NOT NULL,
    camera_id   TEXT    NOT NULL,
    snapshot    TEXT,
    email_sent  INTEGER NOT NULL DEFAULT 0,
    logged_at   TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
)
"""


class AlertManager:
    """
    Manages high-risk wildlife alerts.

    Plug in additional channels (SMS, push, siren) by adding calls inside
    trigger() after the email thread is started — AlertManager is intentionally
    kept as a plain class so it is easy to subclass or compose.
    """

    def __init__(self) -> None:
        # --- SMTP / email ---
        self.smtp_host  = os.environ.get("SMTP_HOST", "smtp.gmail.com")
        self.smtp_port  = int(os.environ.get("SMTP_PORT", "587"))
        self.email_from = os.environ.get("ALERT_EMAIL_FROM", "")
        self.email_pass = os.environ.get("ALERT_EMAIL_PASSWORD", "")
        self.email_to   = os.environ.get("ALERT_EMAIL_TO", "")

        # --- detection filters ---
        raw = os.environ.get("ALERT_HIGH_RISK_ANIMALS", "")
        self.high_risk_animals: frozenset[str] = (
            frozenset(a.strip().lower() for a in raw.split(",") if a.strip())
            if raw else _DEFAULT_HIGH_RISK
        )
        self.confidence_threshold = float(
            os.environ.get("ALERT_CONFIDENCE_THRESHOLD", "0.6")
        )
        self.cooldown_seconds = float(
            os.environ.get("ALERT_COOLDOWN_SECONDS", "300")
        )

        # --- cooldown state: (camera_id, label) → last-alert epoch ---
        self._last_alert: dict[tuple[str, str], float] = {}
        self._cooldown_lock = threading.Lock()

        # --- SQLite DB ---
        self._db_path = PROJECT_ROOT / "wildguard_alerts.db"
        self._db_lock = threading.Lock()
        self._init_db()

        self._log_config()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def trigger(
        self,
        label: str,
        confidence: float,
        camera_id: str,
        snapshot_path: "Path | str | None" = None,
        timestamp: "float | None" = None,
    ) -> None:
        """
        Call this for every detection. Returns immediately.

        Runs the filter + cooldown chain; if all pass, writes to the DB and
        fires the email on a background daemon thread.
        """
        if label.lower() not in self.high_risk_animals:
            return
        if confidence < self.confidence_threshold:
            return
        if not self._acquire_cooldown(label, camera_id):
            return

        ts     = timestamp or time.time()
        row_id = self._log_to_db(label, confidence, camera_id, snapshot_path, ts)

        threading.Thread(
            target=self._email_worker,
            args=(row_id, label, confidence, camera_id, snapshot_path, ts),
            daemon=True,
            name=f"wg-alert-{label}",
        ).start()

    # ------------------------------------------------------------------
    # Cooldown
    # ------------------------------------------------------------------

    def _acquire_cooldown(self, label: str, camera_id: str) -> bool:
        """
        Returns True and stamps the alert time if the cooldown window has
        elapsed for this (camera, animal) pair.
        Each animal is tracked independently — a wolf cooldown never
        suppresses a tiger alert on the same camera.
        """
        key = (camera_id, label.lower())
        now = time.time()
        with self._cooldown_lock:
            if now - self._last_alert.get(key, 0.0) < self.cooldown_seconds:
                return False
            self._last_alert[key] = now
        return True

    # ------------------------------------------------------------------
    # Database
    # ------------------------------------------------------------------

    def _init_db(self) -> None:
        with self._db_lock:
            conn = sqlite3.connect(str(self._db_path))
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute(_DB_SCHEMA)
            conn.commit()
            conn.close()

    def _log_to_db(
        self,
        label: str,
        confidence: float,
        camera_id: str,
        snapshot_path: "Path | str | None",
        timestamp: float,
    ) -> int:
        snap = str(snapshot_path) if snapshot_path else None
        with self._db_lock:
            conn = sqlite3.connect(str(self._db_path))
            cur  = conn.execute(
                "INSERT INTO alerts (animal, confidence, timestamp, camera_id, snapshot)"
                " VALUES (?, ?, ?, ?, ?)",
                (label, confidence, timestamp, camera_id, snap),
            )
            row_id = cur.lastrowid
            conn.commit()
            conn.close()
        print(
            f"[AlertManager] DB logged — {label} ({confidence:.0%})"
            f" on {camera_id} [row {row_id}]"
        )
        return row_id

    def _update_email_status(self, row_id: int, sent: bool) -> None:
        with self._db_lock:
            conn = sqlite3.connect(str(self._db_path))
            conn.execute(
                "UPDATE alerts SET email_sent = ? WHERE id = ?",
                (1 if sent else 0, row_id),
            )
            conn.commit()
            conn.close()

    # ------------------------------------------------------------------
    # Email
    # ------------------------------------------------------------------

    def _email_worker(
        self,
        row_id: int,
        label: str,
        confidence: float,
        camera_id: str,
        snapshot_path: "Path | str | None",
        timestamp: float,
    ) -> None:
        """Background thread: attempt email, update DB with outcome."""
        sent = False
        try:
            self._send_email(label, confidence, camera_id, snapshot_path, timestamp)
            sent = True
            ts_str = datetime.datetime.fromtimestamp(timestamp).strftime("%H:%M:%S")
            print(
                f"[AlertManager] Email sent — {label} on {camera_id}"
                f" at {ts_str} [row {row_id}]"
            )
        except Exception as exc:
            # Log but do not propagate — the detection loop must keep running.
            print(f"[AlertManager] Email failed [row {row_id}]: {exc}")
        finally:
            try:
                self._update_email_status(row_id, sent)
            except Exception as exc:
                print(f"[AlertManager] DB update failed [row {row_id}]: {exc}")

    def _send_email(
        self,
        label: str,
        confidence: float,
        camera_id: str,
        snapshot_path: "Path | str | None",
        timestamp: float,
    ) -> None:
        """Build and send the MIME email. Raises on any SMTP failure."""
        if not self._email_configured():
            raise RuntimeError(
                "Email credentials not set — add ALERT_EMAIL_* to your .env"
            )

        ts_str  = datetime.datetime.fromtimestamp(timestamp).strftime("%Y-%m-%d %H:%M:%S")
        subject = f"[WildGuard] HIGH ALERT: {label.title()} detected on {camera_id}"
        body = (
            f"WildGuard Wildlife Alert\n"
            f"{'=' * 42}\n"
            f"Animal     : {label.title()}\n"
            f"Confidence : {confidence:.1%}\n"
            f"Camera     : {camera_id}\n"
            f"Timestamp  : {ts_str}\n"
            f"{'=' * 42}\n"
            f"Snapshot attached if available.\n"
        )

        msg = MIMEMultipart()
        msg["From"]    = self.email_from
        msg["To"]      = self.email_to
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "plain"))

        if snapshot_path:
            path = Path(snapshot_path)
            if path.exists():
                with open(path, "rb") as fh:
                    img = MIMEImage(fh.read(), name=path.name)
                    img.add_header(
                        "Content-Disposition", "attachment", filename=path.name
                    )
                    msg.attach(img)

        with smtplib.SMTP(self.smtp_host, self.smtp_port, timeout=15) as server:
            server.ehlo()
            server.starttls()
            server.login(self.email_from, self.email_pass)
            server.sendmail(self.email_from, self.email_to, msg.as_string())

    def _email_configured(self) -> bool:
        return bool(self.email_from and self.email_pass and self.email_to)

    def _log_config(self) -> None:
        status = "YES" if self._email_configured() else "NO (set ALERT_EMAIL_* in .env)"
        print(
            f"[AlertManager] Email: {status} | "
            f"Animals: {sorted(self.high_risk_animals)} | "
            f"Threshold: {self.confidence_threshold:.0%} | "
            f"Cooldown: {self.cooldown_seconds:.0f}s | "
            f"DB: {self._db_path.name}"
        )
