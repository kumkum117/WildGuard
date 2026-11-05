"""
Alert persistence and the live alert feed.

AlertManager (alert_manager.py) stays the single writer of the `alerts`
table: it applies the high-risk list, confidence threshold and cooldown, logs
the row and sends the e-mail. This module adds what the dashboard needs:

  * ManagedAlertManager — AlertManager plus a settings-controlled e-mail
    switch and a side-effect-free "would this alert fire?" check, so the
    camera workers only write snapshot files for alerts that will be logged.
  * AlertStore — reads alerts for the API, keeps triage status
    (active / acknowledged / resolved) in a separate `alert_status` table so
    AlertManager's schema is untouched, and watches the DB for new rows. The
    watcher also picks up alerts written by the standalone app.py /
    pipeline.py processes, since they share the same database file.

Incidents: an animal that stays near a camera used to produce a new alert row
(and e-mail) every cooldown period — the looping demo feed piled up dozens.
Now an unresolved alert stays "open" while the same animal keeps being seen on
the same camera; further sightings are recorded on it (`alert_activity`:
sightings count + last seen) instead of creating new alerts. Once the animal
has been gone for the incident gap, or a ranger resolves the alert, the next
sighting starts a new alert.
"""

import sqlite3
import threading
import time
from contextlib import contextmanager
from pathlib import Path, PureWindowsPath
from typing import Callable

from alert_manager import AlertManager
from detector import ALERTS_DIR

STATUSES = ("active", "acknowledged", "resolved")

_STATUS_SCHEMA = """
CREATE TABLE IF NOT EXISTS alert_status (
    alert_id    INTEGER PRIMARY KEY,
    status      TEXT    NOT NULL,
    updated_at  REAL    NOT NULL
)
"""

_ACTIVITY_SCHEMA = """
CREATE TABLE IF NOT EXISTS alert_activity (
    alert_id    INTEGER PRIMARY KEY,
    sightings   INTEGER NOT NULL DEFAULT 1,
    last_seen   REAL    NOT NULL
)
"""


class ManagedAlertManager(AlertManager):
    def __init__(self) -> None:
        self.email_enabled = True
        super().__init__()

    @property
    def db_path(self) -> Path:
        return self._db_path

    @property
    def email_configured(self) -> bool:
        return self._email_configured()

    def would_alert(self, label: str, confidence: float, camera_id: str) -> bool:
        """Same filter chain as trigger(), without stamping the cooldown."""
        if label.lower() not in self.high_risk_animals:
            return False
        if confidence < self.confidence_threshold:
            return False
        with self._cooldown_lock:
            last = self._last_alert.get((camera_id, label.lower()), 0.0)
        return time.time() - last >= self.cooldown_seconds

    def _send_email(self, *args, **kwargs) -> None:
        if not self.email_enabled:
            raise RuntimeError("e-mail alerts are switched off in WildGuard settings")
        super()._send_email(*args, **kwargs)


class AlertStore:
    def __init__(
        self,
        db_path: Path,
        bus,
        camera_lookup: "Callable[[str], dict | None]",
        threat_fn: "Callable[[str], str]",
    ) -> None:
        self.db_path = db_path
        self.bus = bus
        self.camera_lookup = camera_lookup
        self.threat_fn = threat_fn
        self._email_state: "dict[int, int]" = {}
        self.listeners: "list[Callable[[dict], None]]" = []   # called for every new alert row
        with self._connect() as conn:
            conn.execute(_STATUS_SCHEMA)
            conn.execute(_ACTIVITY_SCHEMA)
        self._last_id = self._max_id()

    @contextmanager
    def _connect(self):
        conn = sqlite3.connect(str(self.db_path), timeout=5)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def _max_id(self) -> int:
        with self._connect() as conn:
            return conn.execute("SELECT COALESCE(MAX(id), 0) FROM alerts").fetchone()[0]

    # ------------------------------------------------------------------
    # Queries
    # ------------------------------------------------------------------

    _SELECT = """
        SELECT a.*, COALESCE(s.status, 'active') AS status,
               COALESCE(act.sightings, 1) AS sightings,
               COALESCE(act.last_seen, a.timestamp) AS last_seen
        FROM alerts a
        LEFT JOIN alert_status s ON s.alert_id = a.id
        LEFT JOIN alert_activity act ON act.alert_id = a.id
    """

    def list(self, limit: int = 200) -> "list[dict]":
        with self._connect() as conn:
            rows = conn.execute(self._SELECT + " ORDER BY a.id DESC LIMIT ?", (limit,)).fetchall()
        return [self._to_dict(r) for r in rows]

    def get(self, alert_id: int) -> "dict | None":
        with self._connect() as conn:
            row = conn.execute(self._SELECT + " WHERE a.id = ?", (alert_id,)).fetchone()
        return self._to_dict(row) if row else None

    def set_status(self, alert_id: int, status: str) -> "dict | None":
        changed = self.set_status_many([alert_id], status)
        return changed[0] if changed else None

    def set_status_many(self, alert_ids: "list[int]", status: str) -> "list[dict]":
        if status not in STATUSES:
            raise ValueError(f"status must be one of {STATUSES}")
        if not alert_ids:
            return []
        now = time.time()
        with self._connect() as conn:
            marks = ",".join("?" * len(alert_ids))
            existing = [r[0] for r in conn.execute(f"SELECT id FROM alerts WHERE id IN ({marks})", alert_ids)]
            conn.executemany(
                "INSERT INTO alert_status (alert_id, status, updated_at) VALUES (?, ?, ?)"
                " ON CONFLICT(alert_id) DO UPDATE SET status = excluded.status,"
                " updated_at = excluded.updated_at",
                [(i, status, now) for i in existing],
            )
        changed = [a for a in (self.get(i) for i in existing) if a]
        for alert in changed:
            self.bus.publish("alert_update", alert)
        return changed

    def ids_with_status(self, statuses: "tuple[str, ...]") -> "list[int]":
        marks = ",".join("?" * len(statuses))
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT a.id FROM alerts a LEFT JOIN alert_status s ON s.alert_id = a.id"
                f" WHERE COALESCE(s.status, 'active') IN ({marks})", statuses,
            ).fetchall()
        return [r[0] for r in rows]

    # ------------------------------------------------------------------
    # Incidents
    # ------------------------------------------------------------------

    def open_incident(self, camera_id: str, animal: str, gap_s: float) -> "int | None":
        """Latest unresolved alert for this camera + animal seen within gap_s."""
        with self._connect() as conn:
            row = conn.execute(
                self._SELECT + " WHERE a.camera_id = ? AND lower(a.animal) = ?"
                " ORDER BY a.id DESC LIMIT 1",
                (camera_id, animal.lower()),
            ).fetchone()
        if row is None or row["status"] == "resolved":
            return None
        return row["id"] if time.time() - float(row["last_seen"]) <= gap_s else None

    def touch(self, alert_id: int, when: float) -> None:
        """Record another sighting on an open incident."""
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO alert_activity (alert_id, sightings, last_seen) VALUES (?, 2, ?)"
                " ON CONFLICT(alert_id) DO UPDATE SET sightings = sightings + 1,"
                " last_seen = MAX(last_seen, excluded.last_seen)",
                (alert_id, when),
            )
        alert = self.get(alert_id)
        if alert:
            self.bus.publish("alert_update", alert)

    def count_since(self, epoch: float) -> int:
        with self._connect() as conn:
            return conn.execute("SELECT COUNT(*) FROM alerts WHERE timestamp >= ?", (epoch,)).fetchone()[0]

    def snapshot_path(self, alert_id: int) -> "Path | None":
        with self._connect() as conn:
            row = conn.execute("SELECT snapshot FROM alerts WHERE id = ?", (alert_id,)).fetchone()
        return _resolve_snapshot(row["snapshot"]) if row else None

    # ------------------------------------------------------------------
    # Watcher
    # ------------------------------------------------------------------

    def start_watcher(self, stop_event: threading.Event) -> None:
        threading.Thread(target=self._watch, args=(stop_event,), daemon=True,
                         name="WildGuard-alert-watcher").start()

    def _watch(self, stop_event: threading.Event) -> None:
        while not stop_event.wait(1.0):
            try:
                self._poll()
            except sqlite3.Error as exc:
                print(f"[AlertStore] DB poll failed — {exc}")

    def _poll(self) -> None:
        with self._connect() as conn:
            rows = conn.execute(
                self._SELECT + " WHERE a.id > ? ORDER BY a.id", (self._last_id,)
            ).fetchall()
            for row in rows:
                alert = self._to_dict(row)
                self._last_id = max(self._last_id, alert["id"])
                self._email_state[alert["id"]] = int(alert["email_sent"])
                self.bus.publish("alert", alert)
                for listener in self.listeners:
                    try:
                        listener(alert)
                    except Exception as exc:
                        print(f"[AlertStore] alert listener failed — {exc}")
                self.bus.log(
                    "alert",
                    f"{alert['animal'].title()} alert logged on {alert['camera_name']}"
                    f" ({alert['confidence']:.0%})",
                    "danger" if alert["threat_level"] == "HIGH" else "warning",
                )

            # E-mail delivery finishes a few seconds after the row is logged.
            if self._email_state:
                ids = list(self._email_state)[-50:]
                marks = ",".join("?" * len(ids))
                for row in conn.execute(
                    self._SELECT + f" WHERE a.id IN ({marks})", ids
                ).fetchall():
                    if int(row["email_sent"]) != self._email_state.get(row["id"]):
                        self._email_state[row["id"]] = int(row["email_sent"])
                        self.bus.publish("alert_update", self._to_dict(row))
                if len(self._email_state) > 200:
                    for key in list(self._email_state)[:-50]:
                        del self._email_state[key]

    # ------------------------------------------------------------------

    def _to_dict(self, row: sqlite3.Row) -> dict:
        camera = self.camera_lookup(row["camera_id"])
        snapshot = _resolve_snapshot(row["snapshot"])
        return {
            "id": row["id"],
            "animal": row["animal"],
            "confidence": round(float(row["confidence"]), 3),
            "timestamp": float(row["timestamp"]),
            "camera_id": row["camera_id"],
            "camera_name": camera["name"] if camera else _legacy_camera_name(row["camera_id"]),
            "location": camera["location"] if camera else None,
            "threat_level": self.threat_fn(row["animal"].lower()),
            "status": row["status"],
            "sightings": int(row["sightings"]),
            "last_seen": float(row["last_seen"]),
            "email_sent": bool(row["email_sent"]),
            "logged_at": row["logged_at"],
            "snapshot_url": f"/api/alerts/{row['id']}/snapshot" if snapshot else None,
        }


def _resolve_snapshot(stored: "str | None") -> "Path | None":
    """Stored paths are absolute and break when the project folder moves."""
    if not stored:
        return None
    path = Path(stored)
    if path.exists():
        return path
    fallback = ALERTS_DIR / PureWindowsPath(stored).name
    return fallback if fallback.exists() else None


def _legacy_camera_name(camera_id: str) -> str:
    if camera_id == "UPLOAD":
        return "Media upload"
    if "/" in camera_id or "\\" in camera_id:
        return f"Feed · {PureWindowsPath(camera_id).name}"
    return camera_id
