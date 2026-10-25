"""
Service de gestion des documents : upload, stockage, traitement OCR,
extraction des données, liaison avec les opérations d'entretien.
"""
from __future__ import annotations

import json
import uuid
from datetime import date, datetime
from pathlib import Path
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.database import (
    Document, DocumentType, DocumentStatus, Vehicle,
    MaintenanceOperation, MileageRecord, Alert, AlertSeverity, OperationType,
)
from app.services.ocr_service import ocr_service, OCRResult
from app.services.extraction_service import extraction_service, ExtractedInvoice


class DocumentService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_default_vehicle(self) -> Optional[Vehicle]:
        res = await self.session.execute(select(Vehicle).limit(1))
        return res.scalar_one_or_none()

    async def save_upload(self, file_bytes: bytes, filename: str, doc_type: DocumentType = DocumentType.INVOICE) -> Document:
        """Sauvegarde le fichier uploadé et crée l'enregistrement Document."""
        vehicle = await self.get_default_vehicle()
        if not vehicle:
            raise ValueError("Aucun véhicule enregistré. Veuillez d'abord configurer le véhicule.")

        ext = Path(filename).suffix.lower()
        if ext not in settings.ALLOWED_EXTENSIONS:
            raise ValueError(f"Extension non autorisée : {ext}. Autorisées : {sorted(settings.ALLOWED_EXTENSIONS)}")

        unique_name = f"{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}{ext}"
        stored_path = settings.UPLOAD_DIR / unique_name
        stored_path.write_bytes(file_bytes)

        doc = Document(
            vehicle_id=vehicle.id,
            doc_type=doc_type,
            status=DocumentStatus.PENDING_OCR,
            original_filename=filename,
            stored_path=str(stored_path),
        )
        self.session.add(doc)
        await self.session.commit()
        await self.session.refresh(doc)
        return doc

    async def process_document(self, document_id: int) -> Document:
        """
        Lance le traitement OCR + extraction sur un document.
        Met à jour le document avec les données extraites.
        """
        doc = await self.session.get(Document, document_id)
        if not doc:
            raise ValueError(f"Document {document_id} introuvable")

        # OCR
        ocr: OCRResult = ocr_service.process_file(Path(doc.stored_path))

        # Sauvegarde du texte OCR
        ocr_text_path = settings.UPLOAD_DIR / (Path(doc.stored_path).stem + "_ocr.txt")
        ocr_text_path.write_text(ocr.full_text, encoding="utf-8")

        # Extraction
        extracted: ExtractedInvoice = extraction_service.extract(ocr)

        # Mise à jour du document
        doc.ocr_raw_text = ocr.full_text
        doc.ocr_text_path = str(ocr_text_path)
        doc.ocr_confidence = ocr.average_confidence
        doc.detected_language = ocr.detected_language
        doc.unreadable_zones = ocr.unreadable_zones
        doc.document_date = extracted.document_date
        doc.document_number = extracted.document_number
        doc.garage_name = extracted.garage_name
        doc.garage_address = extracted.garage_address
        doc.garage_country = extracted.garage_country
        doc.garage_phone = extracted.garage_phone
        doc.garage_vat = extracted.garage_vat
        doc.mileage_at_service = extracted.mileage
        doc.total_ht = extracted.total_ht
        doc.total_ttc = extracted.total_ttc
        doc.currency = extracted.currency
        doc.status = DocumentStatus.OCR_DONE
        doc.processed_at = datetime.utcnow()

        # Si c'est un CT détecté, ajuster le type
        if extracted.is_ct and doc.doc_type != DocumentType.CT:
            doc.doc_type = DocumentType.CT

        await self.session.commit()

        # Créer les opérations d'entretien détectées
        if extracted.work_lines:
            await self._create_operations_from_extraction(doc, extracted)

        # Si c'est un CT, créer une opération CT
        if extracted.is_ct:
            await self._create_ct_operation(doc, extracted)

        # Enregistrer le kilométrage
        if extracted.mileage:
            await self._record_mileage(doc, extracted.mileage)

        # Créer une alerte si zones illisibles
        if ocr.unreadable_zones:
            alert = Alert(
                vehicle_id=doc.vehicle_id,
                severity=AlertSeverity.WARNING,
                title=f"⚠️ Zones illisibles sur le document « {doc.original_filename} »",
                message=(
                    f"{len(ocr.unreadable_zones)} zone(s) n'ont pas pu être lues avec certitude "
                    f"(confiance < {settings.OCR_CONFIDENCE_THRESHOLD:.0%}). "
                    f"Confiance moyenne : {ocr.average_confidence:.0%}. "
                    f"Veuillez relire le document original et corriger les champs si nécessaire."
                ),
                category="ocr",
                related_document_id=doc.id,
            )
            self.session.add(alert)

        # Mettre à jour le kilométrage courant du véhicule
        vehicle = await self.session.get(Vehicle, doc.vehicle_id)
        if vehicle and extracted.mileage and extracted.mileage > vehicle.current_mileage:
            vehicle.current_mileage = extracted.mileage
            vehicle.updated_at = datetime.utcnow()

        await self.session.commit()
        await self.session.refresh(doc)

        # Recalculer le planning et les alertes d'entretien
        from app.services.maintenance_engine import MaintenanceEngine
        engine = MaintenanceEngine(self.session)
        await engine.generate_alerts(doc.vehicle_id)

        return doc

    async def _create_operations_from_extraction(self, doc: Document, extracted: ExtractedInvoice):
        """Crée des opérations d'entretien à partir des lignes de travaux détectées."""
        for wl in extracted.work_lines:
            categories = wl["categories"]
            # Choisir le type d'opération principal
            op_type = self._categories_to_op_type(categories)
            op = MaintenanceOperation(
                vehicle_id=doc.vehicle_id,
                document_id=doc.id,
                op_type=op_type,
                title=wl["line"][:200],
                description=f"Détecté automatiquement depuis le document « {doc.original_filename} »",
                total_cost=wl.get("amount"),
                performed_at=doc.document_date or date.today(),
                mileage=doc.mileage_at_service,
                garage=doc.garage_name,
                country=doc.garage_country,
            )
            self.session.add(op)

    async def _create_ct_operation(self, doc: Document, extracted: ExtractedInvoice):
        """Crée une opération de contrôle technique."""
        ct_result = extracted.ct_result
        next_due = None
        if doc.document_date:
            from app.services.maintenance_engine import MaintenanceEngine
            next_due = MaintenanceEngine._add_months(doc.document_date, settings.CT_INTERVAL_NEXT_MONTHS)
        op = MaintenanceOperation(
            vehicle_id=doc.vehicle_id,
            document_id=doc.id,
            op_type=OperationType.CT,
            title="Contrôle technique",
            description=f"Contrôle technique effectué chez {doc.garage_name or 'centre agréé'}",
            performed_at=doc.document_date or date.today(),
            mileage=doc.mileage_at_service,
            garage=doc.garage_name,
            country=doc.garage_country,
            is_ct=True,
            ct_result=ct_result,
            ct_next_due=next_due,
        )
        self.session.add(op)

    async def _record_mileage(self, doc: Document, mileage: int):
        record = MileageRecord(
            vehicle_id=doc.vehicle_id,
            mileage=mileage,
            recorded_at=doc.document_date or date.today(),
            source=f"document:{doc.original_filename}",
            document_id=doc.id,
        )
        self.session.add(record)

    @staticmethod
    def _categories_to_op_type(categories: list[str]) -> OperationType:
        priority = [
            "distribution", "vidange", "freins", "pneumatiques", "courroie_accessoires",
            "batterie", "refroidissement", "boite_vitesses", "suspension",
            "echappement", "electricite", "carrosserie", "embrayage", "climatisation", "ct",
        ]
        for cat in priority:
            if cat in categories:
                mapping = {
                    "distribution": OperationType.TIMING_BELT,
                    "vidange": OperationType.OIL_CHANGE,
                    "freins": OperationType.BRAKES,
                    "pneumatiques": OperationType.TIRES,
                    "courroie_accessoires": OperationType.ACCESSORY_BELT,
                    "batterie": OperationType.BATTERY,
                    "refroidissement": OperationType.COOLANT,
                    "boite_vitesses": OperationType.GEARBOX,
                    "suspension": OperationType.SUSPENSION,
                    "echappement": OperationType.EXHAUST,
                    "electricite": OperationType.ELECTRICAL,
                    "carrosserie": OperationType.BODY,
                    "embrayage": OperationType.OTHER,
                    "climatisation": OperationType.OTHER,
                    "ct": OperationType.CT,
                }
                if cat in ("filtre_huile", "filtre_gasoil", "filtre_air", "filtre_habitacle"):
                    return OperationType.FILTERS
                return mapping.get(cat, OperationType.OTHER)
        if any(c.startswith("filtre") for c in categories):
            return OperationType.FILTERS
        return OperationType.OTHER

    async def update_document_fields(self, document_id: int, fields: dict) -> Document:
        """Met à jour manuellement les champs d'un document (corrections post-OCR)."""
        doc = await self.session.get(Document, document_id)
        if not doc:
            raise ValueError("Document introuvable")
        allowed = {
            "doc_type", "document_date", "document_number", "garage_name",
            "garage_address", "garage_country", "garage_phone", "garage_vat",
            "mileage_at_service", "total_ht", "total_ttc", "currency", "notes",
        }
        for key, value in fields.items():
            if key in allowed:
                if key == "doc_type" and isinstance(value, str):
                    value = DocumentType(value)
                setattr(doc, key, value)
        doc.status = DocumentStatus.VERIFIED
        await self.session.commit()
        await self.session.refresh(doc)
        return doc

    async def list_documents(self, vehicle_id: Optional[int] = None) -> list[Document]:
        q = select(Document).order_by(Document.uploaded_at.desc())
        if vehicle_id:
            q = q.where(Document.vehicle_id == vehicle_id)
        res = await self.session.execute(q)
        return list(res.scalars().all())

    async def get_document(self, document_id: int) -> Optional[Document]:
        return await self.session.get(Document, document_id)

    async def delete_document(self, document_id: int) -> bool:
        doc = await self.session.get(Document, document_id)
        if not doc:
            return False
        # Supprimer les fichiers
        Path(doc.stored_path).unlink(missing_ok=True)
        if doc.ocr_text_path:
            Path(doc.ocr_text_path).unlink(missing_ok=True)
        await self.session.delete(doc)
        await self.session.commit()
        return True

    async def get_document_stats(self) -> dict:
        res = await self.session.execute(select(Document))
        docs = res.scalars().all()
        return {
            "total": len(docs),
            "by_type": {},
            "by_country": {},
            "total_spent": round(sum(d.total_ttc or 0 for d in docs), 2),
            "with_unreadable": sum(1 for d in docs if d.unreadable_zones),
        }
