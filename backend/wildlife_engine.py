"""
WildlifeEngine — the shared two-stage detection engine used by the API server.

Stage 0  night_vision      classify lighting; enhance dark / IR frames
Stage 1  YOLO / YOLO-World propose animal boxes (class-agnostic NMS) on the
                           enhanced frame — enhancement is what finds animals
                           in the dark
Stage 2  CLIP              verify species on a crop of each box *from the
                           original frame* and reject non-animals (people,
                           vehicles, rocks...). Enhancement smears the fine
                           texture CLIP relies on (a cheetah's spots): on dark
                           test crops CLIP was right 72 % of the time on the
                           original pixels vs 62 % on enhanced ones.
Fusion                     CLIP and detector votes are combined per box; for
                           video the tracker (tracker.py) accumulates these
                           votes over many frames before confirming a species

The engine wraps the project's existing pieces instead of replacing them:
model loading comes from detector._load_model, threat levels from
WildGuardDetector.classify_threat, and the vocabulary starts from
detector.WILDLIFE_ANIMALS. One engine instance (one model in memory) is
shared by every camera and every upload job; inference is serialised by a
lock because ultralytics models are not thread-safe.
"""

import math
import os
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path

# Must be set before torch loads: without it OpenMP worker threads busy-spin
# between inferences. Measured with two live cameras: CPU 90 % → 69 % of the
# machine and per-frame latency 940 ms → ~350 ms.
os.environ.setdefault("OMP_WAIT_POLICY", "PASSIVE")

import cv2
import numpy as np

from detector import WILDLIFE_ANIMALS, WildGuardDetector, _load_model
from night_vision import analyze_lighting, enhance_frame, should_enhance
from species_classifier import SpeciesClassifier

# Species beyond detector.WILDLIFE_ANIMALS that matter around Indian forest
# villages (plus livestock, so cattle are recognised as cattle).
EXTRA_SPECIES = [
    "gaur", "wild boar", "dog", "cow", "horse", "monkey", "fox", "jackal",
    "cat", "goat", "sheep", "snake", "bird",
]
SPECIES: "list[str]" = list(dict.fromkeys(WILDLIFE_ANIMALS + EXTRA_SPECIES))

# Threat levels for species WildGuardDetector.classify_threat doesn't know.
EXTRA_THREAT = {"wild boar": "MEDIUM", "gaur": "MEDIUM", "snake": "MEDIUM"}

# Extra detector vocabulary: lets YOLO-World claim humans as "person" rather
# than forcing them into the nearest animal class. Never reported.
DETECTOR_EXTRA_CLASSES = ["person"]

CLIP_WEIGHT = 0.85        # share of the species vote given to CLIP vs the detector
NEGATIVE_REJECT = 0.55    # drop a box when CLIP puts this much mass on non-animals
NIGHT_CONF_FACTOR = 0.8   # lower the proposal threshold at night (CLIP + tracking filter the rest)
MIN_BOX_PX = 12
CROP_PAD = 0.12

THREAT_COLORS_BGR = {
    "HIGH": (68, 68, 239),
    "MEDIUM": (11, 158, 245),
    "LOW": (129, 185, 16),
}


def classify_threat(label: str) -> str:
    level = WildGuardDetector.classify_threat(label)
    if level == "LOW":
        return EXTRA_THREAT.get(label, "LOW")
    return level


def fused_confidence(det_conf: float, negative: float, species_share: float, verified: bool) -> float:
    """
    Final confidence = geometric mean of "this is an animal" and "it is this
    species". YOLO-World's own score splits between look-alike classes
    (cheetah/dog/hyena), so once CLIP has verified a box its non-animal mass
    is the better animal-ness estimate; unverified boxes keep the detector score.
    """
    animal = max(det_conf, 1.0 - negative) if verified else det_conf
    return math.sqrt(max(animal, 0.0) * max(species_share, 0.0))


def sensitivity_to_conf(sensitivity: float) -> float:
    """Map the dashboard's 20–100 % sensitivity slider to a detector threshold."""
    s = min(max(float(sensitivity), 20.0), 100.0)
    return round(0.6 - (s - 20.0) / 80.0 * 0.5, 3)


@dataclass
class Proposal:
    det_label: str
    det_conf: float
    box: "list[float]"              # x1, y1, x2, y2 in work-frame pixels


@dataclass
class ProposalSet:
    work: np.ndarray                # frame the detector saw (resized, maybe enhanced)
    raw: np.ndarray                 # same size as work, never enhanced — for CLIP crops
    scale: float                    # work = original * scale
    shape: "tuple[int, int]"        # original (h, w)
    lighting: dict
    enhanced: bool
    inference_ms: float
    proposals: "list[Proposal]" = field(default_factory=list)


class WildlifeEngine:
    def __init__(self, model_path: "str | Path", use_classifier: bool = True) -> None:
        self.model_path = Path(model_path)
        self._model, self.model_type = _load_model(str(self.model_path))
        self.species = SPECIES
        self.n_species = len(SPECIES)
        self._index = {s: i for i, s in enumerate(SPECIES)}

        if self.model_type == "world":
            self._model.set_classes(SPECIES + DETECTOR_EXTRA_CLASSES)

        self._lock = threading.Lock()
        self.classifier = SpeciesClassifier(SPECIES)
        self.use_classifier = use_classifier
        if use_classifier:
            self.classifier.load()

        try:
            import torch
            self.device = "cuda" if torch.cuda.is_available() else "cpu"
            # Several cameras infer concurrently; giving torch every core makes
            # them fight over threads. Half the cores (max 8) measured fastest.
            default_threads = min(8, max(2, (os.cpu_count() or 4) // 2))
            torch.set_num_threads(int(os.environ.get("WILDGUARD_TORCH_THREADS", default_threads)))
        except Exception:
            self.device = "cpu"

        self._stats_lock = threading.Lock()
        self.inference_count = 0
        self.avg_inference_ms = 0.0

    # ------------------------------------------------------------------
    # Info
    # ------------------------------------------------------------------

    @property
    def classifier_active(self) -> bool:
        return self.use_classifier and self.classifier.available

    def info(self) -> dict:
        return {
            "model": self.model_path.name,
            "model_type": "YOLO-World (open vocabulary)" if self.model_type == "world" else "YOLOv8 (COCO)",
            "device": self.device,
            "classifier": "CLIP ViT-B/32" if self.classifier.available else None,
            "classifier_enabled": self.classifier_active,
            "species": self.species,
            "inference_count": self.inference_count,
            "avg_inference_ms": round(self.avg_inference_ms, 1),
        }

    def warmup(self) -> None:
        self.propose(np.zeros((360, 640, 3), dtype=np.uint8), night_mode="off")

    # ------------------------------------------------------------------
    # Stage 1 — proposals
    # ------------------------------------------------------------------

    def propose(
        self,
        frame: np.ndarray,
        conf: float = 0.25,
        night_mode: str = "auto",
        lighting: "dict | None" = None,
        max_side: int = 1920,
        force_enhance: "bool | None" = None,
    ) -> ProposalSet:
        h, w = frame.shape[:2]
        scale = min(1.0, max_side / float(max(h, w)))
        raw = (
            cv2.resize(frame, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_AREA)
            if scale < 1.0 else frame
        )
        lighting = lighting or analyze_lighting(raw)
        enhanced = should_enhance(lighting, night_mode) if force_enhance is None else force_enhance
        work = enhance_frame(raw, lighting) if enhanced else raw
        eff_conf = conf * NIGHT_CONF_FACTOR if lighting["is_night"] else conf

        t0 = time.perf_counter()
        with self._lock:
            res = self._model.predict(work, conf=eff_conf, verbose=False, agnostic_nms=True)[0]
        ms = (time.perf_counter() - t0) * 1000.0
        self._record_timing(ms)

        proposals: "list[Proposal]" = []
        for box in res.boxes:
            label = res.names[int(box.cls[0])]
            if label not in self._index:
                continue
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            if x2 - x1 < MIN_BOX_PX or y2 - y1 < MIN_BOX_PX:
                continue
            proposals.append(Proposal(label, float(box.conf[0]), [x1, y1, x2, y2]))

        return ProposalSet(work, raw, scale, (h, w), lighting, enhanced, ms, proposals)

    def _record_timing(self, ms: float) -> None:
        with self._stats_lock:
            self.inference_count += 1
            a = 0.1 if self.inference_count > 10 else 1.0 / self.inference_count
            self.avg_inference_ms += a * (ms - self.avg_inference_ms)

    # ------------------------------------------------------------------
    # Stage 2 — species verification
    # ------------------------------------------------------------------

    def classify(self, image: np.ndarray, boxes: "list[list[float]]") -> "np.ndarray | None":
        """CLIP probabilities for boxes on `image` — pass ProposalSet.raw."""
        if not boxes or not self.classifier_active:
            return None
        h, w = image.shape[:2]
        crops = []
        for x1, y1, x2, y2 in boxes:
            pad = CROP_PAD * max(x2 - x1, y2 - y1)
            cx1, cy1 = int(max(0, x1 - pad)), int(max(0, y1 - pad))
            cx2, cy2 = int(min(w, x2 + pad)), int(min(h, y2 + pad))
            crops.append(image[cy1:cy2, cx1:cx2])
        return self.classifier.classify(crops)

    def fuse(self, det_label: str, clip_row: "np.ndarray | None") -> "tuple[np.ndarray, float]":
        """
        Combine one observation into a distribution over SPECIES.
        Returns (distribution, negative_mass).
        """
        onehot = np.zeros(self.n_species, dtype=np.float32)
        if det_label in self._index:
            onehot[self._index[det_label]] = 1.0
        if clip_row is None:
            return onehot, 0.0
        species_p = clip_row[: self.n_species]
        negative = float(clip_row[self.n_species:].sum())
        species_p = species_p / max(float(species_p.sum()), 1e-6)
        return CLIP_WEIGHT * species_p + (1.0 - CLIP_WEIGHT) * onehot, negative

    # ------------------------------------------------------------------
    # Single-shot detection (images)
    # ------------------------------------------------------------------

    def detect(
        self,
        frame: np.ndarray,
        conf: float = 0.25,
        night_mode: str = "auto",
        thorough: bool = False,
        classify: bool = True,
    ) -> dict:
        ps = self.propose(frame, conf=conf, night_mode=night_mode, max_side=2048)

        if thorough:
            # Dusk frames are classed as "day" and not enhanced; give them a
            # second, enhanced pass and merge (night frames are already enhanced,
            # and a second un-enhanced pass measurably hurt accuracy there).
            borderline = not ps.enhanced and ps.lighting["brightness"] < 110
            if night_mode == "auto" and borderline:
                alt = self.propose(frame, conf=conf, lighting=ps.lighting, max_side=2048,
                                   force_enhance=True)
                ps.proposals = _merge_proposals(ps.proposals, alt.proposals)
                ps.inference_ms += alt.inference_ms

        probs = self.classify(ps.raw, [p.box for p in ps.proposals]) if classify else None
        detections = []
        for i, p in enumerate(ps.proposals):
            dist, negative = self.fuse(p.det_label, probs[i] if probs is not None else None)
            if negative >= NEGATIVE_REJECT:
                continue
            k = int(np.argmax(dist))
            confidence = fused_confidence(p.det_conf, negative, float(dist[k]), probs is not None)
            detections.append(self.detection_dict(
                self.species[k], confidence, p.box, ps, dist, p.det_label, p.det_conf,
                verified=probs is not None,
            ))
        detections.sort(key=lambda d: d["confidence"], reverse=True)
        return {
            "detections": detections,
            "lighting": ps.lighting,
            "enhanced": ps.enhanced,
            "inference_ms": round(ps.inference_ms, 1),
            "work": ps.work,
            "scale": ps.scale,
        }

    def detection_dict(
        self,
        label: str,
        confidence: float,
        work_box: "list[float]",
        ps: ProposalSet,
        dist: "np.ndarray | None",
        det_label: str,
        det_conf: float,
        verified: bool,
    ) -> dict:
        h, w = ps.shape
        x1, y1, x2, y2 = [v / ps.scale for v in work_box]
        x1, y1 = max(0.0, x1), max(0.0, y1)
        x2, y2 = min(float(w), x2), min(float(h), y2)
        alternatives = []
        if dist is not None:
            for j in np.argsort(-dist)[:3]:
                if dist[j] >= 0.03:
                    alternatives.append({"label": self.species[j], "score": round(float(dist[j]), 3)})
        return {
            "label": label,
            "confidence": round(float(confidence), 3),
            "threat_level": classify_threat(label),
            "bbox": [int(x1), int(y1), int(x2), int(y2)],
            "bbox_norm": {
                "x": round(x1 / w, 4), "y": round(y1 / h, 4),
                "w": round((x2 - x1) / w, 4), "h": round((y2 - y1) / h, 4),
            },
            "detector_label": det_label,
            "detector_confidence": round(float(det_conf), 3),
            "species_scores": alternatives,
            "verified": verified,
        }


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------

def iou(a: "list[float]", b: "list[float]") -> float:
    ix1, iy1 = max(a[0], b[0]), max(a[1], b[1])
    ix2, iy2 = min(a[2], b[2]), min(a[3], b[3])
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    if inter <= 0:
        return 0.0
    area_a = (a[2] - a[0]) * (a[3] - a[1])
    area_b = (b[2] - b[0]) * (b[3] - b[1])
    return inter / max(area_a + area_b - inter, 1e-6)


def _merge_proposals(a: "list[Proposal]", b: "list[Proposal]", thresh: float = 0.5) -> "list[Proposal]":
    merged = sorted(a + b, key=lambda p: p.det_conf, reverse=True)
    keep: "list[Proposal]" = []
    for p in merged:
        if all(iou(p.box, k.box) < thresh for k in keep):
            keep.append(p)
    return keep


# ----------------------------------------------------------------------
# Drawing
# ----------------------------------------------------------------------

def _scale_box(bbox, scale):
    return [int(round(v * scale)) for v in bbox]


def draw_detections(img: np.ndarray, detections: "list[dict]", scale: float = 1.0) -> np.ndarray:
    """
    Draw detections (bbox in original-frame pixels) onto `img`, which is the
    original frame resized by `scale`. Items with "confirmed": False are drawn
    as thin grey "verifying" boxes.
    """
    unit = max(1, round(min(img.shape[:2]) / 400))
    font = cv2.FONT_HERSHEY_SIMPLEX
    fs = 0.42 * unit + 0.08

    for det in detections:
        x1, y1, x2, y2 = _scale_box(det["bbox"], scale)
        confirmed = det.get("confirmed", True)
        color = THREAT_COLORS_BGR.get(det["threat_level"], (220, 220, 220))

        if not confirmed:
            cv2.rectangle(img, (x1, y1), (x2, y2), (190, 190, 190), 1, cv2.LINE_AA)
            cv2.putText(img, "verifying...", (x1 + 3, max(12, y1 - 5)), font, fs * 0.85,
                        (210, 210, 210), 1, cv2.LINE_AA)
            continue

        cv2.rectangle(img, (x1, y1), (x2, y2), color, unit + 1, cv2.LINE_AA)
        tick = max(8, min(26, (x2 - x1) // 4, (y2 - y1) // 4))
        th = unit + 3
        for (cx, cy, dx, dy) in ((x1, y1, 1, 1), (x2, y1, -1, 1), (x1, y2, 1, -1), (x2, y2, -1, -1)):
            cv2.line(img, (cx, cy), (cx + dx * tick, cy), color, th, cv2.LINE_AA)
            cv2.line(img, (cx, cy), (cx, cy + dy * tick), color, th, cv2.LINE_AA)

        text = f"{det['label'].upper()}  {det['confidence'] * 100:.0f}%"
        (tw, tht), base = cv2.getTextSize(text, font, fs, unit)
        pad = 4 * unit
        ly2 = y1 - 2 if y1 - tht - 2 * pad - 2 > 0 else y1 + tht + 2 * pad
        ly1 = ly2 - tht - 2 * pad
        cv2.rectangle(img, (x1, ly1), (x1 + tw + 2 * pad, ly2), color, -1)
        cv2.putText(img, text, (x1 + pad, ly2 - pad - base // 2), font, fs, (12, 14, 10), unit, cv2.LINE_AA)
    return img


def draw_hud(img: np.ndarray, left: str, lighting: "dict | None" = None, enhanced: bool = False) -> np.ndarray:
    """Camera-style HUD: identifier/time on the left, lighting badge on the right."""
    unit = max(1, round(min(img.shape[:2]) / 400))
    font = cv2.FONT_HERSHEY_SIMPLEX
    fs = 0.4 * unit + 0.08
    pad = 6 * unit

    def badge(text, x, y, fg, bg, align_right=False):
        (tw, th), base = cv2.getTextSize(text, font, fs, unit)
        bx1 = x - tw - 2 * pad if align_right else x
        roi = img[y:y + th + 2 * pad, bx1:bx1 + tw + 2 * pad]
        if roi.size:
            overlay = np.full_like(roi, bg)
            cv2.addWeighted(overlay, 0.6, roi, 0.4, 0, roi)
        cv2.putText(img, text, (bx1 + pad, y + th + pad - base // 2), font, fs, fg, unit, cv2.LINE_AA)

    badge(left, 10 * unit, 10 * unit, (230, 235, 230), (10, 12, 10))
    if lighting and lighting.get("is_night"):
        mode = "IR" if lighting.get("mode") == "infrared" else "LOW-LIGHT"
        text = f"NIGHT VISION | {mode}" + (" | ENHANCED" if enhanced else "")
        badge(text, img.shape[1] - 10 * unit, 10 * unit, (160, 240, 200), (20, 50, 30), align_right=True)
    return img
