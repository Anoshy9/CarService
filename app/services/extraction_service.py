"""
Service d'extraction intelligente des données à partir du texte OCR d'une facture
ou d'un contrôle technique.
Multilingue : FR / EN / IT / DE / ES / PT / NL.
Extrait : date, numéro de document, garage, pays, kilométrage, montants, lignes de travaux.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field, asdict
from datetime import date, datetime
from typing import Optional

from app.services.ocr_service import OCRResult


@dataclass
class ExtractedInvoice:
    document_date: Optional[date] = None
    document_number: Optional[str] = None
    garage_name: Optional[str] = None
    garage_address: Optional[str] = None
    garage_country: Optional[str] = None
    garage_phone: Optional[str] = None
    garage_vat: Optional[str] = None
    mileage: Optional[int] = None
    total_ht: Optional[float] = None
    total_ttc: Optional[float] = None
    currency: str = "EUR"
    vat_rate: Optional[float] = None
    work_lines: list[dict] = field(default_factory=list)   # lignes de travaux détectées
    parts_lines: list[dict] = field(default_factory=list)  # pièces détachées
    raw_language: Optional[str] = None
    confidence_notes: list[str] = field(default_factory=list)
    is_ct: bool = False
    ct_result: Optional[str] = None

    def to_dict(self) -> dict:
        d = asdict(self)
        if self.document_date:
            d["document_date"] = self.document_date.isoformat()
        return d


# --------------------------------------------------------------------- patterns
# Dates : FR (31/12/2023, 31-12-2023, 31.12.2023), EN (12/31/2023, Dec 31, 2023),
# IT (31/12/2023), DE (31.12.2023), etc.
DATE_PATTERNS = [
    # Standard avec séparateurs
    r"(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})",
    r"(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})",
    # Avec espaces (OCR sépare parfois: "15 03 2024" ou "15  03  2024")
    r"(\d{1,2})\s+(\d{1,2})\s+(\d{4})",
    # Avec espaces et séparateurs mixtes ("15 / 03 / 2024", "15- 03-2024")
    r"(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{4})",
    # Mois texte
    r"(\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+(\d{4})",
    r"(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})",
    r"(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(\d{4})",
    r"(\d{1,2})\.\s*(Januar|Februar|März|Marz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4})",
]

MONTHS_FR = {m: i + 1 for i, m in enumerate(
    ["janvier", "février", "fevrier", "mars", "avril", "mai", "juin", "juillet",
     "août", "aout", "septembre", "octobre", "novembre", "décembre", "decembre"])}
MONTHS_EN = {m: i + 1 for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july",
     "august", "september", "october", "november", "december"])}
MONTHS_IT = {m: i + 1 for i, m in enumerate(
    ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio",
     "agosto", "settembre", "ottobre", "novembre", "dicembre"])}
MONTHS_DE = {m: i + 1 for i, m in enumerate(
    ["januar", "februar", "märz", "april", "mai", "juni", "juli",
     "august", "september", "oktober", "november", "dezember"])}
ALL_MONTHS = {**MONTHS_FR, **MONTHS_EN, **MONTHS_IT, **MONTHS_DE}

# Montants : 1 234,56 € / 1,234.56 £ / 1.234,56 € / € 1234.56 / 1234,56 EUR ...
MONEY_PATTERNS = [
    # Standard: 1 234,56 € / 1.234,56 € / 1,234.56 €
    r"(\d{1,3}(?:[ \u00a0.]\d{3})*(?:[,\.]\d{2}))\s*(?:€|EUR|eur|EURO)",
    r"(?:€|EUR|eur)\s*(\d{1,3}(?:[ \u00a0.]\d{3})*(?:[,\.]\d{2}))",
    r"(\d{1,3}(?:,\d{3})*\.\d{2})\s*(?:GBP|£|pound)",
    r"(?:£|GBP)\s*(\d{1,3}(?:,\d{3})*\.\d{2})",
    r"(\d{1,3}(?:[ \u00a0.]\d{3})*(?:[,\.]\d{2}))\s*(?:CHF|Fr\.?)",
    # OCR avec espace comme séparateur décimal: "242 04" ou "242 04 €"
    r"(\d{1,3}(?:[ \u00a0.]\d{3})*\s\d{2})\s*(?:€|EUR|eur|EURO|GBP|£|CHF|$)",
    # Nombre simple avec 2 décimales en fin de ligne
    r"(\d{1,3}(?:[ \u00a0.]\d{3})*[,\.]\d{2})(?!\d)",
]

# Kilométrage : "km 123456", "123 456 km", "chilometraggio 123456", "Kilometerstand 123456"
MILEAGE_PATTERNS = [
    r"(?:km|KM|Km)\s*[:\-]?\s*(\d{1,3}(?:[ \u00a0.]?\d{3})+)",
    r"(\d{1,3}(?:[ \u00a0.]?\d{3})+)\s*(?:km|KM|Km)",
    r"(?:chilometraggio|chilometri|kmstand|kilometerstand|odometer|tachometer|mileage)\s*[:\-]?\s*(\d{1,3}(?:[ \u00a0.]?\d{3})+)",
    r"(\d{1,3}(?:[ \u00a0.]?\d{3})+)\s*(?:chilometraggio|chilometri|kmstand|kilometerstand|odometer|mileage)",
]

# Numéros de facture : "Facture n° 2023-045", "Invoice No: INV-2023-001", "Fattura n. 123/2023"
INVOICE_NUMBER_PATTERNS = [
    r"(?:facture|invoice|fattura|rechnung|factura|fatura|factuur)\s*(?:n[o°º]\.?|num(?:ero)?|no\.?|nr\.?|#)\s*[:\-]?\s*([A-Z0-9\-/\.]+)",
    r"(?:n[o°º]\.?|no\.?|nr\.?|#)\s*([A-Z0-9]{3,}[\-/]?[A-Z0-9\-/]*)",
]

# TVA / VAT / IVA / SIRET
VAT_PATTERNS = [
    r"(?:TVA|VAT|IVA|MwSt|BTW|IVA)\s*(?:n[o°º]\.?|intra(?:comm(?:unautaire)?)?|no\.?|nr\.?)?\s*[:\-]?\s*([A-Z]{0,3}\s?[A-Z0-9]{8,20})",
    r"(?:SIRET|SIREN)\s*[:\-]?\s*(\d{3}\s?\d{3}\s?\d{3}(?:\s?\d{5})?)",
    r"(?:VAT|IVA|MwSt|BTW)\s*(?:number|no\.?|nr\.?)?\s*[:\-]?\s*([A-Z]{2}\s?[A-Z0-9]{8,15})",
    r"\b(FR\s?\d{2}\s?\d{9})\b",
    r"\b(IT\s?\d{11})\b",
    r"\b(GB\s?\d{9})\b",
    r"\b(DE\s?\d{9})\b",
    r"\b(NL\s?[A-Z0-9]{12})\b",
]

# Téléphone
PHONE_PATTERNS = [
    r"(?:t[ée]l(?:[ée]phone)?|t[ao]l|tel|phone|tlf|telefono|telefon|telefone)\s*[:.\-]?\s*([+\d][\d\s.\-/()]{7,20})",
    r"(\+\d{1,3}[\s.\-]?(?:\d[\s.\-]?){6,14})",
    r"(?<![\w])(0\d(?:[\s.\-]?\d){8})(?![\w])",
]

# Pays (dans une adresse de garage)
COUNTRY_KEYWORDS = {
    "France": ["france", "francia", "frankreich", "frankrijk", "francia", "francia",
               "franoe", "francs", "francia", "paris", "lyon", "marseille", r"\bFR\b", "française"],
    "Italie": ["italie", "italia", "italien", "italy", "italia", "italiano",
               "milano", "milian", "milianq", "roma", "milan", "torino", "napoli", r"\bIT\b"],
    "Royaume-Uni": ["royaume-uni", "united kingdom", "great britain", "england", "angleterre",
                    "inghilterra", "großbritannien", "engeland", "regno unito", "london", "londra",
                    "uk", r"\bGB\b", r"\bUK\b"],
    "Allemagne": ["allemagne", "germany", "deutschland", "alemania", "duitsland", "germania",
                  "berlin", "münchen", "munchen", "hamburg", r"\bDE\b"],
    "Espagne": ["espagne", "spain", "españa", "espana", "spanien", "spanje", "spagna",
                "madrid", "barcelona", "espana", r"\bES\b"],
    "Belgique": ["belgique", "belgium", "belgië", "belgien", "belgio", "belgica",
                 "bruxelles", "bruceru", "antwerp", r"\bBE\b"],
    "Pays-Bas": ["pays-bas", "netherlands", "nederland", "niederlande", "paesi bassi",
                 "amsterdam", "holland", "hollande", r"\bNL\b"],
    "Suisse": ["suisse", "schweiz", "svizzera", "switzerland", "zwitserland",
               "zurich", "genève", "geneve", r"\bCH\b"],
    "Portugal": ["portugal", "lisboa", "lisbonne", "porto", r"\bPT\b"],
    "Luxembourg": ["luxembourg", "luxemburg", "lussemburgo", r"\bLU\b"],
}

# Lignes de travaux : mots-clés par catégorie
WORK_KEYWORDS = {
    "vidange": ["vidange", "oil change", "cambio olio", "ölwechsel", "cambio de aceite", "olie verversen", "ölablass"],
    "filtre_huile": ["filtre à huile", "filtro olio", "oil filter", "ölfilter", "filtro aceite", "oliefilter"],
    "filtre_gasoil": ["filtre à gasoil", "filtro gasolio", "filtre à carburant", "fuel filter", "filtro carburante",
                     "kraftstofffilter", "filtro combustible", "brandstoffilter"],
    "filtre_air": ["filtre à air", "filtro aria", "air filter", "luftfilter", "filtro aire", "luchtfilter"],
    "filtre_habitacle": ["filtre habitacle", "filtro abitacolo", "filtre à pollen", "cabin filter",
                         "pollenfilter", "filtro polen", "pollenfilter"],
    "distribution": ["courroie de distribution", "kit distribution", "timing belt", "cinghia distribuzione",
                     "zahnriemen", "correa distribución", "distributieriem", "timing kit"],
    "courroie_accessoires": ["courroie accessoire", "courroie d'accessoire", "serpentine", "accessory belt",
                             "keilriemen", "cinghia servizi", "correa accesorios", "v-snaar"],
    "freins": ["plaquette", "plaquettes", "disque de frein", "disques de frein", "brake pad", "brake disc",
               "pastiglie", "freno a disco", "bremsbelag", "bremsscheibe", "freno", "remblokken", "remmen"],
    "pneumatiques": ["pneu", "pneumatique", "roue", "pneumatico", "gomme", "tyre", "tire", "reifen",
                    "neumático", "band", "reifen", "montage pneu", "équilibrage", "valvola"],
    "batterie": ["batterie", "battery", "batteria", "batterie", "accumulateur", "akku"],
    "refroidissement": ["liquide de refroidissement", "liquido raffreddamento", "coolant", "kühlmittel",
                        "líquido refrigerante", "koelvloeistof", "radiateur", "radiatore", "thermostat"],
    "boite_vitesses": ["huile de boîte", "huile boite de vitesses", "gearbox oil", "olio cambio",
                       "getriebeöl", "aceite caja", "versnellingsbakolie", "cambio marcia"],
    "suspension": ["amortisseur", "amortisseurs", "ammortizzatore", "shock absorber", "stoßdämpfer",
                   "amortiguador", "schokdemper", "silent bloc", "silentbloc", "biellette", "triangle"],
    "echappement": ["échappement", "scappamento", "exhaust", "auspuff", "escape", "uitlaat", "catalizzatore"],
    "electricite": ["alternateur", "alternatore", "alternator", "lichtmaschine", "démarreur", "motorino avviamento",
                    "starter", "démarreur", "bougie", "candele", "spark plug", "zündkerze", "bujía"],
    "carrosserie": ["carrosserie", "carrozzeria", "bodywork", "karosserie", "carrocería", "carrosserie",
                    "pare-choc", "paraurti", "parabrezza", "windschutzscheibe", "parabrisas"],
    "embrayage": ["embrayage", "frizione", "clutch", "kupplung", "embrague", "koppeling"],
    "climatisation": ["climatisation", "climatiseur", "aria condizionata", "air conditioning", "klimaanlage",
                      "aire acondicionado", "airco", "recharge gaz", "gas ricarica"],
    "ct": ["contrôle technique", "controle technique", "contrôle technique", "vehicle inspection", "MOT",
           "controllo tecnico", "revisión técnica", "keuring", " revisione ", "inspezione"],
}

# Seuils de détection CT
CT_RESULT_KEYWORDS = {
    "favorable": ["favorable", "apto", "idoneo", "pass", "passed", "positif", "valido", "gut",
                  "ohne mängel", "senza difetti", "conforme", "conform"],
    "defaillance_mineure": ["mineure", "minor", "lieve", "minor defect", "nebensächlicher mangel",
                            "difetto lieve", "defecto menor", "kleine gebreken"],
    "defaillance_majeure": ["majeure", "major", "grave", "major defect", "schwerer mangel",
                            "difetto grave", "defecto grave", "ernstig gebrek"],
    "defaillance_critique": ["critique", "critical", "critica", "kritisch", "grave peligro",
                             "difetto critico", "defecto crítico", "kritisch defect"],
}


def _parse_money(value: str) -> Optional[float]:
    """Convertit une chaîne monétaire en float (gère FR 1 234,56 / EN 1,234.56 / OCR 242 04)."""
    import re as _re
    v = value.strip().replace("\u00a0", " ").strip()

    # Nettoyer les artefacts OCR: "242,04€5" -> "242,04", "242042" -> "242.04" si contexte décimal
    v = _re.sub(r"([\d,\.]+)\s*[€£$]\s*\d+", r"\1", v)
    v = _re.sub(r"(\d)([€£$])", r"\1", v)

    # Gérer le cas OCR "242 04" (espace comme séparateur décimal)
    # Pattern strict: 1-6 chiffres, espace, exactement 2 chiffres
    m_space_dec = _re.match(r"^(\d{1,6})\s+(\d{2})$", v)
    if m_space_dec:
        v = m_space_dec.group(1) + "." + m_space_dec.group(2)

    v = v.replace(" ", "")

    # Détecter le séparateur décimal
    if "," in v and "." in v:
        if v.rfind(",") > v.rfind("."):
            v = v.replace(".", "").replace(",", ".")  # FR: 1.234,56
        else:
            v = v.replace(",", "")  # EN: 1,234.56
    elif "," in v:
        parts = v.split(",")
        if len(parts[-1]) == 2 and len(parts) <= 2:
            v = v.replace(".", "").replace(",", ".")  # FR: 242,04
        else:
            v = v.replace(",", "")  # EN: 1,234
    elif "." in v:
        parts = v.split(".")
        if len(parts[-1]) == 2 and len(parts) <= 2:
            pass  # déjà bon: 242.04
        elif len(parts) > 2:
            v = v.replace(".", "")  # 1.234.56 -> 123456 (rare, on garde tel quel)
    try:
        result = float(v)
        # Sanity check: un montant de facture est entre 0.01 et 999999.99
        if 0.01 <= result <= 999999.99:
            return result
        return None
    except ValueError:
        return None


def _parse_date(day: int, month: int, year: int, day_first: bool = True) -> Optional[date]:
    """Construit une date en gérant l'inversion jour/mois (EN vs FR)."""
    try:
        if not day_first and month > 12 and day <= 12:
            day, month = month, day
        if 1 <= day <= 31 and 1 <= month <= 12 and 1900 <= year <= 2100:
            return date(year, month, day)
    except ValueError:
        pass
    return None


class ExtractionService:
    """Extrait les données structurées d'un texte OCR de facture/CT."""

    def extract(self, ocr: OCRResult) -> ExtractedInvoice:
        text = ocr.full_text
        lines = [l.strip() for l in text.splitlines() if l.strip()]
        result = ExtractedInvoice(raw_language=ocr.detected_language)
        notes = result.confidence_notes

        result.is_ct = self._detect_ct(text)
        if result.is_ct:
            result.ct_result = self._extract_ct_result(text)

        result.document_date = self._extract_date(text, lines)
        result.document_number = self._extract_invoice_number(text)
        result.garage_name = self._extract_garage_name(lines)
        result.garage_country = self._extract_country(text)
        result.garage_address = self._extract_address(lines)
        result.garage_phone = self._extract_phone(text)
        result.garage_vat = self._extract_vat(text)
        result.mileage = self._extract_mileage(text)

        amounts = self._extract_amounts(text)
        result.total_ttc = amounts.get("ttc")
        result.total_ht = amounts.get("ht")
        result.vat_rate = amounts.get("vat_rate")
        result.currency = amounts.get("currency", "EUR")

        result.work_lines = self._extract_work_lines(lines)
        result.parts_lines = self._extract_parts_lines(lines)

        if result.document_date is None:
            notes.append("Aucune date détectée sur le document — veuillez la renseigner manuellement.")
        if result.mileage is None:
            notes.append("Aucun kilométrage détecté — pensez à le saisir pour le suivi.")
        if result.total_ttc is None and not result.is_ct:
            notes.append("Aucun montant total détecté — vérifiez le document.")
        if ocr.unreadable_zones:
            notes.append(
                f"{len(ocr.unreadable_zones)} zone(s) illisible(s) détectée(s) — "
                f"relecture manuelle recommandée."
            )
        if result.garage_country is None:
            notes.append("Pays du garage non déterminé automatiquement.")

        return result

    # ------------------------------------------------------------- sous-extracteurs
    def _detect_ct(self, text: str) -> bool:
        t = text.lower()
        # Nettoyer les artefacts OCR courants (@ -> o, etc.)
        t_clean = t.replace("@", "o")
        ct_markers = ["contrôle technique", "controle technique", "contrôle périodique",
                      "controle periodique", "rapport de controle", "rapport de contrôle",
                      "vehicle inspection", "mot test", "mot ", "controllo tecnico",
                      "revisión técnica itv", "inspeção periódica", "apk", "keuring",
                      "revisión", "inspección técnica de vehículos", "tüv",
                      "visita técnica", "revisión itv"]
        return any(m in t_clean for m in ct_markers)

    def _extract_ct_result(self, text: str) -> Optional[str]:
        t = text.lower().replace("@", "o")
        for result, kws in CT_RESULT_KEYWORDS.items():
            for k in kws:
                if k in t:
                    return result
        # Recherche spécifique "avis favorable" / "résultat : ..."
        m = re.search(r"(?:avis|résultat|resultat|esito|result)\s*[:\-]?\s*(favorable|défavorable|defavorable|mineur|majeur|critique)", t)
        if m:
            word = m.group(1)
            if word == "favorable":
                return "favorable"
            elif word in ("mineur", "mineure"):
                return "defaillance_mineure"
            elif word in ("majeur", "majeure"):
                return "defaillance_majeure"
            else:
                return "defaillance_critique"
        return None

    def _extract_date(self, text: str, lines: list[str]) -> Optional[date]:
        candidates: list[date] = []
        for line in lines:
            for pat in DATE_PATTERNS:
                for m in re.finditer(pat, line, re.IGNORECASE):
                    groups = m.groups()
                    if len(groups) == 3 and all(g.strip().isdigit() for g in groups):
                        groups = tuple(g.strip() for g in groups)
                        a, b, c = int(groups[0]), int(groups[1]), int(groups[2])
                        # ISO : année en premier
                        if a > 31:
                            d = _parse_date(c, b, a)
                        else:
                            # FR/IT/DE/ES : jour en premier ; EN possible : mois en premier
                            d_fr = _parse_date(a, b, c, day_first=True)
                            d_en = _parse_date(a, b, c, day_first=False)
                            if d_fr:
                                candidates.append(d_fr)
                            if d_en and d_en != d_fr:
                                candidates.append(d_en)
                    elif len(groups) == 3:
                        # date avec mois texte
                        day_s, month_s, year_s = groups
                        if not (day_s.isdigit() and year_s.isdigit()):
                            continue
                        month = ALL_MONTHS.get(month_s.lower())
                        if month:
                            d = _parse_date(int(day_s), month, int(year_s))
                            if d:
                                candidates.append(d)
        if not candidates:
            return None
        # La date la plus fréquente, ou la plus récente si unique
        from collections import Counter
        most_common = Counter(candidates).most_common(1)[0][0]
        return most_common

    def _extract_invoice_number(self, text: str) -> Optional[str]:
        for pat in INVOICE_NUMBER_PATTERNS:
            m = re.search(pat, text, re.IGNORECASE)
            if m:
                num = m.group(1).strip()
                # Filtrer les artefacts OCR (ex: "dopera" extrait de "Manodopera")
                if re.match(r"^[A-Z0-9][A-Z0-9\-/\.]{2,}$", num) or "/" in num:
                    return num
        return None

    def _extract_garage_name(self, lines: list[str]) -> Optional[str]:
        """Le nom du garage est souvent en haut du document (1ères lignes non vides).
        Pour les CT, on cherche d'abord une ligne contenant 'CENTRE ... CONTROLE TECHNIQUE'."""

        # Recherche prioritaire : nom de centre CT
        ct_name_re = re.compile(
            r"(centre|center|centro|station|auto\s*bilan|contr[oô]le\s*technique|"
            r"officina|garage|atelier|werkstatt|taller|oficina|werkplaats)", re.IGNORECASE)
        skip_words = re.compile(
            r"^(rapport|date|véhicule|veicolo|vehicle|immatriculation|kilom|"
            r"résultat|resultat|avis|prochain|observations|description|désignation)", re.IGNORECASE)

        for line in lines[:8]:
            clean = line.strip(" :-–—|").replace("@", "o")
            if len(clean) < 5 or len(clean) > 80:
                continue
            if ct_name_re.search(clean) and not skip_words.match(clean):
                if not re.match(r"^[\d\s\-+()./:]+$", clean):
                    return clean[:120]

        # Recherche standard : 1ère ligne utile en haut du document
        skip = re.compile(
            r"^(facture|invoice|fattura|rechnung|factura|fatura|factuur|devis|quote|quotation|"
            r"contrôle|controle|controllo|reçu|receipt|ricetta|beleg|recibo|rapport|"
            r"centre de controle|centro di controllo|date|véhicule|veicolo|vehicle|"
            r"immatriculation|kilométrage|kilometraggio|mileage|description|désignation|"
            r"résultat|resultat|avis|prochain|observations)\b",
            re.IGNORECASE,
        )
        addr_start = re.compile(
            r"^\d{1,4}\s+(rue|avenue|av\.|boulevard|bd|place|pl\.|chemin|impasse|via|strada|"
            r"piazza|corso|calle|avenida|street|strasse|straße|weg|laan|plein|high street|road)",
            re.IGNORECASE,
        )
        city_re = re.compile(r"^\d{4,5}\s", re.IGNORECASE)
        country_re = re.compile(
            r"^(france|italia|italie|united kingdom|angleterre|deutschland|germany|españa|"
            r"espagne|belgique|nederland|pays-bas|svizzera|suisse|london|paris|milano|roma|milaan)",
            re.IGNORECASE)
        contact_re = re.compile(
            r"^(t[ée]l|tel|phone|tlf|telefono|telefon|tel|telefone|vat|tva|iva|siret|siren|"
            r"p\.?\s*i\.?va|tax|vat number|t[a-z]{0,2}l\s*:)",
            re.IGNORECASE)
        phone_line = re.compile(
            r"^(t[a-z]{1,3}l|t[a-z]{0,2}:|phone|tel[.:]|téléphone|telephone)\s*[:.]?\s*[+\d]",
            re.IGNORECASE)
        siret_line = re.compile(
            r"^(siret|siren|p\.?\s*i\.?va|vat|tva|iva|tax|btw|mwst)", re.IGNORECASE)

        for line in lines[:15]:
            clean = line.strip(" :-–—|").replace("@", "a")
            if len(clean) < 3 or len(clean) > 80:
                continue
            if skip.match(clean):
                continue
            if addr_start.match(clean):
                continue
            if city_re.match(clean):
                continue
            if country_re.match(clean):
                continue
            if contact_re.match(clean):
                continue
            if phone_line.match(clean):
                continue
            if siret_line.match(clean):
                continue
            if re.match(r"^[\d\s\-+()./:]+$", clean):
                continue
            if any(kw in clean.lower() for kws in WORK_KEYWORDS.values() for kw in kws):
                continue
            if re.match(r"^[\d\s,.\-/€£$]+$", clean):
                continue
            if re.match(r"^[+\d]", clean) and re.search(r"\d{6,}", clean):
                continue
            return clean[:120]
        return None
    def _extract_country(self, text: str) -> Optional[str]:
        t = text.lower()
        scores = {}
        for country, kws in COUNTRY_KEYWORDS.items():
            score = 0
            for kw in kws:
                if kw.startswith("\\b"):
                    score += len(re.findall(kw, t))
                else:
                    score += t.count(kw)
            if score:
                scores[country] = score
        if not scores:
            return None
        return max(scores, key=scores.get)

    def _extract_address(self, lines: list[str]) -> Optional[str]:
        """Cherche une ligne ressemblant à une adresse postale."""
        addr_re = re.compile(
            r"\b\d{1,4}\s+(rue|avenue|av\.|boulevard|bd|place|pl\.|chemin|impasse|via|strada|"
            r"piazza|corso|calle|avenida|rue|street|strasse|straße|weg|laan|plein|square)\b",
            re.IGNORECASE,
        )
        cp_re = re.compile(r"\b\d{4,5}\s+[A-ZÀ-Üa-zà-ü\-']{2,}\b")  # code postal + ville
        for line in lines[:20]:
            if addr_re.search(line) or cp_re.search(line):
                return line.strip()[:200]
        return None

    def _extract_phone(self, text: str) -> Optional[str]:
        for pat in PHONE_PATTERNS:
            m = re.search(pat, text, re.IGNORECASE)
            if m:
                phone = m.group(1).strip()
                digits = re.sub(r"\D", "", phone)
                if 8 <= len(digits) <= 15:
                    return phone
        return None

    def _extract_vat(self, text: str) -> Optional[str]:
        for pat in VAT_PATTERNS:
            m = re.search(pat, text, re.IGNORECASE)
            if m:
                return m.group(1).strip()
        return None

    def _extract_mileage(self, text: str) -> Optional[int]:
        candidates: list[int] = []
        for pat in MILEAGE_PATTERNS:
            for m in re.finditer(pat, text, re.IGNORECASE):
                raw = m.group(1).replace(" ", "").replace("\u00a0", "").replace(".", "")
                try:
                    km = int(raw)
                    if 1000 <= km <= 999999:  # véhicule crédible
                        candidates.append(km)
                except ValueError:
                    continue
        if not candidates:
            return None
        from collections import Counter
        return Counter(candidates).most_common(1)[0][0]

    # Caractères souvent confondus par l'OCR avec €/£/$ (faux positifs monétaires)
    CURRENCY_LOOKALIKES = {
        "幥": "€",   # U+5E5E (chinois) confondu avec €
        "E": "€",    # E majuscule isolé après un nombre
        "EUR": "€",
        "eur": "€",
        "£": "£",
        "L": "£",
        "$": "$",
        "S": "$",
        "USD": "$",
        "GBP": "£",
        "CHF": "CHF",
        "Fr": "CHF",
    }

    @staticmethod
    def _normalize_currency_chars(text: str) -> str:
        """Remplace les caractères ressemblant à des symboles monétaires par les vrais symboles."""
        # 幥 (U+5E5E) -> €
        text = text.replace("幥", "€")
        # Autres caractères chinois confondus avec € par l'OCR
        text = text.replace("日", "€")  # 日 (U+65E5, "jour/soleil")
        text = text.replace("目", "€")  # 目 (U+76EE)
        # Nettoyer les artefacts: nombre幥chiffre -> nombre,XX €
        import re as _re
        def fix_artifact(m):
            num = m.group(1)
            if len(num) >= 4 and "," not in num and "." not in num:
                return num[:-2] + "," + num[-2:] + " €"
            return num + " €"
        text = _re.sub(r"(\d{3,})€\d", fix_artifact, text)
        text = _re.sub(r"([\d,\.]+)€\d", r"\1 €", text)
        return text

    def _extract_amounts(self, text: str) -> dict:
        out: dict = {"currency": "EUR"}
        # Normaliser les caractères monétaires faux (幥 -> €, etc.)
        text = self._normalize_currency_chars(text)
        # Extraire le taux de TVA depuis le texte original (avant preprocessing)
        vat_rate = None
        for pat in [
            r"(?:tva|vat|iva|mwst|btw)\s*(?:\u00e0|a|@|de)?\s*(\d{1,2}(?:[,\.]\d{1,2})?)\s*%",
        ]:
            m = re.search(pat, text, re.IGNORECASE)
            if m:
                vat_rate = float(m.group(1).replace(",", "."))
                break
        # Prétraitement global : nettoyer les artefacts OCR
        # Patterns à corriger:
        #   "628,91€5" / "201,70€5" -> "201,70 €" (le € remplace le séparateur décimal + chiffre parasite)
        #   "24204" (virgule perdue) -> on ne peut rien faire ici, géré par le contexte
        #   "242 04 €" -> "242.04 €"
        #   "350.64GBP" -> "350.64 GBP"
        import re as _re
        t = text
        # "201,70€5" ou "20170€5" -> détecter: (chiffres)(€)(1 chiffre parasite)
        # Si avant € on a un nombre SANS séparateur décimal et 5+ chiffres, c'est probablement XX,YY€Z
        def fix_euro_artifact(m):
            num = m.group(1)
            # Si le nombre a 5+ chiffres sans séparateur, insérer une virgule avant les 2 derniers
            if len(num) >= 4 and "," not in num and "." not in num:
                return num[:-2] + "," + num[-2:] + " €"
            return num + " €"
        t = _re.sub(r"(\d{3,})€\d", fix_euro_artifact, t)
        t = _re.sub(r"(\d[\d,\. ]*\d)€\d", fix_euro_artifact, t)
        # "628,91€5" -> "628,91 €"
        t = _re.sub(r"([\d,\.]+)€\d", r"\1 €", t)
        # "201,70€5" déjà géré ci-dessus, mais au cas où:
        t = _re.sub(r"([\d,\.]+)\s*€\s*\d+", r"\1 €", t)
        # "20170€" (nombre 4+ chiffres collé au €, sans séparateur ni chiffre après) -> "201,70 €"
        def fix_bare_euro(m):
            num = m.group(1)
            if len(num) >= 4 and "," not in num and "." not in num:
                return num[:-2] + "," + num[-2:] + " €"
            return num + " €"
        t = _re.sub(r"(\d{4,})€(?!\d)", fix_bare_euro, t)
        # Nettoyer les espaces parasites
        t = _re.sub(r"(\d)\s+(\d{2})\s*€", r"\1,\2 €", t)  # "242 04 €" -> "242,04 €"
        t = _re.sub(r"(\d)\s+(\d{2})$", r"\1,\2", t, flags=_re.MULTILINE)  # "242 04" fin de ligne
        # "350.64GBP" -> "350.64 GBP"
        t = _re.sub(r"([\d,\.]+)\s*(GBP|EUR|USD|CHF|£|\$)", r"\1 \2", t)
        t = _re.sub(r"(GBP|EUR|USD|CHF)\s*([\d,\.]+)", r"\2 \1", t)
        # "242 04" (sans €) en fin de ligne de total -> "242,04"
        t = _re.sub(r"(\d{1,6})\s+(\d{2})(?![\d,.])", r"\1,\2", t)
        # "5 15.50€" -> "515.50€" (espace parasite OCR entre chiffres avec décimale)
        t = _re.sub(r"(\d{1,3})\s+(\d{3}(?:[,\.]\d{2})?\s*(?:€|EUR|GBP|\u00a3|\$|CHF))", r"\1\2", t)
        t = _re.sub(r"(\d{1,3})\s+(\d{2}(?:[,\.]\d{2})?\s*(?:€|EUR|GBP|\u00a3|\$|CHF))", r"\1\2", t)

        # Supprimer les lignes de TVA pour \u00e9viter de confondre le taux avec un montant
        t = _re.sub(r"(?im)^.*(?:tva|vat|iva|mwst|btw)\s*(?:\u00e0|a|@|de)?\s*\d{1,2}(?:[,\.]\d{1,2})?\s*%.*$", "", t)
        # Devise
        if re.search(r"£|GBP|pound", t, re.IGNORECASE):
            out["currency"] = "GBP"
        elif re.search(r"\bCHF\b|Fr\.\s*\d", t, re.IGNORECASE):
            out["currency"] = "CHF"
        elif re.search(r"\$|USD|dollar", t, re.IGNORECASE):
            out["currency"] = "USD"

        # Labels TTC — ancrés en fin de ligne pour éviter les faux positifs
        # \s* au lieu de \s+ pour accepter "TOTALTTC" (OCR sans espace)
        ttc_labels = [
            r"^\s*total\s*(?:ttc|toutes taxes|all\s*inclusive|inclus|iva inclusa|incl\.?\s*iva|"
            r"incl\s*mwst|incl\s*btw|inkl\s*mwst|general|grand total)\s*[:\-]?\s*$",
            r"^\s*(?:montant|amount|total|balance|importo|gesamtbetrag|totaal|total)\s*"
            r"(?:ttc|due|general|a\s*pagar|pagar|documento|te\s*betalen|betrag|fatura)?\s*[:\-]?\s*$",
            r"^\s*totale\s+documento\s*[:\-]?\s*$",
            # OCR: "TOTALTTC" sans espace, "TOT TTC"
            r"^\s*tot(?:al)?\s*ttc\s*[:\-]?\s*$",
            r"^\s*total\s*ttc\s*[:\-]?\s*$",
            # IT: "IMPORTO TOTALE" / "AMMONTARE TOTALE"
            r"^\s*(?:importo|ammontare)\s+totale\s*[:\-]?\s*$",
            # EN: "GRAND TOTAL" / "TOTAL DUE" / "AMOUNT DUE"
            r"^\s*(?:grand\s+total|total\s+due|amount\s+due)\s*[:\-]?\s*$",
            # Montant sur la m\u00eame ligne: "TOTAL TTC :    242,04 \u20ac"
            r"^\s*total\s*(?:ttc|toutes taxes|inclus|iva inclusa|incl\.?\s*iva|general|grand total)\s*[:\-]",
            r"^\s*total\s*(?:ttc|toutes taxes|inclus|iva inclusa|incl\.?\s*iva|general|grand total)\s*[:\-]?\s+\d",
            r"^\s*(?:montant|amount|importo|gesamtbetrag|totaal)\s*(?:ttc|due|documento|betrag)?\s*[:\-]",
            r"^\s*totale\s+documento\s*[:\-]",
            r"^\s*total\s*[:\-]\s*\d",
        ]
        # Labels HT — accepter "Total HI" (OCR confond T et I)
        ht_labels = [
            r"^\s*total\s*(?:h[it]|hors taxes|hors taxe)\s*[:\-]?\s*$",
            r"total\s*(?:net|netto|imponibile|iva esclusa)\s*[:\-]?\s*$",
            r"^\s*subtotal\s*[:\-]?\s*$",
            r"^\s*totale\s*imponibile\s*[:\-]?\s*$",
            r"^\s*sub\s*total\s*[:\-]?\s*$",
            r"^\s*tot(?:ale|al)?\s*h[it]\s*[:\-]?\s*$",
            # Montant sur la m\u00eame ligne: "Total HT :    201,70 \u20ac"
            r"^\s*total\s*(?:h[it]|hors taxes|hors taxe)\s*[:\-]",
            r"^\s*total\s*(?:h[it]|hors taxes|hors taxe)\s*[:\-]?\s+\d",
            r"^\s*totale\s*imponibile\s*[:\-]",
            r"^\s*subtotal\s*[:\-]",
            r"^\s*sub\s*total\s*[:\-]",
        ]
        vat_labels = [
            r"(?:tva|vat|iva|mwst|btw)\s*(?:à|a|@|de)?\s*(\d{1,2}(?:[,\.]\d{1,2})?)\s*%",
        ]

        def find_amount_after_label(labels: list[str]) -> Optional[float]:
            for label in labels:
                for m in re.finditer(label, t, re.IGNORECASE | re.MULTILINE):
                    snippet = t[m.end(): m.end() + 60]
                    # Chercher ligne par ligne pour trouver le PREMIER montant
                    # (évite de sauter au 2e montant si le 1er n'a pas de symbole €)
                    for line in snippet.splitlines():
                        line = line.strip()
                        if not line:
                            continue
                        # Ignorer les lignes qui sont des labels (pas de montant)
                        if re.match(r"^[\D]*$", line):
                            continue
                        for mp in MONEY_PATTERNS:
                            mm = re.search(mp, line)
                            if mm:
                                val = _parse_money(mm.group(1))
                                if val and val > 0:
                                    return val
                        # Heuristique OCR: nombre de 5+ chiffres sans séparateur décimal
                        # (ex: "24204" lu pour "242,04") -> insère une virgule avant les 2 derniers chiffres.
                        bare = re.match(r"^(\d{5,})(?!\d)", line)
                        if bare:
                            num = bare.group(1)
                            candidate = float(num[:-2] + "." + num[-2:])
                            if 1 <= candidate <= 999999:
                                return candidate
                        nm = re.search(r"(\d{1,3}(?:[ \u00a0.]\d{3})*(?:[,\.]\d{2})|\d+(?:[,\.]\d{2})?)", line)
                        if nm:
                            val = _parse_money(nm.group(1))
                            if val and val > 0:
                                return val
                        # Ligne avec un nombre mais pas de décimales: continuer si c'est un label
                        if re.search(r"total|ttc|ht|tva|vat|iva|subtotal|imponibile|documento|amount|due", line, re.IGNORECASE):
                            continue
                        # Si la ligne contient un nombre isolé, c'est probablement le montant
                        isolated = re.match(r"^[\s\d,\.]+$", line)
                        if isolated:
                            nums = re.findall(r"\d[\d,\.]*", line)
                            for n in nums:
                                val = _parse_money(n)
                                if val and val > 0:
                                    return val
            return None

        ttc = find_amount_after_label(ttc_labels)
        ht = find_amount_after_label(ht_labels)

        # Extraire le taux de TVA AVANT de supprimer les lignes TVA
        # vat_rate déjà extrait ci-dessus depuis le texte original

        out["ttc"] = ttc
        out["ht"] = ht
        out["vat_rate"] = vat_rate

        # Calculs dérivés
        if ttc is None and ht is not None and vat_rate is not None:
            out["ttc"] = round(ht * (1 + vat_rate / 100), 2)
        if vat_rate is None and ttc and ht and ht > 0:
            out["vat_rate"] = round((ttc / ht - 1) * 100, 2)

        # Fallback TTC : plus grand montant du document
        if ttc is None:
            all_amounts = []
            for mp in MONEY_PATTERNS:
                for mm in re.finditer(mp, t):
                    v = _parse_money(mm.group(1))
                    if v and v > 20:
                        all_amounts.append(v)
            for line in t.splitlines()[-15:]:
                if re.search(r"total|ttc|imponibile|documento|amount|due|pagar|pagamento|bezahlen", line, re.IGNORECASE):
                    nm = re.findall(r"(\d{1,3}(?:[ \u00a0.]\d{3})*(?:[,\.]\d{2})|\d+(?:[,\.]\d{2})?)", line)
                    for n in nm:
                        v = _parse_money(n)
                        if v and v > 20:
                            all_amounts.append(v)
            if all_amounts:
                out["ttc"] = max(all_amounts)

        # Fallback HT
        if ht is None and ttc is not None and vat_rate is not None:
            out["ht"] = round(ttc / (1 + vat_rate / 100), 2)

        return out
    def _extract_work_lines(self, lines: list[str]) -> list[dict]:
        """Détecte les lignes de travaux à partir des mots-clés connus."""
        found: list[dict] = []
        for line in lines:
            low = line.lower()
            matched = []
            for category, kws in WORK_KEYWORDS.items():
                if any(kw in low for kw in kws):
                    matched.append(category)
            if matched:
                # Essayer d'extraire un montant sur la ligne
                amount = None
                for mp in MONEY_PATTERNS:
                    mm = re.search(mp, line)
                    if mm:
                        amount = _parse_money(mm.group(1))
                        break
                if amount is None:
                    nm = re.search(r"(\d{1,3}(?:[ \u00a0.]\d{3})*(?:[,\.]\d{2})|\d+(?:[,\.]\d{2})?)\s*(?:€|EUR|£|GBP)?\s*$", line)
                    if nm:
                        amount = _parse_money(nm.group(1))
                found.append({
                    "line": line[:200],
                    "categories": matched,
                    "amount": amount,
                })
        return found

    def _extract_parts_lines(self, lines: list[str]) -> list[dict]:
        """Détecte les lignes de pièces détachées (souvent avec référence + prix)."""
        parts: list[dict] = []
        ref_re = re.compile(r"\b[A-Z0-9]{5,}[\-/][A-Z0-9]{2,}\b")  # réf constructeur type
        for line in lines:
            low = line.lower()
            # ignorer les lignes déjà identifiées comme totaux
            if re.search(r"total|sous-total|subtotal|tva|vat|iva", low):
                continue
            has_price = re.search(r"\d+[,\.]\d{2}\s*(?:€|EUR|£|GBP)?", line)
            has_ref = ref_re.search(line)
            has_qty = re.search(r"\b(?:qté|qty|qt|quantity|quantità|quantité|anzahl|aantal|menge)\b", low)
            if (has_price and (has_ref or has_qty)) or (has_price and has_ref):
                parts.append({"line": line[:200]})
        return parts


extraction_service = ExtractionService()
