"""
Service OCR multilingue professionnel.
- Extrait le texte des PDF et images (factures, CT) en FR/EN/IT/DE/ES/PT/NL.
- Détecte les zones à faible confiance et les signale à l'utilisateur.
- Fournit le texte brut + métadonnées de confiance par bloc.

Moteur : RapidOCR (léger, multilingue latin) avec fallback Tesseract si dispo.
"""
from __future__ import annotations

import io
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from PIL import Image, ImageOps, ImageEnhance

from app.core.config import settings


@dataclass
class OCRZone:
    """Un bloc de texte extrait avec sa confiance et sa localisation."""
    text: str
    confidence: float          # 0..1
    bbox: tuple[int, int, int, int] | None = None   # (x1, y1, x2, y2)
    page: int = 1
    language_hint: str | None = None
    is_reliable: bool = True   # False si sous le seuil de confiance


@dataclass
class OCRResult:
    full_text: str
    zones: list[OCRZone] = field(default_factory=list)
    unreadable_zones: list[dict] = field(default_factory=list)  # zones à vérifier manuellement
    detected_language: str | None = None
    average_confidence: float = 0.0
    page_count: int = 1
    engine: str = "rapidocr"

    def to_dict(self) -> dict:
        return {
            "full_text": self.full_text,
            "detected_language": self.detected_language,
            "average_confidence": round(self.average_confidence, 3),
            "page_count": self.page_count,
            "engine": self.engine,
            "zones_count": len(self.zones),
            "unreadable_zones": self.unreadable_zones,
        }


class OCRService:
    """Service OCR singleton."""

    def __init__(self):
        self._rapidocr = None
        self._init_engine()

    def _init_engine(self):
        try:
            from rapidocr_onnxruntime import RapidOCR
            self._rapidocr = RapidOCR()
            self.engine = "rapidocr"
        except Exception:
            self._rapidocr = None
            self.engine = "none"

    # ------------------------------------------------------------------ utils
    @staticmethod
    def _preprocess_image(img: Image.Image) -> Image.Image:
        """Améliore la qualité pour l'OCR : niveaux de gris, contraste, débruitage léger."""
        img = ImageOps.exif_transpose(img)  # corriger l'orientation EXIF
        img = img.convert("L")
        img = ImageEnhance.Contrast(img).enhance(1.4)
        img = ImageEnhance.Sharpness(img).enhance(1.5)
        return img

    def _pdf_to_images(self, pdf_path: Path) -> list[Image.Image]:
        from pdf2image import convert_from_path
        images = convert_from_path(str(pdf_path), dpi=settings.OCR_DPI)
        return images

    @staticmethod
    def _load_image(path: Path) -> Image.Image:
        return Image.open(path)

    # ------------------------------------------------------------- détection langue
    @staticmethod
    def detect_language(text: str) -> str:
        """Heuristique de détection de langue à partir de mots-clés."""
        t = text.lower()
        scores = {"fr": 0, "en": 0, "it": 0, "de": 0, "es": 0, "pt": 0, "nl": 0}

        keywords = {
            "fr": ["facture", "total ttc", "tva", "bon de commande", "révision", "entretien",
                   "kilométrage", "garage", "montant", "réparation", "contrôle technique",
                   "main d'œuvre", "désignation", "quantité", "prix unitaire", "garantie"],
            "en": ["invoice", "total", "vat", "mileage", "garage", "repair", "service",
                   "maintenance", "control", "labour", "labor", "quantity", "unit price",
                   "vehicle", "technician", "parts", "amount due", "mot", "inspection"],
            "it": ["fattura", "totale", "iva", "chilometraggio", "officina", "riparazione",
                   "revisione", "manutenzione", "garanzia", "quantità", "prezzo",
                   "importo", "veicolo", "controllo", "reparto", "ricambi", "ore"],
            "de": ["rechnung", "gesamt", "mwst", "kilometerstand", "werkstatt", "reparatur",
                   "wartung", "garantie", "menge", "preis", "betrag", "fahrzeug",
                   "inspektion", "ersatzteile", "arbeitszeit"],
            "es": ["factura", "total", "iva", "kilometraje", "taller", "reparación",
                   "mantenimiento", "garantía", "cantidad", "precio", "importe",
                   "vehículo", "control", "piezas", "mano de obra"],
            "pt": ["fatura", "total", "iva", "quilometragem", "oficina", "reparação",
                   "manutenção", "garantia", "quantidade", "preço", "importância",
                   "veículo", "inspeção", "peças", "mão de obra"],
            "nl": ["factuur", "totaal", "btw", "kilometerstand", "garage", "reparatie",
                   "onderhoud", "garantie", "aantal", "prijs", "bedrag", "voertuig",
                   "keuring", "onderdelen", "arbeidsloon"],
        }
        for lang, words in keywords.items():
            for w in words:
                scores[lang] += t.count(w)
        best = max(scores, key=scores.get)
        return best if scores[best] > 0 else "fr"

    # ------------------------------------------------------------------ OCR core
    def _ocr_image_rapidocr(self, img: Image.Image, page: int) -> list[OCRZone]:
        """OCR via RapidOCR, retourne les zones avec confiance."""
        import numpy as np
        img_proc = self._preprocess_image(img)
        arr = np.array(img_proc)
        result, _ = self._rapidocr(arr)
        zones: list[OCRZone] = []
        if not result:
            return zones
        for item in result:
            bbox_pts, text, conf = item[0], item[1], float(item[2])
            xs = [p[0] for p in bbox_pts]
            ys = [p[1] for p in bbox_pts]
            bbox = (int(min(xs)), int(min(ys)), int(max(xs)), int(max(ys)))
            zones.append(OCRZone(
                text=text.strip(),
                confidence=conf,
                bbox=bbox,
                page=page,
                is_reliable=conf >= settings.OCR_CONFIDENCE_THRESHOLD,
            ))
        return zones

    def _ocr_image_tesseract(self, img: Image.Image, page: int) -> list[OCRZone]:
        """Fallback OCR via Tesseract avec données de confiance (TSV)."""
        import pytesseract
        img_proc = self._preprocess_image(img)
        langs = "+".join(settings.OCR_LANGUAGES)
        try:
            tsv = pytesseract.image_to_data(
                img_proc, lang=langs, config="--psm 6", output_type=pytesseract.Output.DICT
            )
        except Exception:
            tsv = pytesseract.image_to_data(
                img_proc, lang="eng+fra+ita", config="--psm 6", output_type=pytesseract.Output.DICT
            )
        zones: list[OCRZone] = []
        n = len(tsv["text"])
        for i in range(n):
            txt = (tsv["text"][i] or "").strip()
            if not txt:
                continue
            try:
                conf = float(tsv["conf"][i])
            except (TypeError, ValueError):
                conf = -1.0
            conf = conf / 100.0 if conf >= 0 else 0.0
            zones.append(OCRZone(
                text=txt,
                confidence=conf,
                bbox=(tsv["left"][i], tsv["top"][i],
                      tsv["left"][i] + tsv["width"][i], tsv["top"][i] + tsv["height"][i]),
                page=page,
                is_reliable=conf >= settings.OCR_CONFIDENCE_THRESHOLD,
            ))
        return zones

    def _ocr_image(self, img: Image.Image, page: int) -> list[OCRZone]:
        if self._rapidocr is not None:
            return self._ocr_image_rapidocr(img, page)
        return self._ocr_image_tesseract(img, page)

    # --------------------------------------------------------------- API publique
    def process_file(self, file_path: Path) -> OCRResult:
        """
        Traite un fichier (PDF ou image) et retourne le résultat OCR complet
        avec les zones illisibles identifiées.
        """
        suffix = file_path.suffix.lower()
        images: list[Image.Image] = []
        if suffix == ".pdf":
            images = self._pdf_to_images(file_path)
        else:
            images = [self._load_image(file_path)]

        all_zones: list[OCRZone] = []
        for idx, img in enumerate(images, start=1):
            all_zones.extend(self._ocr_image(img, page=idx))

        full_text = "\n".join(z.text for z in all_zones if z.text)
        lang = self.detect_language(full_text)

        # Agréger les lignes en blocs par page pour les zones illisibles
        unreadable: list[dict] = []
        for z in all_zones:
            if not z.is_reliable and len(z.text) >= 2:
                unreadable.append({
                    "page": z.page,
                    "text_attempted": z.text,
                    "confidence": round(z.confidence, 3),
                    "bbox": z.bbox,
                    "reason": "confiance_insuffisante",
                    "message": (
                        f"Zone illisible ou incertaine (page {z.page}, confiance "
                        f"{z.confidence:.0%}). Veuillez vérifier manuellement : "
                        f"« {z.text[:80]} »"
                    ),
                })

        # Calculer confiance moyenne
        if all_zones:
            avg = sum(z.confidence for z in all_zones) / len(all_zones)
        else:
            avg = 0.0

        return OCRResult(
            full_text=full_text,
            zones=all_zones,
            unreadable_zones=unreadable,
            detected_language=lang,
            average_confidence=avg,
            page_count=len(images),
            engine=self.engine,
        )

    def process_image_bytes(self, data: bytes, filename: str = "upload") -> OCRResult:
        """Traite des bytes image (upload direct depuis téléphone)."""
        import tempfile
        suffix = Path(filename).suffix or ".jpg"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
            f.write(data)
            tmp = Path(f.name)
        try:
            return self.process_file(tmp)
        finally:
            tmp.unlink(missing_ok=True)


ocr_service = OCRService()
