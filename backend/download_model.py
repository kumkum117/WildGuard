"""
Downloads the YOLO-World wildlife model for WildGuard.

YOLO-World is an open-vocabulary detector built into ultralytics — it can
detect any animal you name (cheetah, lion, leopard, etc.) without retraining.
No extra packages needed beyond what is already installed.
"""

from ultralytics import YOLOWorld
from pathlib import Path

MODEL_NAME = "yolov8s-worldv2.pt"
DEST = Path(__file__).resolve().parents[1] / "models" / MODEL_NAME


def main() -> None:
    print("Downloading YOLO-World wildlife model ...")
    print(f"  Model : {MODEL_NAME}")
    print(f"  Dest  : {DEST}\n")

    DEST.parent.mkdir(exist_ok=True)

    # ultralytics downloads and caches the model automatically on first load
    model = YOLOWorld(MODEL_NAME)

    # Copy from ultralytics cache to our models/ folder so --model arg works
    import shutil, torch
    cached = Path(torch.hub.get_dir()) / "ultralytics" / "assets" / MODEL_NAME
    if not DEST.exists():
        # Model is already usable by name; copy only if cache path is found
        if cached.exists():
            shutil.copy2(cached, DEST)
            print(f"Saved to {DEST}")
        else:
            print(f"Model ready — ultralytics will load it by name automatically.")

    print("\nDone! Run WildGuard with the wildlife model:")
    print(f"  python backend/app.py --model models/{MODEL_NAME}")
    print(f"\nDetects: cheetah, lion, leopard, tiger, elephant, giraffe,")
    print(f"         zebra, rhinoceros, hippopotamus, crocodile, wolf, bear, ...")


if __name__ == "__main__":
    main()
