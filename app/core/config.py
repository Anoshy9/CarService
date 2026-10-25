"""
Configuration centrale de l'application Carnet d'Entretien Automobile.
Citroën C2 1.4 HDi 2009 — Gestion professionnelle du suivi d'entretien.
"""
from pathlib import Path
from pydantic_settings import BaseSettings
from pydantic import Field

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
EXPORT_DIR = DATA_DIR / "exports"
DB_DIR = DATA_DIR / "db"

for d in (UPLOAD_DIR, EXPORT_DIR, DB_DIR):
    d.mkdir(parents=True, exist_ok=True)


class Settings(BaseSettings):
    APP_NAME: str = "Carnet d'Entretien Automobile"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

    DATABASE_URL: str = Field(
        default=f"sqlite+aiosqlite:///{DB_DIR / 'carnet_entretien.db'}"
    )

    UPLOAD_DIR: Path = UPLOAD_DIR
    EXPORT_DIR: Path = EXPORT_DIR
    MAX_UPLOAD_SIZE: int = 50 * 1024 * 1024  # 50 Mo
    ALLOWED_EXTENSIONS: set[str] = {".pdf", ".png", ".jpg", ".jpeg", ".tiff", ".bmp", ".webp"}

    # OCR
    OCR_ENGINE: str = "rapidocr"  # rapidocr | tesseract
    OCR_LANGUAGES: list[str] = ["fr", "en", "it", "de", "es", "pt", "nl"]
    OCR_CONFIDENCE_THRESHOLD: float = 0.60  # en dessous, zone signalée comme illisible
    OCR_DPI: int = 300  # DPI pour la conversion PDF -> image

    # Véhicule par défaut (modifiable via l'interface)
    VEHICLE_BRAND: str = "Citroën"
    VEHICLE_MODEL: str = "C2"
    VEHICLE_ENGINE: str = "1.4 HDi 70 cv (DV4TD)"
    VEHICLE_YEAR: int = 2009
    VEHICLE_FUEL: str = "Diesel"
    VEHICLE_VIN: str = ""  # à renseigner
    VEHICLE_PLATE: str = ""  # à renseigner
    VEHICLE_INITIAL_MILEAGE: int = 0  # kilométrage au départ du suivi

    # Intervalles d'entretien constructeur C2 1.4 HDi (en km et/ou mois)
    # Source : carnet d'entretien Citroën C2 1.4 HDi 70
    SERVICE_INTERVAL_KM: int = 30000      # révision majeure tous les 30 000 km
    SERVICE_INTERVAL_MONTHS: int = 24    # ou tous les 24 mois
    OIL_CHANGE_KM: int = 30000           # vidange tous les 30 000 km
    OIL_CHANGE_MONTHS: int = 24          # ou tous les 24 mois
    TIMING_BELT_KM: int = 240000         # courroie de distribution
    TIMING_BELT_MONTHS: int = 240        # ou 10 ans (240 mois) — le 1er atteint
    ACCESSORY_BELT_KM: int = 180000       # courroie d'accessoires
    ACCESSORY_BELT_MONTHS: int = 120      # ou 10 ans
    COOLANT_MONTHS: int = 60             # liquide de refroidissement tous les 5 ans
    BRAKE_FLUID_MONTHS: int = 24          # liquide de frein tous les 2 ans
    GEARBOX_OIL_KM: int = 60000           # huile de boîte de vitesses (contrôle/rempl.)
    FUEL_FILTER_KM: int = 60000           # filtre à gasoil tous les 60 000 km
    AIR_FILTER_KM: int = 60000            # filtre à air
    CABIN_FILTER_KM: int = 30000          # filtre d'habitacle
    CT_INTERVAL_FIRST_MONTHS: int = 48    # 1er CT à 4 ans
    CT_INTERVAL_NEXT_MONTHS: int = 24     # CT tous les 2 ans ensuite

    class Config:
        env_prefix = "C2_"


settings = Settings()
