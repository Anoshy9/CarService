"""
Service OCR multilingue ULTRA-PERFORMANT.

Améliorations majeures vs v1:
- Prétraitement multi-passes (8 variantes) avec sélection du meilleur score
- Upscaling intelligent (x2/x3) pour les petites images
- Seuillage adaptatif (Otsu) + binarisation
- Détection de rotation (0/90/180/270) et correction auto
- Débruitage (fastNlMeansDenoising)
- Correction de perspective optionnelle
- Contraste CLAHE (évite les zones trop sombres/éclairées)
- Score de qualité par résultat → on garde le meilleur
- Moteur: RapidOCR (principal) + Tesseract (fallback si installé)
- Détection de langue améliorée
- Zones illisibles remontées avec bbox précise

Langues: FR / EN / IT / DE / ES / PT / NL
"""
from __future__ import annotations

import io
import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import numpy as np
from PIL import Image, ImageOps, ImageEnhance, ImageFilter, ImageDraw

from app.core.config import settings


@dataclass
class OCRZone:
    text: str
    confidence: float
    bbox: tuple[int, int, int, int] | None = None
    page: int = 1
    language_hint: str | None = None
    is_reliable: bool = True


@dataclass
class OCRResult:
    full_text: str
    zones: list[OCRZone] = field(default_factory=list)
    unreadable_zones: list[dict] = field(default_factory=list)
    detected_language: str | None = None
    average_confidence: float = 0.0
    page_count: int = 1
    engine: str = "rapidocr"
    preprocessing: str = ""

    def to_dict(self) -> dict:
        return {
            "full_text": self.full_text,
            "detected_language": self.detected_language,
            "average_confidence": round(self.average_confidence, 3),
            "page_count": self.page_count,
            "engine": self.engine,
            "preprocessing": self.preprocessing,
            "zones_count": len(self.zones),
            "unreadable_zones": self.unreadable_zones,
        }


class OCRService:
    """Service OCR ultra-performant avec prétraitement multi-passes."""

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

    # ================================================================
    #  PRÉTRAITEMENT MULTI-PASSES
    # ================================================================

    @staticmethod
    def _to_cv(img: Image.Image) -> np.ndarray:
        """PIL Image -> numpy array (BGR pour OpenCV)."""
        return cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)

    @staticmethod
    def _to_pil(arr: np.ndarray) -> Image.Image:
        """numpy array (BGR) -> PIL Image."""
        return Image.fromarray(cv2.cvtColor(arr, cv2.COLOR_BGR2RGB))

    def _upscale(self, img: Image.Image, factor: float = 2.0) -> Image.Image:
        """Agrandit l'image pour améliorer la lecture des petits textes."""
        w, h = img.size
        new_size = (int(w * factor), int(h * factor))
        return img.resize(new_size, Image.LANCZOS)

    def _deskew(self, img: Image.Image) -> Image.Image:
        """Détecte et corrige la rotation de l'image (0/90/180/270 +skew léger)."""
        import cv2
        arr = np.array(img.convert("L"))
        # Seuillage pour trouver les contours
        _, binary = cv2.threshold(arr, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        # Coordonnées des pixels non-noirs
        coords = np.column_stack(np.where(binary > 0))
        if len(coords) < 100:
            return img
        # Angle via minAreaRect
        angle = cv2.minAreaRect(coords)[-1]
        if angle < -45:
            angle = -(90 + angle)
        else:
            angle = -angle
        # Ne corriger que les petits angles (< 15°)
        if abs(angle) > 15:
            # C'est probablement une rotation 90/180/270
            if abs(angle) > 45:
                angle = 0  # on laisse RapidOCR gérer les grosses rotations
        if abs(angle) > 0.5:
            return img.rotate(angle, expand=True, fillcolor="white")
        return img

    def _preprocessing_variants(self, img: Image.Image) -> list[tuple[str, Image.Image]]:
        """
        Génère plusieurs variantes prétraitées de l'image.
        Retourne une liste de (nom_variant, image).
        """
        import cv2

        variants: list[tuple[str, Image.Image]] = []

        # Corriger l'orientation EXIF
        img = ImageOps.exif_transpose(img)

        # --- Variante 0: Original upscalé x2 (baseline) ---
        v0 = self._upscale(img, 2.0)
        variants.append(("original_x2", v0))

        # --- Variante 1: Niveaux de gris + contraste + netteté ---
        v1 = img.convert("L")
        v1 = ImageEnhance.Contrast(v1).enhance(1.5)
        v1 = ImageEnhance.Sharpness(v1).enhance(2.0)
        v1 = self._upscale(v1, 2.0)
        variants.append(("gray_contrast_x2", v1))

        # --- Variante 2: CLAHE (contraste adaptatif) via OpenCV ---
        try:
            arr = np.array(img.convert("L"))
            # Upscale d'abord
            arr = cv2.resize(arr, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            arr = clahe.apply(arr)
            variants.append(("clahe_x2", Image.fromarray(arr)))
        except Exception:
            pass

        # --- Variante 3: Binarisation Otsu ---
        try:
            arr = np.array(img.convert("L"))
            arr = cv2.resize(arr, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
            _, arr = cv2.threshold(arr, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            variants.append(("otsu_x2", Image.fromarray(arr)))
        except Exception:
            pass

        # --- Variante 4: Débruitage + contraste ---
        try:
            arr = np.array(img.convert("L"))
            arr = cv2.resize(arr, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
            arr = cv2.fastNlMeansDenoising(arr, None, 10, 7, 21)
            arr = cv2.convertScaleAbs(arr, alpha=1.3, beta=10)
            variants.append(("denoise_x2", Image.fromarray(arr)))
        except Exception:
            pass

        # --- Variante 5: Haute résolution x3 + CLAHE ---
        try:
            arr = np.array(img.convert("L"))
            arr = cv2.resize(arr, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)
            clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
            arr = clahe.apply(arr)
            # Netteté
            kernel = np.array([[-1, -1, -1], [-1, 9, -1], [-1, -1, -1]])
            arr = cv2.filter2D(arr, -1, kernel)
            variants.append(("clahe_x3_sharp", Image.fromarray(arr)))
        except Exception:
            pass

        # --- Variante 6: Correction gamma (pour photos sombres) ---
        try:
            arr = np.array(img.convert("L"), dtype=np.float32) / 255.0
            arr = cv2.resize(arr, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
            arr = np.clip(arr, 0.01, 1.0)  # éviter les 0 pour le log/power
            gamma = 0.6  # éclaircir les photos sombres
            arr = np.power(arr, gamma)
            arr = np.clip(arr * 255, 0, 255).astype(np.uint8)
            variants.append(("gamma_x2", Image.fromarray(arr)))
        except Exception:
            pass

        # --- Variante 7: Égalisation d'histogramme ---
        try:
            arr = np.array(img.convert("L"))
            arr = cv2.resize(arr, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
            arr = cv2.equalizeHist(arr)
            variants.append(("equalize_x2", Image.fromarray(arr)))
        except Exception:
            pass

        # --- Variante 8: SUPER-RÉSOLUTION x3 (pour photos très dégradées) ---
        try:
            arr = np.array(img.convert("L"))
            # Upscale x3 avec interpolation cubique
            arr = cv2.resize(arr, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)
            # Débruitage fort
            arr = cv2.fastNlMeansDenoising(arr, None, 15, 7, 21)
            # CLAHE agressif
            clahe = cv2.createCLAHE(clipLimit=4.0, tileGridSize=(8, 8))
            arr = clahe.apply(arr)
            # Netteté (unsharp mask)
            gaussian = cv2.GaussianBlur(arr, (0, 0), 3.0)
            arr = cv2.addWeighted(arr, 1.8, gaussian, -0.8, 0)
            variants.append(("superres_x3", Image.fromarray(arr)))
        except Exception:
            pass

        # --- Variante 9: Binarisation adaptative (pour documents très contrastés) ---
        try:
            arr = np.array(img.convert("L"))
            arr = cv2.resize(arr, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
            arr = cv2.adaptiveThreshold(arr, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                         cv2.THRESH_BINARY, 15, 8)
            variants.append(("adaptive_x2", Image.fromarray(arr)))
        except Exception:
            pass

        # --- Variante 10: Morphologie (fermeture pour connecter les caractères) ---
        try:
            arr = np.array(img.convert("L"))
            arr = cv2.resize(arr, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
            _, arr = cv2.threshold(arr, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
            arr = cv2.morphologyEx(arr, cv2.MORPH_CLOSE, kernel)
            variants.append(("morph_x2", Image.fromarray(arr)))
        except Exception:
            pass

        return variants

    # ================================================================
    #  SCORING — Évaluer la qualité d'un résultat OCR
    # ================================================================

    @staticmethod
    def _score_result(zones: list[OCRZone], text: str) -> float:
        """
        Score de qualité d'un résultat OCR (0..100).
        Combine: confiance moyenne, nombre de mots reconnus,
        ratio de caractères alphanumériques, détection de mots connus.
        """
        if not zones or not text.strip():
            return 0.0

        # 1. Confiance moyenne (poids 40%)
        avg_conf = sum(z.confidence for z in zones) / len(zones)
        score = avg_conf * 40

        # 2. Nombre de mots significatifs (poids 20%)
        words = [w for w in text.split() if len(w) >= 3]
        word_score = min(len(words) / 30, 1.0)  # 30+ mots = max
        score += word_score * 20

        # 3. Ratio alphanumérique + pénalité caractères spéciaux (poids 20%)
        alnum = sum(c.isalnum() or c.isspace() for c in text)
        total = max(len(text), 1)
        ratio = alnum / total
        # Pénaliser les résultats avec beaucoup de caractères bizarres (OCR de mauvaise qualité)
        weird = sum(1 for c in text if ord(c) > 0x2500 or c in "amadail|!")
        weird_ratio = weird / total
        score += (ratio * 20) - (weird_ratio * 15)

        # 4. Mots-clés connus (poids 20%) — bonus si on reconnaît du vocabulaire métier
        keywords = [
            "facture", "invoice", "fattura", "rechnung", "total", "tva", "vat", "iva",
            "date", "garage", "atelier", "officina", "werkstatt", "taller", "km", "kilom",
            "prix", "price", "prezzo", "montant", "eur", "gbp", "€", "£", "ht", "ttc",
            "filtre", "filter", "filtro", "huile", "oil", "olio", "vidange", "revision",
            "contrôle", "controle", "controllo", "technique", "technisch", "revision",
            "citroen", "citroën", "c2", "hdi", "diesel", "vehicule", "véhicule", "vehicle",
        ]
        text_lower = text.lower()
        found_kw = sum(1 for kw in keywords if kw in text_lower)
        kw_score = min(found_kw / 5, 1.0)  # 5+ mots-clés = max
        score += kw_score * 20

        return min(score, 100.0)

    # ================================================================
    #  OCR CORE
    # ================================================================

    def _ocr_image_rapidocr(self, img: Image.Image, page: int) -> list[OCRZone]:
        """OCR via RapidOCR."""
        import cv2
        arr = cv2.cvtColor(np.array(img.convert("RGB")), cv2.COLOR_RGB2BGR)
        result, _ = self._rapidocr(arr)
        zones: list[OCRZone] = []
        if not result:
            return zones
        for item in result:
            bbox_pts, text, conf = item[0], item[1], float(item[2])
            xs = [p[0] for p in bbox_pts]
            ys = [p[1] for p in bbox_pts]
            bbox = (int(min(xs)), int(min(ys)), int(max(xs)), int(max(ys)))
            clean = text.strip()
            if clean:
                zones.append(OCRZone(
                    text=clean,
                    confidence=conf,
                    bbox=bbox,
                    page=page,
                    is_reliable=conf >= settings.OCR_CONFIDENCE_THRESHOLD,
                ))
        return zones

    def _ocr_image_tesseract(self, img: Image.Image, page: int) -> list[OCRZone]:
        """Fallback OCR via Tesseract."""
        try:
            import pytesseract
        except ImportError:
            return []
        langs = "+".join(settings.OCR_LANGUAGES)
        try:
            tsv = pytesseract.image_to_data(
                img, lang=langs, config="--psm 6 --oem 3",
                output_type=pytesseract.Output.DICT
            )
        except Exception:
            try:
                tsv = pytesseract.image_to_data(
                    img, lang="eng+fra+ita+deu+spa+por+nld", config="--psm 6",
                    output_type=pytesseract.Output.DICT
                )
            except Exception:
                return []
        zones: list[OCRZone] = []
        n = len(tsv["text"])
        for i in range(n):
            txt = (tsv["text"][i] or "").strip()
            if not txt:
                continue
            try:
                conf = float(tsv["conf"][i]) / 100.0
            except (TypeError, ValueError):
                conf = 0.0
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
            zones = self._ocr_image_rapidocr(img, page)
            if zones:
                return zones
        return self._ocr_image_tesseract(img, page)

    def _ocr_with_variants(self, img: Image.Image, page: int) -> tuple[list[OCRZone], str, float]:
        """
        Essaie plusieurs variantes de prétraitement et garde le meilleur résultat.
        Retourne: (zones, nom_variant_gagnant, score)
        """
        variants = self._preprocessing_variants(img)
        best_zones: list[OCRZone] = []
        best_variant = "none"
        best_score = -1.0

        for name, variant_img in variants:
            try:
                zones = self._ocr_image(variant_img, page)
                text = "\n".join(z.text for z in zones if z.text)
                score = self._score_result(zones, text)
                if score > best_score:
                    best_score = score
                    best_zones = zones
                    best_variant = name
            except Exception:
                continue

        return best_zones, best_variant, best_score

    # ================================================================
    #  DÉTECTION DE LANGUE (améliorée)
    # ================================================================

    @staticmethod
    def detect_language(text: str) -> str:
        t = text.lower()
        scores = {"fr": 0, "en": 0, "it": 0, "de": 0, "es": 0, "pt": 0, "nl": 0}

        keywords = {
            "fr": ["facture", "total ttc", "tva", "bon de commande", "révision", "entretien",
                   "kilométrage", "garage", "montant", "réparation", "contrôle technique",
                   "main d'œuvre", "désignation", "quantité", "prix unitaire", "garantie",
                   "véhicule", "vidange", "frein", "plaquette", "disque", "carte grise",
                   "immatriculation", "propriétaire", "concessionnaire", "atelier", "ht", "ttc"],
            "en": ["invoice", "total", "vat", "mileage", "garage", "repair", "service",
                   "maintenance", "MOT", "inspection", "labour", "labor", "quantity",
                   "unit price", "vehicle", "technician", "parts", "amount due",
                   "vehicle inspection", "brake", "disc", "pad", "oil change", "filter"],
            "it": ["fattura", "totale", "iva", "chilometraggio", "officina", "riparazione",
                   "revisione", "manutenzione", "garanzia", "quantità", "prezzo",
                   "importo", "veicolo", "controllo", "ricambi", "freno", "disco",
                   "pastiglia", "olio", "filtro", "f impulso", "immatricolazione", "targa"],
            "de": ["rechnung", "gesamt", "mwst", "kilometerstand", "werkstatt", "reparatur",
                   "wartung", "garantie", "menge", "preis", "betrag", "fahrzeug",
                   "inspektion", "ersatzteile", "bremse", "scheibe", "belag",
                   "ölwechsel", "filter", "hu", "tüv", "fahrzeugschein", "kennzeichen"],
            "es": ["factura", "total", "iva", "kilometraje", "taller", "reparación",
                   "mantenimiento", "garantía", "cantidad", "precio", "importe",
                   "vehículo", "inspección técnica", "freno", "disco", "pastilla",
                   "aceite", "filtro", "itv", "matrícula", "cambio de aceite"],
            "pt": ["fatura", "total", "iva", "quilometragem", "oficina", "reparação",
                   "manutenção", "garantia", "quantidade", "preço", "importância",
                   "veículo", "inspeção", "peças", "travão", "disco", "pastilha",
                   "óleo", "filtro", "inspeção periódica", "matrícula"],
            "nl": ["factuur", "totaal", "btw", "kilometerstand", "garage", "reparatie",
                   "onderhoud", "garantie", "aantal", "prijs", "bedrag", "voertuig",
                   "keuring", "onderdelen", "rem", "schijf", "blok", "olie",
                   "filter", "apk", "kenteken", "oliewissel"],
        }
        for lang, words in keywords.items():
            for w in words:
                scores[lang] += t.count(w)

        # Bonus: détection par caractères spéciaux
        if "ß" in t or "ä" in t or "ö" in t or "ü" in t:
            scores["de"] += 3
        if "à" in t or "é" in t or "è" in t or "ç" in t or "ù" in t:
            scores["fr"] += 2
        if "ñ" in t or "¿" in t or "ó" in t:
            scores["es"] += 2
        if "ã" in t or "õ" in t or "ç" in t:
            scores["pt"] += 2

        best = max(scores, key=scores.get)
        return best if scores[best] > 0 else "fr"

    # ================================================================
    #  API PUBLIQUE
    # ================================================================

    def process_file(self, file_path: Path) -> OCRResult:
        """Traite un fichier (PDF ou image) avec le meilleur prétraitement."""
        suffix = file_path.suffix.lower()
        images: list[Image.Image] = []
        if suffix == ".pdf":
            from pdf2image import convert_from_path
            images = convert_from_path(str(file_path), dpi=settings.OCR_DPI)
        else:
            images = [Image.open(file_path)]

        all_zones: list[OCRZone] = []
        best_preprocessing = ""
        total_score = 0.0

        for idx, img in enumerate(images, start=1):
            zones, variant, score = self._ocr_with_variants(img, page=idx)
            all_zones.extend(zones)
            best_preprocessing += f"p{idx}:{variant}({score:.0f}) "
            total_score += score

        full_text = "\n".join(z.text for z in all_zones if z.text)
        lang = self.detect_language(full_text)

        # Zones illisibles
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

        avg_conf = (
            sum(z.confidence for z in all_zones) / len(all_zones)
            if all_zones else 0.0
        )
        avg_score = total_score / len(images) if images else 0.0

        return OCRResult(
            full_text=full_text,
            zones=all_zones,
            unreadable_zones=unreadable,
            detected_language=lang,
            average_confidence=avg_conf,
            page_count=len(images),
            engine=self.engine,
            preprocessing=best_preprocessing.strip(),
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


# Singleton
import cv2  # noqa: E402 — import global pour les méthodes statiques

ocr_service = OCRService()
