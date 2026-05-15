import threading
import cv2
import numpy as np


class VideoStream:
    MIN_BACKOFF = 2.0
    MAX_BACKOFF = 60.0

    def __init__(self, source: int | str, frame_interval: int = 5) -> None:
        self.source = source
        self.frame_interval = frame_interval

        self._frame: np.ndarray | None = None
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> "VideoStream":
        if self._thread and self._thread.is_alive():
            return self
        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._capture_loop,
            daemon=True,
            name="VideoStream-capture",
        )
        self._thread.start()
        return self

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=5.0)
        self._thread = None

    def get_frame(self) -> np.ndarray | None:
        with self._lock:
            return self._frame

    def _open_capture(self) -> cv2.VideoCapture | None:
        # Use CAP_FFMPEG for RTSP URLs; integer sources use the default backend.
        if isinstance(self.source, str) and self.source.startswith("rtsp://"):
            cap = cv2.VideoCapture(self.source, cv2.CAP_FFMPEG)
        else:
            cap = cv2.VideoCapture(self.source)

        if cap.isOpened():
            return cap

        cap.release()
        return None

    def _capture_loop(self) -> None:
        backoff = self.MIN_BACKOFF
        frame_count = 0

        while not self._stop_event.is_set():
            cap = self._open_capture()

            if cap is None:
                print(f"[VideoStream] Cannot open source '{self.source}', retrying in {backoff:.0f}s")
                self._stop_event.wait(timeout=backoff)
                backoff = min(backoff * 2, self.MAX_BACKOFF)
                continue

            backoff = self.MIN_BACKOFF
            print(f"[VideoStream] Connected to '{self.source}'")

            try:
                while not self._stop_event.is_set():
                    ret, frame = cap.read()

                    if not ret:
                        print(f"[VideoStream] Frame read failed — reconnecting to '{self.source}'")
                        break

                    frame_count += 1
                    if frame_count % self.frame_interval == 0:
                        # .copy() avoids aliasing OpenCV's internal reusable buffer
                        with self._lock:
                            self._frame = frame.copy()
            finally:
                try:
                    cap.release()
                except Exception:
                    pass

            if not self._stop_event.is_set():
                self._stop_event.wait(timeout=backoff)
                backoff = min(backoff * 2, self.MAX_BACKOFF)
