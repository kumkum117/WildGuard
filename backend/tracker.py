"""
Multi-frame tracker with species voting.

The original detector confirms an animal after its *label* appears in 3
frames (THRESHOLD = 3). That works for a single animal but mixes up several
animals of one species and lets one mislabelled frame reset the count.
This tracker keeps the same "seen in 3 inference frames" rule but applies it
per individual animal:

  * boxes are linked across frames by overlap / proximity (fast-moving
    animals like a sprinting cheetah barely overlap between inferences);
  * each track accumulates the fused detector + CLIP species distribution,
    weighted by confidence, so the clearest frames dominate the verdict;
  * CLIP is re-run on a track at most once per `reclassify_s` seconds once
    it is established, which keeps CPU cost flat with many animals;
  * tracks CLIP considers non-animals (people, rocks...) are never confirmed.
"""

import math
from typing import Callable

import numpy as np

from wildlife_engine import NEGATIVE_REJECT, ProposalSet, classify_threat, fused_confidence, iou

EVIDENCE_DECAY = 0.85   # per classified observation; ≈ last 6–7 views dominate
STABLE_SHARE = 0.6      # species share above which CLIP is throttled to reclassify_s
STABLE_STREAK = 3       # inferences the top species must hold before it is announced


class Track:
    def __init__(self, tid: int, box: "list[float]", det_label: str, det_conf: float,
                 n_species: int, now: float) -> None:
        self.id = tid
        self.box = box
        self.det_label = det_label
        self.det_conf = det_conf
        self.scores = np.zeros(n_species, dtype=np.float64)
        self.weight = 0.0
        self.negative = 0.0
        self.hits = 1
        self.misses = 0
        self.first_seen = now
        self.last_seen = now
        self.velocity = (0.0, 0.0)   # box-centre px/s, for drawing between inferences
        self.last_classified = 0.0
        self.clip_obs = 0
        self.label_streak = 0
        self._streak_index = -1
        self.confirmed = False
        self.emitted_label: "str | None" = None
        self.alerted: "set[str]" = set()
        self.best_confidence = 0.0

    def add_evidence(self, dist: np.ndarray, negative: float, det_conf: float) -> None:
        # Recency-weighted vote: an animal approaching the camera starts as a
        # blurry blob and becomes identifiable, so newer views count more.
        w = det_conf * (0.5 + float(dist.max()))
        self.scores = self.scores * EVIDENCE_DECAY + w * dist
        self.weight = self.weight * EVIDENCE_DECAY + w
        self.negative = self.negative * EVIDENCE_DECAY + w * negative

    @property
    def negative_ratio(self) -> float:
        return self.negative / self.weight if self.weight else 0.0

    def label_index(self) -> int:
        return int(np.argmax(self.scores))

    def label_share(self) -> float:
        return float(self.scores.max() / self.weight) if self.weight else 0.0

    @property
    def stable(self) -> bool:
        """Confirmed and the same species has led for STABLE_STREAK inferences."""
        return self.confirmed and self.label_streak >= STABLE_STREAK

    def _update_streak(self) -> None:
        k = self.label_index() if self.weight > 0 else -1
        if k == self._streak_index:
            self.label_streak += 1
        else:
            self._streak_index, self.label_streak = k, 1

    def confidence(self) -> float:
        return fused_confidence(self.det_conf, self.negative_ratio, self.label_share(), self.clip_obs > 0)


class Tracker:
    def __init__(
        self,
        species: "list[str]",
        min_hits: int = 3,
        max_misses: int = 4,
        max_age_s: float = 3.0,
        reclassify_s: float = 1.0,
        max_crops: int = 8,
    ) -> None:
        self.species = species
        self.n_species = len(species)
        self.min_hits = min_hits
        self.max_misses = max_misses
        self.max_age_s = max_age_s
        self.reclassify_s = reclassify_s
        self.max_crops = max_crops
        self.tracks: "list[Track]" = []
        self._next_id = 1

    def reset(self) -> None:
        self.tracks.clear()

    # ------------------------------------------------------------------

    def step(
        self,
        ps: ProposalSet,
        classify_fn: "Callable[[list[list[float]]], np.ndarray | None]",
        fuse_fn: "Callable[[str, np.ndarray | None], tuple[np.ndarray, float]]",
        classifier_active: bool,
        now: float,
    ) -> "list[Track]":
        """Advance one inference frame. Returns tracks seen in this frame."""
        props = ps.proposals
        boxes = [[v / ps.scale for v in p.box] for p in props]

        matches = self._match(boxes)                    # det index -> track
        new_dets = [i for i in range(len(props)) if i not in matches]

        # Choose which boxes CLIP looks at this round.
        to_classify: "list[int]" = []
        if classifier_active:
            to_classify.extend(new_dets)
            # Keep sampling every frame while the species is still uncertain —
            # the decisive view of a moving animal may last only a few frames.
            stale = sorted(
                (i for i, t in matches.items()
                 if t.hits < self.min_hits + 2
                 or t.label_share() < STABLE_SHARE
                 or now - t.last_classified >= self.reclassify_s),
                key=lambda i: matches[i].last_classified,
            )
            to_classify.extend(stale)
            to_classify = to_classify[: self.max_crops]

        probs = classify_fn([props[i].box for i in to_classify]) if to_classify else None
        rows = {i: probs[k] for k, i in enumerate(to_classify)} if probs is not None else {}

        seen: "list[Track]" = []
        for i, p in enumerate(props):
            track = matches.get(i)
            if track is None:
                track = Track(self._next_id, boxes[i], p.det_label, p.det_conf, self.n_species, now)
                self._next_id += 1
                self.tracks.append(track)
            else:
                dt = now - track.last_seen
                if 0 < dt < 2.0:
                    (ox, oy), (nx, ny) = _centre(track.box), _centre(boxes[i])
                    vx, vy = (nx - ox) / dt, (ny - oy) / dt
                    track.velocity = (0.5 * track.velocity[0] + 0.5 * vx, 0.5 * track.velocity[1] + 0.5 * vy)
                track.box = boxes[i]
                track.det_label = p.det_label
                track.det_conf = 0.6 * track.det_conf + 0.4 * p.det_conf
                track.hits += 1
                track.misses = 0
                track.last_seen = now

            if i in rows:
                dist, negative = fuse_fn(p.det_label, rows[i])
                track.add_evidence(dist, negative, p.det_conf)
                track.last_classified = now
                track.clip_obs += 1
            elif not classifier_active:
                dist, negative = fuse_fn(p.det_label, None)
                track.add_evidence(dist, negative, p.det_conf)

            track._update_streak()
            if (not track.confirmed and track.hits >= self.min_hits and track.weight > 0
                    and track.negative_ratio < NEGATIVE_REJECT):
                track.confirmed = True
            track.best_confidence = max(track.best_confidence, track.confidence())
            seen.append(track)

        seen_ids = {t.id for t in seen}
        for t in self.tracks:
            if t.id not in seen_ids:
                t.misses += 1
        self.tracks = [
            t for t in self.tracks
            if t.misses <= self.max_misses and now - t.last_seen <= self.max_age_s
        ]
        return seen

    def _match(self, boxes: "list[list[float]]") -> "dict[int, Track]":
        candidates = []
        for ti, t in enumerate(self.tracks):
            tw, th = t.box[2] - t.box[0], t.box[3] - t.box[1]
            diag = math.hypot(tw, th) or 1.0
            tcx, tcy = (t.box[0] + t.box[2]) / 2, (t.box[1] + t.box[3]) / 2
            for di, b in enumerate(boxes):
                overlap = iou(t.box, b)
                dcx, dcy = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
                dist = math.hypot(dcx - tcx, dcy - tcy) / diag
                # Generous gate: at 2–4 inferences/s a sprinting animal can
                # move more than its own length between frames.
                if overlap >= 0.1 or dist <= 1.0:
                    candidates.append((overlap + max(0.0, 1.0 - dist) * 0.5, ti, di))
        candidates.sort(reverse=True)
        used_t, out = set(), {}
        for _, ti, di in candidates:
            if ti in used_t or di in out:
                continue
            used_t.add(ti)
            out[di] = self.tracks[ti]
        return out

    # ------------------------------------------------------------------

    def describe(self, track: Track, shape: "tuple[int, int]") -> dict:
        """Detection-style dict for a track (bbox in original-frame pixels)."""
        h, w = shape
        x1, y1, x2, y2 = track.box
        x1, y1, x2, y2 = max(0.0, x1), max(0.0, y1), min(float(w), x2), min(float(h), y2)
        if track.weight > 0:
            k = track.label_index()
            label = self.species[k]
            dist = track.scores / track.weight
            alternatives = [
                {"label": self.species[j], "score": round(float(dist[j]), 3)}
                for j in np.argsort(-dist)[:3] if dist[j] >= 0.03
            ]
        else:
            label, alternatives = track.det_label, []
        return {
            "track_id": track.id,
            "label": label,
            "confidence": round(track.confidence(), 3),
            "threat_level": classify_threat(label),
            "bbox": [int(x1), int(y1), int(x2), int(y2)],
            "bbox_norm": {
                "x": round(x1 / w, 4), "y": round(y1 / h, 4),
                "w": round((x2 - x1) / w, 4), "h": round((y2 - y1) / h, 4),
            },
            "confirmed": track.confirmed,
            "stable": track.stable,
            "hits": track.hits,
            "velocity": [round(track.velocity[0], 1), round(track.velocity[1], 1)],
            "detector_label": track.det_label,
            "species_scores": alternatives,
        }


def _centre(box: "list[float]") -> "tuple[float, float]":
    return (box[0] + box[2]) / 2, (box[1] + box[3]) / 2


def extrapolate(detections: "list[dict]", seconds: float, max_seconds: float = 0.8) -> "list[dict]":
    """
    Shift boxes along their tracks' velocity. Inference runs a few times per
    second while video plays at 15–30 fps, so without this a running animal
    leaves its box behind between inferences.
    """
    dt = min(max(seconds, 0.0), max_seconds)
    if dt == 0:
        return detections
    out = []
    for d in detections:
        vx, vy = d.get("velocity", (0.0, 0.0))
        x1, y1, x2, y2 = d["bbox"]
        out.append({**d, "bbox": [x1 + vx * dt, y1 + vy * dt, x2 + vx * dt, y2 + vy * dt]})
    return out

