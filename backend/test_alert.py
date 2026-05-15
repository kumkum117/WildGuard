"""
Quick smoke-test for AlertManager.

Run from the backend/ folder:
    python test_alert.py

What it checks:
  1. AlertManager loads config from .env correctly
  2. A trigger() call logs a row to the DB
  3. The cooldown blocks a second call for the same animal
  4. A DIFFERENT animal on the same camera is NOT blocked
  5. An email is sent (if ALERT_EMAIL_* is configured in .env)
  6. Prints the last 5 DB rows so you can verify the record
"""

import sqlite3
import time
from pathlib import Path

from alert_manager import AlertManager

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DB_PATH      = PROJECT_ROOT / "wildguard_alerts.db"
SNAPSHOT     = PROJECT_ROOT / "alerts" / "wolf_1778852154.jpg"   # reuse an existing snapshot


def read_recent_rows(n: int = 5) -> list[dict]:
    if not DB_PATH.exists():
        return []
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT * FROM alerts ORDER BY id DESC LIMIT ?", (n,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def main() -> None:
    print("=" * 55)
    print("  WildGuard — AlertManager smoke test")
    print("=" * 55)

    # Override cooldown to 5 s so the test finishes quickly.
    # Remove this line (or set ALERT_COOLDOWN_SECONDS=5 in .env) for a real run.
    import os
    os.environ.setdefault("ALERT_COOLDOWN_SECONDS", "5")

    mgr = AlertManager()
    print()

    # --- Test 1: valid high-risk detection should fire ---
    print("Test 1 — valid trigger (cheetah, 88% confidence)")
    mgr.trigger(
        label="cheetah",
        confidence=0.88,
        camera_id="test-cam-01",
        snapshot_path=SNAPSHOT if SNAPSHOT.exists() else None,
        timestamp=time.time(),
    )
    print("  trigger() returned (email dispatched in background if configured)\n")

    # --- Test 2: cooldown should suppress the same animal immediately ---
    print("Test 2 — repeat trigger immediately (should be suppressed by cooldown)")
    mgr.trigger(label="cheetah", confidence=0.91, camera_id="test-cam-01")
    print("  trigger() returned (no DB row expected — cooldown active)\n")

    # --- Test 3: different animal on same camera must NOT be blocked ---
    print("Test 3 — wolf on same camera (must NOT be blocked by cheetah cooldown)")
    mgr.trigger(label="wolf", confidence=0.75, camera_id="test-cam-01")
    print("  trigger() returned\n")

    # --- Test 4: below confidence threshold should be suppressed ---
    print("Test 4 — low confidence tiger (should be suppressed, threshold=0.6)")
    mgr.trigger(label="tiger", confidence=0.45, camera_id="test-cam-01")
    print("  trigger() returned (no DB row expected — below threshold)\n")

    # Give the email thread a moment to attempt delivery before we exit.
    print("Waiting 4 s for background email threads to complete...")
    time.sleep(4)

    # --- Show DB rows ---
    print("\nLast 5 rows in wildguard_alerts.db:")
    print(f"  {'id':>4}  {'animal':<12}  {'conf':>5}  {'camera':<14}  {'email_sent'}  logged_at")
    print("  " + "-" * 65)
    for row in read_recent_rows():
        print(
            f"  {row['id']:>4}  {row['animal']:<12}  "
            f"{row['confidence']:>4.0%}  {row['camera_id']:<14}  "
            f"{'YES' if row['email_sent'] else 'NO ':>10}  {row['logged_at']}"
        )

    print("\nDone. Check your inbox if email was configured.")
    print("=" * 55)


if __name__ == "__main__":
    main()
