"""
In-process publish/subscribe bus feeding the dashboard over Server-Sent Events.

Every subsystem (cameras, alerts, deterrence, uploads) publishes typed events
here; each browser holds one /api/events connection and receives them all.
The bus also keeps short histories of activity and detections so a freshly
opened dashboard can render the recent past immediately.
"""

import itertools
import json
import queue
import threading
import time
from collections import deque

HEARTBEAT_SECONDS = 15


class EventBus:
    def __init__(self, history: int = 200) -> None:
        self._subscribers: "set[queue.Queue]" = set()
        self._lock = threading.Lock()
        self._ids = itertools.count(1)
        self.activity: "deque[dict]" = deque(maxlen=history)
        self.detections: "deque[dict]" = deque(maxlen=history)

    # ------------------------------------------------------------------
    # Publishing
    # ------------------------------------------------------------------

    def publish(self, event_type: str, data) -> None:
        message = {"type": event_type, "data": data}
        with self._lock:
            subscribers = list(self._subscribers)
        for q in subscribers:
            try:
                q.put_nowait(message)
            except queue.Full:
                # Slow client: drop its oldest event rather than block the pipeline.
                try:
                    q.get_nowait()
                    q.put_nowait(message)
                except (queue.Empty, queue.Full):
                    pass

    def log(self, kind: str, message: str, level: str = "info") -> dict:
        """Record an activity-feed entry and push it to dashboards."""
        event = {
            "id": f"EVT-{int(time.time() * 1000)}-{next(self._ids)}",
            "type": kind,
            "message": message,
            "level": level,
            "timestamp": time.time(),
        }
        self.activity.appendleft(event)
        self.publish("activity", event)
        return event

    def detection(self, detection: dict) -> None:
        self.detections.appendleft(detection)
        self.publish("detection", detection)

    # ------------------------------------------------------------------
    # Subscribing (SSE)
    # ------------------------------------------------------------------

    def subscribe(self) -> queue.Queue:
        q: queue.Queue = queue.Queue(maxsize=500)
        with self._lock:
            self._subscribers.add(q)
        return q

    def unsubscribe(self, q: queue.Queue) -> None:
        with self._lock:
            self._subscribers.discard(q)

    @property
    def subscriber_count(self) -> int:
        with self._lock:
            return len(self._subscribers)

    def sse_stream(self, hello: "dict | None" = None):
        """Generator of SSE-formatted chunks for one client connection."""
        q = self.subscribe()
        try:
            yield "retry: 3000\n\n"
            if hello is not None:
                yield _format({"type": "hello", "data": hello})
            while True:
                try:
                    message = q.get(timeout=HEARTBEAT_SECONDS)
                except queue.Empty:
                    yield ": ping\n\n"
                    continue
                yield _format(message)
        finally:
            self.unsubscribe(q)


def _format(message: dict) -> str:
    return f"event: {message['type']}\ndata: {json.dumps(message['data'], default=str)}\n\n"
