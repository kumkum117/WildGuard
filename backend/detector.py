import time
from pathlib import Path

import cv2
import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parents[1]
ALERTS_DIR   = PROJECT_ROOT / "alerts"
MODEL_PATH   = PROJECT_ROOT / "yolov8n.pt"

ANIMALS = ["dog", "cat", "cow", "horse", "sheep"]

# Animals used when running a YOLO-World model (species-level wildlife detection)
WILDLIFE_ANIMALS = [
    "cheetah", "lion", "leopard", "tiger", "elephant", "giraffe",
    "zebra", "rhinoceros", "hippopotamus", "crocodile", "wolf",
    "bear", "deer", "antelope", "buffalo", "hyena",
]

THRESHOLD = 3


def _load_model(model_path: str):
    """
    Load a YOLOv8 or YOLO-World model via ultralytics.
    YOLO-World models have 'world' in their filename and support open-vocabulary
    detection — they can find any animal class specified as plain text.
    """
    from ultralytics import YOLO, YOLOWorld

    if "world" in model_path.lower():
        model = YOLOWorld(model_path)
        return model, "world"

    return YOLO(model_path), "v8"


class WildGuardDetector:
    def __init__(
        self,
        model_path: str | Path = MODEL_PATH,
        confidence: float = 0.25,
        animals: list[str] | None = None,
    ) -> None:
        self._model, self._model_type = _load_model(str(model_path))
        self.confidence = confidence
        self.animals = animals if animals is not None else ANIMALS

        # YOLO-World needs the target class list set upfront
        if self._model_type == "world":
            self._model.set_classes(self.animals)

        self._frame_counter: dict[str, int] = {}
        ALERTS_DIR.mkdir(exist_ok=True)

    def process_frame(
        self, frame: np.ndarray
    ) -> tuple[np.ndarray, list[dict]]:
        results = self._model.predict(frame, verbose=False, conf=self.confidence)

        seen_labels: set[str] = set()
        validated: list[dict] = []

        for box in results[0].boxes:
            cls        = int(box.cls[0])
            label      = results[0].names[cls]
            confidence = float(box.conf[0])

            if label not in self.animals:
                continue

            seen_labels.add(label)
            self._frame_counter[label] = self._frame_counter.get(label, 0) + 1

            if self._frame_counter[label] >= THRESHOLD:
                threat = self.classify_threat(label)
                bbox   = [int(x) for x in box.xyxy[0].tolist()]

                validated.append({
                    "label":        label,
                    "confidence":   round(confidence, 3),
                    "bbox":         bbox,
                    "threat_level": threat,
                })

                snapshot = None
                if threat == "HIGH":
                    snapshot = self._save_alert(label, frame)
                validated[-1]["snapshot"] = str(snapshot) if snapshot else None

        # Reset counters for animals that disappeared from frame
        for label in list(self._frame_counter):
            if label not in seen_labels:
                del self._frame_counter[label]

        annotated_frame = results[0].plot()
        return annotated_frame, validated

    def annotate(
        self, frame: np.ndarray, detections: list[dict]
    ) -> np.ndarray:
        colours = {"HIGH": (0, 0, 255), "MEDIUM": (0, 165, 255), "LOW": (0, 255, 0)}
        out = frame.copy()
        for det in detections:
            x1, y1, x2, y2 = det["bbox"]
            colour     = colours.get(det["threat_level"], (255, 255, 255))
            label_text = f"{det['label']} {det['confidence']:.2f} [{det['threat_level']}]"
            cv2.rectangle(out, (x1, y1), (x2, y2), colour, 2)
            cv2.putText(out, label_text, (x1, y1 - 8),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55, colour, 2)
        return out

    @staticmethod
    def classify_threat(label: str) -> str:
        high   = {"cheetah", "lion", "leopard", "tiger", "crocodile", "wolf", "bear"}
        medium = {"elephant", "rhinoceros", "hippopotamus", "buffalo",
                  "dog", "cow", "horse", "hyena"}
        if label in high:
            return "HIGH"
        if label in medium:
            return "MEDIUM"
        return "LOW"

    def _save_alert(self, label: str, frame: np.ndarray) -> Path:
        filename = ALERTS_DIR / f"{label}_{int(time.time())}.jpg"
        cv2.imwrite(str(filename), frame)
        print(f"[WildGuard] ALERT saved: {filename}")
        return filename
