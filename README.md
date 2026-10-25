# 🚗 CarService — Carnet d'Entretien Automobile
## Citroën C2 · 1.4 HDi 70 cv (DV4TD) · 2009

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://github.com/codespaces/new?hide_repo_select=true&ref=main&repo=Anoshy9/CarService)

> **🚀 Lancer l'application en 1 clic :** [Ouvrir dans GitHub Codespaces](https://github.com/codespaces/new?hide_repo_select=true&ref=main&repo=Anoshy9/CarService) → attendre 2 min → taper `./run.sh` → cliquer sur le lien du port 8000

---

## ✨ Fonctionnalités

### 📤 Upload & OCR multilingue
- **Photos ou PDF** : prenez une photo de votre facture avec votre téléphone ou uploadez un PDF
- **7 langues** : 🇫🇷 Français · 🇬🇧 Anglais · 🇮🇹 Italien · 🇩🇪 Allemand · 🇪🇸 Espagnol · 🇵🇹 Portugais · 🇳🇱 Néerlandais
- **Détection automatique de la langue** du document
- **Zones illisibles signalées** : si l'OCR ne parvient pas à lire une zone avec certitude
  (confiance < 60 %), une alerte est créée pour relecture manuelle
- **Pré-traitement d'image** : correction d'orientation EXIF, contraste, netteté

### 🔍 Extraction intelligente
À partir du texte OCR, l'application extrait automatiquement :
- **Date** du document (tous formats : 31/12/2023, 12/31/2023, 31.12.2023, ISO…)
- **Numéro de facture** (Facture n°, Invoice No, Fattura n., Rechnung Nr…)
- **Nom du garage / centre** (première ligne utile, filtres intelligents)
- **Adresse, téléphone, TVA/VAT/P.IVA/SIRET**
- **Pays** (détection automatique : France, Italie, Royaume-Uni, Allemagne, Espagne, Belgique, Pays-Bas, Suisse, Portugal, Luxembourg)
- **Kilométrage** au moment de l'intervention
- **Montants HT / TTC / TVA** (devises : €, £, CHF, $)
- **Lignes de travaux** (vidange, freins, distribution, filtres, pneus, batterie…)
- **Pièces détachées** (références constructeur, quantités, prix)
- **Détection des contrôles techniques** (résultat : favorable, défaillance mineure/majeure/critique)

### 📅 Planning d'entretien — Préconisations constructeur C2 1.4 HDi
| Poste | Intervalle | Criticité |
|-------|-----------|-----------|
| Vidange moteur + filtre à huile | 30 000 km ou 24 mois | ⚠️ Urgent |
| Filtre à gasoil | 60 000 km | ⚠️ |
| Filtre à air | 60 000 km | ⚠️ |
| Filtre d'habitacle | 30 000 km ou 24 mois | ℹ️ |
| **Courroie de distribution + galets + pompe à eau** | **240 000 km ou 10 ans** | 🔴 **CRITIQUE** |
| Courroie d'accessoires + galets | 180 000 km ou 10 ans | ⚠️ |
| Liquide de refroidissement | 5 ans (60 mois) | ⚠️ |
| Liquide de frein (DOT 4) | 2 ans (24 mois) | ⚠️ |
| Huile de boîte de vitesses (contrôle) | 60 000 km | ℹ️ |
| Contrôle technique | 1er à 4 ans, puis tous les 2 ans | ⚠️ Urgent |

> 🔴 **Alerte courroie de distribution** : Le moteur 1.4 HDi (DV4TD) est à **interférence**.
> La rupture de la courroie de distribution entraîne la **destruction immédiate du moteur**.
> Remplacement impératif tous les 240 000 km **ou 10 ans**, le premier atteint.

### 📊 Tableau de bord
- Kilométrage actuel et estimation km/an
- Total dépensé, nombre de documents et d'interventions
- Interventions **en retard** 🔴, **à venir** 🟡, **à jour** 🟢
- Alertes actives avec niveaux de sévérité
- Dernier contrôle technique et prochaine échéance

### 🛣️ Suivi du kilométrage
- Relevés manuels avec date et source
- Graphique d'évolution
- Calcul automatique du kilométrage annuel moyen
- Historique complet avec écarts entre relevés

### 📥 Export du carnet d'entretien
- Export JSON complet : véhicule, planning, documents, interventions, kilométrage, alertes, statistiques
- Prêt à être imprimé ou transmis à un professionnel
- Preuve d'entretien pour la revente

### 🌍 Multi-pays
- Toutes les factures sont géolocalisées (pays du garage extrait automatiquement)
- Statistiques par pays (nombre de documents, total dépensé)
- Devises gérées (EUR, GBP, CHF, USD)

---

## 🚀 Installation & Lancement

### Prérequis
- Python 3.11+
- pip

### Installation
```bash
cd carnet-entretien-c2
pip install -r requirements.txt
```

### Lancement
```bash
# Option 1 : script de lancement
./run.sh

# Option 2 : manuel
PYTHONPATH=. python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Accès
- **Interface web** : http://localhost:8000
- **API REST** : http://localhost:8000/api

---

## 📱 Utilisation depuis le téléphone

1. Ouvrez l'interface web sur votre téléphone (http://<IP-serveur>:8000)
2. Allez dans **📤 Ajouter un document**
3. Prenez une **photo** de votre facture ou sélectionnez un **PDF**
4. L'OCR analyse automatiquement le document en quelques secondes
5. Vérifiez les données extraites et corrigez si besoin
6. Consultez votre **tableau de bord** et votre **planning**

### Conseils pour un OCR optimal
- 📸 Bonne luminosité, éviter les reflets
- 📄 Document bien à plat, cadrage complet
- 🔍 Photo nette (pas de flou de bougé)
- 🌞 Éviter les ombres sur le document

---

## 🏗️ Architecture

```
carnet-entretien-c2/
├── app/
│   ├── main.py                  # Point d'entrée FastAPI
│   ├── core/config.py           # Configuration (véhicule, intervalles, OCR)
│   ├── models/database.py       # Modèles SQLAlchemy (6 tables)
│   ├── services/
│   │   ├── ocr_service.py       # Moteur OCR multilingue (RapidOCR)
│   │   ├── extraction_service.py # Extraction intelligente des données
│   │   ├── document_service.py   # Gestion des documents (upload, traitement)
│   │   └── maintenance_engine.py # Moteur de planification C2 1.4 HDi
│   ├── api/routes.py            # API REST (20+ endpoints)
│   ├── templates/               # Pages web (Jinja2)
│   └── static/                  # CSS professionnel + JS
├── data/
│   ├── uploads/                 # Documents originaux stockés
│   ├── exports/                 # Exports du carnet
│   └── db/                      # Base SQLite
├── tests/
│   ├── generate_test_invoice.py # Générateur de factures de test
│   └── fixtures/                # 4 documents de test (FR/EN/IT/CT)
├── requirements.txt
└── run.sh
```

### Base de données (SQLite)
| Table | Description |
|-------|-------------|
| `vehicles` | Véhicule (C2 1.4 HDi 2009) |
| `documents` | Factures, CT, devis uploadés + métadonnées OCR |
| `maintenance_operations` | Interventions d'entretien |
| `maintenance_schedule` | Plan d'entretien préventif avec échéances |
| `mileage_records` | Historique des relevés de kilométrage |
| `alerts` | Alertes (échéances, zones illisibles) |

---

## 🔌 API REST

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/api/health` | État de l'application |
| GET/PUT | `/api/vehicle` | Infos véhicule |
| POST | `/api/documents/upload` | Upload + OCR (multipart) |
| GET | `/api/documents` | Liste des documents (filtres type/pays) |
| GET | `/api/documents/{id}` | Détail d'un document |
| PUT | `/api/documents/{id}` | Correction manuelle |
| POST | `/api/documents/{id}/reprocess` | Retraiter l'OCR |
| GET | `/api/documents/{id}/file` | Télécharger le fichier original |
| GET | `/api/dashboard` | Tableau de bord complet |
| GET | `/api/schedule` | Planning des révisions |
| GET | `/api/schedule/specs` | Préconisations constructeur |
| GET/POST | `/api/operations` | Historique des interventions |
| GET/POST | `/api/mileage` | Relevés de kilométrage |
| GET | `/api/alerts` | Alertes actives |
| POST | `/api/alerts/{id}/dismiss` | Ignorer une alerte |
| GET | `/api/stats` | Statistiques (par pays, type…) |
| GET | `/api/export/carnet-entretien` | Export JSON complet |
| GET | `/api/config/languages` | Config OCR |

---

## 🧪 Tests

```bash
# Générer des factures de test (FR, EN, IT, CT)
python3 tests/generate_test_invoice.py

# Tester l'OCR + extraction manuellement
PYTHONPATH=. python3 -c "
from pathlib import Path
from app.services.ocr_service import ocr_service
from app.services.extraction_service import extraction_service
ocr = ocr_service.process_file(Path('tests/fixtures/facture_fr_test.png'))
ext = extraction_service.extract(ocr)
print(ext.to_dict())
"
```

---

## ⚠️ Avertissements importants

### Courroie de distribution (1.4 HDi DV4TD)
Le moteur DV4TD est un moteur **à interférence** : en cas de rupture de la courroie de
distribution, les soupapes entrent en collision avec les pistons → **destruction du moteur**.
- Remplacement : **240 000 km ou 10 ans** (le premier atteint)
- Toujours remplacer galets + pompe à eau en même temps
- Ne jamais dépasser 10 ans même avec peu de kilométrage (vieillissement du caoutchouc)

### Contrôle technique
- 1er CT : **4 ans** après la 1ère mise en circulation
- Ensuite : tous les **2 ans**
- Le non-respect entraîne une amende et l'immobilisation du véhicule

---

## 📄 Licence

Projet personnel — Utilisation libre.

---

## 🛠️ Stack technique

- **Backend** : FastAPI + SQLAlchemy (async) + SQLite
- **OCR** : RapidOCR (ONNX Runtime) — multilingue latin
- **Frontend** : HTML/CSS/JS vanilla (design dark professionnel)
- **PDF** : pdf2image (conversion PDF → image pour OCR)
- **Images** : Pillow (pré-traitement)
