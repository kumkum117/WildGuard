"""
Zero-shot species classifier (second detection stage).

YOLO-World is good at *finding* animals but weak at telling similar species
apart — on the project's own test footage it labels a running cheetah as
"dog", "giraffe" or "wolf" (which is why alerts/ is full of wolf_*.jpg).
CLIP, looking at a tight crop of each detected box, is much better at
fine-grained species identity. WildGuard therefore runs CLIP on every new
box and fuses its verdict with the detector's label (see wildlife_engine).

Uses the same CLIP ViT-B/32 weights that YOLO-World downloads for
set_classes(), so no extra download is normally needed. If CLIP cannot be
loaded the engine silently falls back to detector-only labels.
"""

import hashlib
import threading
from pathlib import Path

import cv2
import numpy as np

CACHE_DIR = Path(__file__).resolve().parents[1] / "data" / "cache"

# Prompt ensemble — averaging embeddings over several phrasings makes the
# classifier robust to blur, low resolution and night-vision imagery.
PROMPT_TEMPLATES = [
    "a photo of a {}.",
    "a blurry photo of a {}.",
    "a low resolution photo of a {}.",
    "a wildlife photo of a {}.",
    "a camera trap photo of a {}.",
    "a photo of a {} running.",
    "a night vision photo of a {}.",
    "an infrared camera photo of a {}.",
]

# How a label is phrased for CLIP. Bare "gaur" is ambiguous to CLIP and black
# cattle drifted to it; on 76 cow crops from the sample footage these names cut
# gaur confusions from 5 to 0 (cow 53 → 58 correct) with no cheetah change.
PROMPT_NAMES = {
    "gaur": "gaur, a wild Indian bison",
    "cow": "cow, domestic cattle",
    "buffalo": "water buffalo",
    "wild boar": "wild boar, a wild pig",
}

# Non-animal classes. A box whose probability mass lands mostly here is a
# false positive (a person, a vehicle, a rock, a patch of grass...).
NEGATIVE_LABELS = ["person", "vehicle", "tree", "rock", "grass", "building", "toy"]


class SpeciesClassifier:
    def __init__(self, species: "list[str]", model_name: str = "ViT-B/32") -> None:
        self.species = list(species)
        self.negatives = list(NEGATIVE_LABELS)
        self.labels = self.species + self.negatives
        self.n_species = len(self.species)
        self.model_name = model_name

        self._model = None
        self._preprocess = None
        self._text_features = None
        self._torch = None
        self._lock = threading.Lock()
        self._load_error: "str | None" = None

    # ------------------------------------------------------------------

    @property
    def available(self) -> bool:
        return self._model is not None

    @property
    def load_error(self) -> "str | None":
        return self._load_error

    def load(self) -> bool:
        if self._model is not None:
            return True
        with self._lock:
            if self._model is not None:
                return True
            try:
                import clip
                import torch

                model, preprocess = clip.load(self.model_name, device="cpu")
                model.eval()
                self._text_features = self._text_embeddings(clip, torch, model)
                self._torch = torch
                self._preprocess = preprocess
                self._model = model
                print(f"[Classifier] CLIP {self.model_name} ready — {self.n_species} species")
                return True
            except Exception as exc:  # missing package, no weights, etc.
                self._load_error = str(exc)
                print(f"[Classifier] CLIP unavailable, using detector labels only — {exc}")
                return False

    def _text_embeddings(self, clip, torch, model):
        """Prompt-ensembled label embeddings, cached on disk (~6 s to compute)."""
        names = [PROMPT_NAMES.get(label, label) for label in self.labels]
        key = hashlib.sha1(
            "|".join([self.model_name, *names, *PROMPT_TEMPLATES]).encode()
        ).hexdigest()[:16]
        cache = CACHE_DIR / f"clip_text_{key}.npy"
        if cache.exists():
            try:
                return torch.from_numpy(np.load(cache))
            except Exception:
                pass
        with torch.no_grad():
            feats = []
            for name in names:
                tokens = clip.tokenize([t.format(name) for t in PROMPT_TEMPLATES])
                emb = model.encode_text(tokens).float()
                emb /= emb.norm(dim=-1, keepdim=True)
                emb = emb.mean(dim=0)
                feats.append(emb / emb.norm())
            features = torch.stack(feats)
        try:
            CACHE_DIR.mkdir(parents=True, exist_ok=True)
            np.save(cache, features.numpy())
        except OSError:
            pass
        return features

    # ------------------------------------------------------------------

    def classify(self, crops: "list[np.ndarray]") -> "np.ndarray | None":
        """
        Classify BGR crops. Returns an (N, len(labels)) array of softmax
        probabilities over species + negatives, or None if CLIP is offline.
        """
        if not crops or not self.available:
            return None

        from PIL import Image

        torch = self._torch
        batch = torch.stack([
            self._preprocess(Image.fromarray(cv2.cvtColor(c, cv2.COLOR_BGR2RGB)))
            for c in crops
        ])
        with self._lock, torch.no_grad():
            img = self._model.encode_image(batch).float()
            img /= img.norm(dim=-1, keepdim=True)
            probs = (100.0 * img @ self._text_features.T).softmax(dim=-1)
        return probs.numpy()
