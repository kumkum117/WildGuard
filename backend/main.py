import argparse
import time
from pathlib import Path

import cv2
from ultralytics import YOLO

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_VIDEO = PROJECT_ROOT / "data" / "videos" / "test.mp4"
MODEL_PATH = PROJECT_ROOT / "yolov8n.pt"
ALERTS_DIR = PROJECT_ROOT / "alerts"

# Load YOLO model.
model = YOLO(str(MODEL_PATH))

# Animal classes in the default YOLO COCO model.
ANIMALS = ["dog", "cat", "cow", "horse", "sheep"]


def classify_threat(label):
    high = ["horse"]  # Demo: default YOLO does not detect tiger/elephant.
    medium = ["dog", "cow"]

    if label in high:
        return "HIGH"
    elif label in medium:
        return "MEDIUM"
    else:
        return "LOW"


# Multi-frame tracking.
frame_counter = {}
THRESHOLD = 3


def normalize_source(source):
    source_text = str(source)

    if source_text.isdigit():
        return int(source_text)

    source_path = Path(source_text)
    if not source_path.is_absolute():
        source_path = PROJECT_ROOT / source_path

    return str(source_path)


def run_detection(source=DEFAULT_VIDEO):
    source = normalize_source(source)
    cap = cv2.VideoCapture(source)

    if not cap.isOpened():
        print(f"Cannot open camera/video source: {source}")
        return

    ALERTS_DIR.mkdir(exist_ok=True)
    print(f"WildGuard AI running on: {source}")
    print("Press 'q' to exit")

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        results = model(frame)

        for box in results[0].boxes:
            cls = int(box.cls[0])
            label = model.names[cls]
            confidence = float(box.conf[0])

            # Filter animals + confidence.
            if label in ANIMALS and confidence > 0.7:
                frame_counter[label] = frame_counter.get(label, 0) + 1

                # Multi-frame validation.
                if frame_counter[label] >= THRESHOLD:
                    threat = classify_threat(label)

                    print(f"Detected: {label} | Threat: {threat}")

                    if threat == "HIGH":
                        print("ALERT TRIGGERED!")

                        filename = ALERTS_DIR / f"{label}_{int(time.time())}.jpg"
                        cv2.imwrite(str(filename), frame)

        annotated_frame = results[0].plot()
        cv2.imshow("WildGuard AI", annotated_frame)

        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run WildGuard animal detection.")
    parser.add_argument(
        "--source",
        default=str(DEFAULT_VIDEO),
        help="Video path or camera index. Use 0 for webcam.",
    )
    args = parser.parse_args()
    run_detection(args.source)
