"""
Génère des images de factures fictives (FR, EN, IT) pour tester l'OCR end-to-end.
Usage : python3 tests/generate_test_invoice.py
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).parent.parent))

OUTPUT_DIR = Path(__file__).parent / "fixtures"
OUTPUT_DIR.mkdir(exist_ok=True)

# Essayer de trouver une police, sinon utiliser la police par défaut
FONT_PATHS = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
]

def get_font(size, bold=False):
    for p in FONT_PATHS:
        if "Bold" in p and bold and Path(p).exists():
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    for p in FONT_PATHS:
        if Path(p).exists() and not bold:
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()


def draw_invoice(filename: str, lines: list[tuple[str, int, bool]], width=800, line_height=28):
    """Dessine une facture fictive. lines = [(texte, taille_relative, gras), ...]"""
    height = 60 + len(lines) * line_height + 80
    img = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(img)

    # Bordure
    draw.rectangle([10, 10, width - 10, height - 10], outline="black", width=2)

    y = 40
    for text, rel_size, bold in lines:
        size = int(16 * rel_size)
        font = get_font(size, bold)
        draw.text((40, y), text, fill="black", font=font)
        y += line_height * rel_size + 6

    # Ligne de séparation avant le total
    path = OUTPUT_DIR / filename
    img.save(path)
    print(f"✅ Généré : {path}")
    return path


# ==================== Facture FR ====================
fr_lines = [
    ("GARAGE AUTO ROMAIN", 1.4, True),
    ("12 Rue de la République", 1.0, False),
    ("75011 Paris, France", 1.0, False),
    ("Tél : 01 23 45 67 89", 1.0, False),
    ("SIRET : 123 456 789 00012", 1.0, False),
    ("TVA FR 12 123456789", 1.0, False),
    ("", 1.0, False),
    ("FACTURE N° 2024-0157", 1.3, True),
    ("Date : 15/03/2024", 1.1, False),
    ("Véhicule : Citroën C2 1.4 HDi — AB-123-CD", 1.0, False),
    ("Kilométrage : 187 450 km", 1.1, True),
    ("", 1.0, False),
    ("Désignation                          Qté    P.U. HT    Total HT", 1.0, True),
    ("Vidange moteur huile 5W40             1      45,00      45,00", 1.0, False),
    ("Filtre à huile                       1      12,50      12,50", 1.0, False),
    ("Filtre à gasoil                      1      18,90      18,90", 1.0, False),
    ("Filtre à air                         1      15,30      15,30", 1.0, False),
    ("Main d'œuvre révision                2h     55,00     110,00", 1.0, False),
    ("", 1.0, False),
    ("Total HT :                                          201,70 €", 1.1, True),
    ("TVA 20,00 % :                                        40,34 €", 1.0, False),
    ("TOTAL TTC :                                         242,04 €", 1.3, True),
    ("", 1.0, False),
    ("Garantie : 2 ans pièces et main d'œuvre", 0.9, False),
]
draw_invoice("facture_fr_test.png", fr_lines)

# ==================== Invoice EN (UK garage) ====================
en_lines = [
    ("QUICK FIT GARAGE LTD", 1.4, True),
    ("45 High Street", 1.0, False),
    ("London SW1A 1AA, United Kingdom", 1.0, False),
    ("Tel: +44 20 7946 0958", 1.0, False),
    ("VAT Number: GB 123 4567 89", 1.0, False),
    ("", 1.0, False),
    ("INVOICE No: INV-2024-0892", 1.3, True),
    ("Date: 22/06/2024", 1.1, False),
    ("Vehicle: Citroen C2 1.4 HDi — AB-123-CD", 1.0, False),
    ("Mileage: 194 200 km", 1.1, True),
    ("", 1.0, False),
    ("Description                       Qty   Unit Price   Total", 1.0, True),
    ("Engine oil change 5W40             1        38.00      38.00", 1.0, False),
    ("Oil filter                         1        11.20      11.20", 1.0, False),
    ("Brake pads front                   1        45.00      45.00", 1.0, False),
    ("Brake discs front                  1        68.00      68.00", 1.0, False),
    ("Labour 2.5h                        2.5      52.00     130.00", 1.0, False),
    ("", 1.0, False),
    ("Subtotal:                                           292.20 GBP", 1.1, True),
    ("VAT 20%:                                             58.44 GBP", 1.0, False),
    ("TOTAL:                                              350.64 GBP", 1.3, True),
    ("", 1.0, False),
    ("Warranty: 2 years parts and labour", 0.9, False),
]
draw_invoice("invoice_en_test.png", en_lines, width=850)

# ==================== Fattura IT (Italian garage) ====================
it_lines = [
    ("OFFICINA MECCANICA ROSSI", 1.4, True),
    ("Via Roma 25", 1.0, False),
    ("20121 Milano, Italia", 1.0, False),
    ("Tel: +39 02 1234 5678", 1.0, False),
    ("P. IVA: IT 12345678901", 1.0, False),
    ("", 1.0, False),
    ("FATTURA n. 2024/0341", 1.3, True),
    ("Data: 10/09/2023", 1.1, False),
    ("Veicolo: Citroen C2 1.4 HDi — AB-123-CD", 1.0, False),
    ("Chilometraggio: 165 300 km", 1.1, True),
    ("", 1.0, False),
    ("Descrizione                       Q.tà  Prezzo uni.   Totale", 1.0, True),
    ("Cambio olio motore 5W40            1       42,00       42,00", 1.0, False),
    ("Filtro olio                        1       11,00       11,00", 1.0, False),
    ("Filtro gasolio                     1       17,50       17,50", 1.0, False),
    ("Cinghia distribuzione kit          1      180,00      180,00", 1.0, False),
    ("Pompa acqua                        1       85,00       85,00", 1.0, False),
    ("Manodopera 4h                      4       45,00      180,00", 1.0, False),
    ("", 1.0, False),
    ("Totale imponibile:                                  515,50 €", 1.1, True),
    ("IVA 22%:                                             113,41 €", 1.0, False),
    ("TOTALE DOCUMENTO:                                   628,91 €", 1.3, True),
    ("", 1.0, False),
    ("Garanzia: 2 anni ricambi e manodopera", 0.9, False),
]
draw_invoice("fattura_it_test.png", it_lines, width=850)

# ==================== Contrôle technique FR ====================
ct_lines = [
    ("CENTRE DE CONTROLE TECHNIQUE AUTO BILAN", 1.4, True),
    ("88 Avenue des Contrôles", 1.0, False),
    ("69000 Lyon, France", 1.0, False),
    ("Tél : 04 78 12 34 56", 1.0, False),
    ("SIRET : 987 654 321 00045", 1.0, False),
    ("", 1.0, False),
    ("RAPPORT DE CONTROLE TECHNIQUE", 1.3, True),
    ("Date du contrôle : 05/02/2025", 1.1, False),
    ("Véhicule : Citroën C2 1.4 HDi", 1.0, False),
    ("Immatriculation : AB-123-CD", 1.0, False),
    ("Kilométrage : 201 850 km", 1.1, True),
    ("", 1.0, False),
    ("Résultat : AVIS FAVORABLE", 1.4, True),
    ("", 1.0, False),
    ("Prochain contrôle avant le : 05/02/2027", 1.1, True),
    ("", 1.0, False),
    ("Observations : RAS — aucune défaillance constatée", 1.0, False),
]
draw_invoice("ct_fr_test.png", ct_lines)

print(f"\n🎉 4 documents de test générés dans {OUTPUT_DIR}")
print("   - facture_fr_test.png  (facture FR, Paris)")
print("   - invoice_en_test.png  (invoice EN, Londres)")
print("   - fattura_it_test.png  (fattura IT, Milan — distribution)")
print("   - ct_fr_test.png       (contrôle technique, Lyon)")
