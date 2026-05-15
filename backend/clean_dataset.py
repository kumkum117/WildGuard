"""
Dataset cleaning script for the TestReal wildlife dataset.

What it does:
  - Reads each CSV annotation file
  - Skips frames with missing bboxes (0,0,0,0) — animal was not visible
  - Skips frames where the bounding box is too tiny to be useful
  - Copies only the good images into a cleaned output folder
  - Prints a summary of how much was kept vs removed
"""

import csv
import shutil
from pathlib import Path

DATASET_ROOT  = Path(r"C:\Users\kumar\OneDrive\Desktop\TestReal")
ANNOTATIONS   = DATASET_ROOT / "annotations"
IMAGES        = DATASET_ROOT / "images"
OUTPUT        = DATASET_ROOT / "cleaned" / "images"

# Minimum bounding box area in pixels. Boxes smaller than this are too blurry
# or too far away to be useful for training.
MIN_BBOX_AREA = 400   # 20×20 px


def is_valid(x: int, y: int, w: int, h: int) -> bool:
    if w == 0 and h == 0:
        return False          # completely missing annotation
    if w * h < MIN_BBOX_AREA:
        return False          # animal too small / too far away
    return True


def clean_sequence(csv_path: Path) -> tuple[int, int]:
    """
    Returns (kept, removed) image counts for one sequence.
    """
    seq_id     = csv_path.stem                  # e.g. "0000000011_0000000000"
    images_dir = IMAGES / seq_id
    out_dir    = OUTPUT / seq_id

    if not images_dir.exists():
        print(f"  [WARN] No images folder for {seq_id} — skipping")
        return 0, 0

    # CSV columns (no header):
    #   frame_id, track_id, x, y, width, height, occluded?, ...
    valid_frames: set[int] = set()
    with open(csv_path, newline="") as f:
        for row in csv.reader(f):
            if len(row) < 6:
                continue
            try:
                frame_id = int(row[0])
                x, y, w, h = int(row[2]), int(row[3]), int(row[4]), int(row[5])
            except ValueError:
                continue
            if is_valid(x, y, w, h):
                valid_frames.add(frame_id)

    if not valid_frames:
        print(f"  [WARN] {seq_id}: no valid annotations — skipping whole sequence")
        return 0, 0

    out_dir.mkdir(parents=True, exist_ok=True)

    kept = removed = 0
    for img in sorted(images_dir.glob("*.jpg")):
        # Filename pattern: SEQID_0000000087.jpg  →  frame 87
        try:
            frame_num = int(img.stem.split("_")[-1])
        except ValueError:
            continue

        if frame_num in valid_frames:
            shutil.copy2(img, out_dir / img.name)
            kept += 1
        else:
            removed += 1

    return kept, removed


def main() -> None:
    print("=" * 50)
    print("  WildGuard — Dataset Cleaner")
    print("=" * 50)
    print(f"  Source : {DATASET_ROOT}")
    print(f"  Output : {OUTPUT.parent}")
    print(f"  Min bbox area: {MIN_BBOX_AREA} px²")
    print()

    csv_files = sorted(ANNOTATIONS.glob("*.csv"))
    if not csv_files:
        print("No CSV annotation files found. Check DATASET_ROOT path.")
        return

    total_kept = total_removed = 0

    for csv_path in csv_files:
        kept, removed = clean_sequence(csv_path)
        total = kept + removed
        pct   = f"{100 * kept / total:.0f}%" if total else "—"
        print(f"  {csv_path.stem}  →  kept {kept:>5} / {total:<5}  ({pct})")
        total_kept    += kept
        total_removed += removed

    grand_total = total_kept + total_removed
    print()
    print("=" * 50)
    print(f"  Total images kept   : {total_kept:>6}")
    print(f"  Total images removed: {total_removed:>6}")
    if grand_total:
        print(f"  Kept rate           : {100 * total_kept / grand_total:.1f}%")
    print(f"  Cleaned images saved to: {OUTPUT}")
    print("=" * 50)


if __name__ == "__main__":
    main()
