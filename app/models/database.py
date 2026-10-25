"""
Modèles de base de données SQLAlchemy pour le carnet d'entretien.
Gère : véhicule, documents (factures/CT), opérations d'entretien, alertes, kilométrage.
"""
from datetime import datetime, date
from enum import Enum as PyEnum
from sqlalchemy import (
    Column, Integer, String, Float, Date, DateTime, Boolean, Text,
    ForeignKey, Enum, JSON, UniqueConstraint
)
from sqlalchemy.ext.asyncio import AsyncAttrs, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from app.core.config import settings


class Base(AsyncAttrs, DeclarativeBase):
    pass


class DocumentType(str, PyEnum):
    INVOICE = "facture"           # Facture de réparation / révision
    CT = "controle_technique"    # Contrôle technique
    QUOTE = "devis"               # Devis
    RECEIPT = "recu"              # Reçu / bon d'achat (pneus, pièces...)
    OTHER = "autre"               # Autre document


class DocumentStatus(str, PyEnum):
    PENDING_OCR = "en_attente_ocr"
    OCR_DONE = "ocr_termine"
    VERIFIED = "verifie"           # relu et validé par l'utilisateur
    ARCHIVED = "archive"


class OperationType(str, PyEnum):
    OIL_CHANGE = "vidange"
    FILTERS = "filtres"             # filtre à air, gasoil, habitacle
    TIMING_BELT = "distribution"    # courroie de distribution
    ACCESSORY_BELT = "courroie_accessoires"
    BRAKES = "freins"
    TIRES = "pneumatiques"
    BATTERY = "batterie"
    COOLANT = "liquide_refroidissement"
    GEARBOX = "boite_vitesses"
    SUSPENSION = "suspension"
    EXHAUST = "echappement"
    ELECTRICAL = "electricite"
    BODY = "carrosserie"
    CT = "controle_technique"
    OTHER = "autre"


class AlertSeverity(str, PyEnum):
    INFO = "info"
    WARNING = "attention"
    URGENT = "urgent"
    OVERDUE = "en_retard"


class Vehicle(Base):
    """Véhicule suivi (par défaut : Citroën C2 1.4 HDi 2009)."""
    __tablename__ = "vehicles"

    id: Mapped[int] = mapped_column(primary_key=True)
    brand: Mapped[str] = mapped_column(String(50), default=settings.VEHICLE_BRAND)
    model: Mapped[str] = mapped_column(String(50), default=settings.VEHICLE_MODEL)
    engine: Mapped[str] = mapped_column(String(100), default=settings.VEHICLE_ENGINE)
    year: Mapped[int] = mapped_column(Integer, default=settings.VEHICLE_YEAR)
    fuel: Mapped[str] = mapped_column(String(20), default=settings.VEHICLE_FUEL)
    vin: Mapped[str | None] = mapped_column(String(17), nullable=True)
    plate: Mapped[str | None] = mapped_column(String(20), nullable=True)
    color: Mapped[str | None] = mapped_column(String(50), nullable=True)
    initial_mileage: Mapped[int] = mapped_column(Integer, default=settings.VEHICLE_INITIAL_MILEAGE)
    current_mileage: Mapped[int] = mapped_column(Integer, default=settings.VEHICLE_INITIAL_MILEAGE)
    first_registration: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    documents: Mapped[list["Document"]] = relationship(back_populates="vehicle", cascade="all, delete-orphan")
    mileage_records: Mapped[list["MileageRecord"]] = relationship(back_populates="vehicle", cascade="all, delete-orphan")
    maintenance_ops: Mapped[list["MaintenanceOperation"]] = relationship(back_populates="vehicle", cascade="all, delete-orphan")


class MileageRecord(Base):
    """Historique des relevés de kilométrage."""
    __tablename__ = "mileage_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    vehicle_id: Mapped[int] = mapped_column(ForeignKey("vehicles.id"))
    vehicle: Mapped["Vehicle"] = relationship(back_populates="mileage_records")
    mileage: Mapped[int] = mapped_column(Integer)
    recorded_at: Mapped[date] = mapped_column(Date)
    source: Mapped[str | None] = mapped_column(String(100), nullable=True)  # ex: "CT", "facture", "relevé manuel"
    document_id: Mapped[int | None] = mapped_column(ForeignKey("documents.id"), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Document(Base):
    """Document uploadé (PDF ou photo) : facture, CT, devis..."""
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    vehicle_id: Mapped[int] = mapped_column(ForeignKey("vehicles.id"))
    vehicle: Mapped["Vehicle"] = relationship(back_populates="documents")

    doc_type: Mapped[DocumentType] = mapped_column(Enum(DocumentType), default=DocumentType.INVOICE)
    status: Mapped[DocumentStatus] = mapped_column(Enum(DocumentStatus), default=DocumentStatus.PENDING_OCR)

    original_filename: Mapped[str] = mapped_column(String(255))
    stored_path: Mapped[str] = mapped_column(String(500))       # chemin fichier original
    ocr_text_path: Mapped[str | None] = mapped_column(String(500), nullable=True)  # texte OCR extrait

    # Métadonnées extraites par OCR / renseignées manuellement
    detected_language: Mapped[str | None] = mapped_column(String(10), nullable=True)
    document_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    document_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    garage_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    garage_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    garage_country: Mapped[str | None] = mapped_column(String(100), nullable=True)
    garage_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    garage_vat: Mapped[str | None] = mapped_column(String(50), nullable=True)  # TVA / SIRET / VAT number

    mileage_at_service: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_ht: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_ttc: Mapped[float | None] = mapped_column(Float, nullable=True)
    currency: Mapped[str] = mapped_column(String(3), default="EUR")

    # Résultat OCR brut + confiance
    ocr_raw_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    ocr_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    unreadable_zones: Mapped[str | None] = mapped_column(JSON, nullable=True)  # liste des zones illisibles

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    operations: Mapped[list["MaintenanceOperation"]] = relationship(back_populates="document", cascade="all, delete-orphan")


class MaintenanceOperation(Base):
    """Opération d'entretien liée à un document (ou saisie manuellement)."""
    __tablename__ = "maintenance_operations"

    id: Mapped[int] = mapped_column(primary_key=True)
    vehicle_id: Mapped[int] = mapped_column(ForeignKey("vehicles.id"))
    vehicle: Mapped["Vehicle"] = relationship(back_populates="maintenance_ops")
    document_id: Mapped[int | None] = mapped_column(ForeignKey("documents.id"), nullable=True)
    document: Mapped["Document | None"] = relationship(back_populates="operations")

    op_type: Mapped[OperationType] = mapped_column(Enum(OperationType), default=OperationType.OTHER)
    title: Mapped[str] = mapped_column(String(200))           # ex: "Vidange moteur + filtre à huile"
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    parts: Mapped[str | None] = mapped_column(JSON, nullable=True)  # liste des pièces
    labor_cost: Mapped[float | None] = mapped_column(Float, nullable=True)
    parts_cost: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_cost: Mapped[float | None] = mapped_column(Float, nullable=True)

    performed_at: Mapped[date] = mapped_column(Date)
    mileage: Mapped[int | None] = mapped_column(Integer, nullable=True)
    garage: Mapped[str | None] = mapped_column(String(200), nullable=True)
    country: Mapped[str | None] = mapped_column(String(100), nullable=True)

    is_ct: Mapped[bool] = mapped_column(Boolean, default=False)
    ct_result: Mapped[str | None] = mapped_column(String(50), nullable=True)  # favorable, defaillance mineure, majeure, critique
    ct_next_due: Mapped[date | None] = mapped_column(Date, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class MaintenanceSchedule(Base):
    """
    Élément du plan d'entretien préventif (généré à partir des préconisations
    constructeur pour la C2 1.4 HDi).
    """
    __tablename__ = "maintenance_schedule"

    id: Mapped[int] = mapped_column(primary_key=True)
    vehicle_id: Mapped[int] = mapped_column(ForeignKey("vehicles.id"))

    op_type: Mapped[OperationType] = mapped_column(Enum(OperationType))
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    interval_km: Mapped[int | None] = mapped_column(Integer, nullable=True)
    interval_months: Mapped[int | None] = mapped_column(Integer, nullable=True)

    last_done_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    last_done_mileage: Mapped[int | None] = mapped_column(Integer, nullable=True)

    next_due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    next_due_mileage: Mapped[int | None] = mapped_column(Integer, nullable=True)

    severity_when_due: Mapped[AlertSeverity] = mapped_column(Enum(AlertSeverity), default=AlertSeverity.WARNING)
    is_critical: Mapped[bool] = mapped_column(Boolean, default=False)  # ex: courroie de distribution

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Alert(Base):
    """Alerte générée (échéance proche, dépassée, zone OCR illisible...)."""
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(primary_key=True)
    vehicle_id: Mapped[int] = mapped_column(ForeignKey("vehicles.id"))

    severity: Mapped[AlertSeverity] = mapped_column(Enum(AlertSeverity))
    title: Mapped[str] = mapped_column(String(200))
    message: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(50))  # entretien, ct, ocr, kilometrage

    related_document_id: Mapped[int | None] = mapped_column(ForeignKey("documents.id"), nullable=True)
    related_schedule_id: Mapped[int | None] = mapped_column(ForeignKey("maintenance_schedule.id"), nullable=True)

    is_dismissed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    dismissed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


engine = create_async_engine(settings.DATABASE_URL, echo=settings.DEBUG)
async_session_factory = async_sessionmaker(engine, expire_on_commit=False)


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_session():
    async with async_session_factory() as session:
        yield session
