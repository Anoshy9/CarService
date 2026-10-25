"""
API REST FastAPI — Carnet d'Entretien Automobile (Citroën C2 1.4 HDi 2009).
Endpoints : véhicule, upload documents, OCR, historique, tableau de bord,
planning entretien, alertes, export carnet d'entretien.
"""
from __future__ import annotations

import json
from datetime import date, datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, Query
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.database import (
    get_session, Vehicle, Document, DocumentType, DocumentStatus,
    MaintenanceOperation, MileageRecord, MaintenanceSchedule, Alert,
    OperationType, AlertSeverity,
)
from app.services.document_service import DocumentService
from app.services.maintenance_engine import MaintenanceEngine, C2_14HDI_SCHEDULE

router = APIRouter()


# ------------------------------------------------------------------ schemas
class VehicleUpdate(BaseModel):
    brand: Optional[str] = None
    model: Optional[str] = None
    engine: Optional[str] = None
    year: Optional[int] = None
    fuel: Optional[str] = None
    vin: Optional[str] = None
    plate: Optional[str] = None
    color: Optional[str] = None
    initial_mileage: Optional[int] = None
    current_mileage: Optional[int] = None
    first_registration: Optional[date] = None
    notes: Optional[str] = None


class MileageAdd(BaseModel):
    mileage: int
    recorded_at: date
    source: Optional[str] = "saisie_manuelle"
    notes: Optional[str] = None


class OperationAdd(BaseModel):
    op_type: str
    title: str
    description: Optional[str] = None
    performed_at: date
    mileage: Optional[int] = None
    garage: Optional[str] = None
    country: Optional[str] = None
    total_cost: Optional[float] = None
    is_ct: bool = False
    ct_result: Optional[str] = None


class DocumentFieldUpdate(BaseModel):
    fields: dict


class AlertDismiss(BaseModel):
    dismissed: bool = True


# ------------------------------------------------------------------ véhicule
@router.get("/vehicle")
async def get_vehicle(session: AsyncSession = Depends(get_session)):
    res = await session.execute(select(Vehicle).limit(1))
    vehicle = res.scalar_one_or_none()
    if not vehicle:
        # Créer le véhicule par défaut
        vehicle = Vehicle(
            brand=settings.VEHICLE_BRAND,
            model=settings.VEHICLE_MODEL,
            engine=settings.VEHICLE_ENGINE,
            year=settings.VEHICLE_YEAR,
            fuel=settings.VEHICLE_FUEL,
        )
        session.add(vehicle)
        await session.commit()
        await session.refresh(vehicle)
        # Initialiser le plan d'entretien
        engine = MaintenanceEngine(session)
        await engine.initialize_schedule(vehicle.id)
    return vehicle


@router.put("/vehicle")
async def update_vehicle(data: VehicleUpdate, session: AsyncSession = Depends(get_session)):
    res = await session.execute(select(Vehicle).limit(1))
    vehicle = res.scalar_one_or_none()
    if not vehicle:
        raise HTTPException(404, "Véhicule non trouvé")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(vehicle, key, value)
    vehicle.updated_at = datetime.utcnow()
    await session.commit()
    # Recalculer alertes si kilométrage ou date de 1ère MEC modifié
    engine = MaintenanceEngine(session)
    await engine.generate_alerts(vehicle.id)
    await session.refresh(vehicle)
    return vehicle


# ------------------------------------------------------------------ documents
@router.post("/documents/upload")
async def upload_document(
    file: UploadFile = File(...),
    doc_type: str = Form("facture"),
    auto_process: bool = Form(True),
    session: AsyncSession = Depends(get_session),
):
    """Upload un PDF ou une photo (facture, CT, devis...) et lance l'OCR."""
    content = await file.read()
    if len(content) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(413, "Fichier trop volumineux (max 50 Mo)")
    try:
        dtype = DocumentType(doc_type)
    except ValueError:
        dtype = DocumentType.OTHER

    service = DocumentService(session)
    doc = await service.save_upload(content, file.filename or "upload", dtype)

    result = {"document_id": doc.id, "filename": doc.original_filename, "status": doc.status.value}
    if auto_process:
        doc = await service.process_document(doc.id)
        result.update({
            "status": doc.status.value,
            "detected_language": doc.detected_language,
            "document_date": doc.document_date.isoformat() if doc.document_date else None,
            "garage_name": doc.garage_name,
            "garage_country": doc.garage_country,
            "mileage_at_service": doc.mileage_at_service,
            "total_ttc": doc.total_ttc,
            "currency": doc.currency,
            "ocr_confidence": round(doc.ocr_confidence, 3) if doc.ocr_confidence else None,
            "unreadable_zones_count": len(doc.unreadable_zones or []),
            "unreadable_zones": doc.unreadable_zones,
        })
    return result


@router.get("/documents")
async def list_documents(
    doc_type: Optional[str] = None,
    country: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
):
    q = select(Document).order_by(Document.uploaded_at.desc())
    if doc_type:
        try:
            q = q.where(Document.doc_type == DocumentType(doc_type))
        except ValueError:
            pass
    if country:
        q = q.where(Document.garage_country.ilike(f"%{country}%"))
    res = await session.execute(q)
    docs = res.scalars().all()
    return [
        {
            "id": d.id,
            "doc_type": d.doc_type.value,
            "status": d.status.value,
            "original_filename": d.original_filename,
            "uploaded_at": d.uploaded_at.isoformat() if d.uploaded_at else None,
            "document_date": d.document_date.isoformat() if d.document_date else None,
            "document_number": d.document_number,
            "garage_name": d.garage_name,
            "garage_country": d.garage_country,
            "mileage_at_service": d.mileage_at_service,
            "total_ttc": d.total_ttc,
            "currency": d.currency,
            "detected_language": d.detected_language,
            "ocr_confidence": round(d.ocr_confidence, 3) if d.ocr_confidence else None,
            "unreadable_zones_count": len(d.unreadable_zones or []),
        }
        for d in docs
    ]


@router.get("/documents/{document_id}")
async def get_document(document_id: int, session: AsyncSession = Depends(get_session)):
    doc = await session.get(Document, document_id)
    if not doc:
        raise HTTPException(404, "Document non trouvé")
    res = await session.execute(
        select(MaintenanceOperation).where(MaintenanceOperation.document_id == document_id)
    )
    ops = res.scalars().all()
    return {
        "id": doc.id,
        "doc_type": doc.doc_type.value,
        "status": doc.status.value,
        "original_filename": doc.original_filename,
        "stored_path": doc.stored_path,
        "uploaded_at": doc.uploaded_at.isoformat() if doc.uploaded_at else None,
        "processed_at": doc.processed_at.isoformat() if doc.processed_at else None,
        "document_date": doc.document_date.isoformat() if doc.document_date else None,
        "document_number": doc.document_number,
        "garage_name": doc.garage_name,
        "garage_address": doc.garage_address,
        "garage_country": doc.garage_country,
        "garage_phone": doc.garage_phone,
        "garage_vat": doc.garage_vat,
        "mileage_at_service": doc.mileage_at_service,
        "total_ht": doc.total_ht,
        "total_ttc": doc.total_ttc,
        "currency": doc.currency,
        "detected_language": doc.detected_language,
        "ocr_confidence": round(doc.ocr_confidence, 3) if doc.ocr_confidence else None,
        "unreadable_zones": doc.unreadable_zones,
        "ocr_raw_text": doc.ocr_raw_text,
        "notes": doc.notes,
        "operations": [
            {
                "id": o.id,
                "op_type": o.op_type.value,
                "title": o.title,
                "description": o.description,
                "performed_at": o.performed_at.isoformat(),
                "mileage": o.mileage,
                "total_cost": o.total_cost,
                "is_ct": o.is_ct,
                "ct_result": o.ct_result,
            }
            for o in ops
        ],
    }


@router.put("/documents/{document_id}")
async def update_document(document_id: int, data: DocumentFieldUpdate, session: AsyncSession = Depends(get_session)):
    service = DocumentService(session)
    doc = await service.update_document_fields(document_id, data.fields)
    return {"id": doc.id, "status": doc.status.value, "message": "Document mis à jour et vérifié"}


@router.post("/documents/{document_id}/reprocess")
async def reprocess_document(document_id: int, session: AsyncSession = Depends(get_session)):
    service = DocumentService(session)
    doc = await service.process_document(document_id)
    return {"id": doc.id, "status": doc.status.value, "message": "Document retraité"}


@router.delete("/documents/{document_id}")
async def delete_document(document_id: int, session: AsyncSession = Depends(get_session)):
    service = DocumentService(session)
    ok = await service.delete_document(document_id)
    if not ok:
        raise HTTPException(404, "Document non trouvé")
    return {"deleted": True}


@router.get("/documents/{document_id}/file")
async def get_document_file(document_id: int, session: AsyncSession = Depends(get_session)):
    doc = await session.get(Document, document_id)
    if not doc:
        raise HTTPException(404, "Document non trouvé")
    path = Path(doc.stored_path)
    if not path.exists():
        raise HTTPException(404, "Fichier introuvable sur le disque")
    media_type = "application/pdf" if path.suffix.lower() == ".pdf" else f"image/{path.suffix.lower().replace('.', '')}"
    return FileResponse(path, media_type=media_type, filename=doc.original_filename)


@router.get("/documents/{document_id}/ocr-text")
async def get_document_ocr_text(document_id: int, session: AsyncSession = Depends(get_session)):
    doc = await session.get(Document, document_id)
    if not doc:
        raise HTTPException(404, "Document non trouvé")
    return {"ocr_raw_text": doc.ocr_raw_text or "", "detected_language": doc.detected_language}


# ------------------------------------------------------------------ kilométrage
@router.get("/mileage")
async def list_mileage(session: AsyncSession = Depends(get_session)):
    res = await session.execute(
        select(MileageRecord).order_by(MileageRecord.recorded_at.desc())
    )
    records = res.scalars().all()
    return [
        {
            "id": r.id,
            "mileage": r.mileage,
            "recorded_at": r.recorded_at.isoformat(),
            "source": r.source,
            "notes": r.notes,
        }
        for r in records
    ]


@router.post("/mileage")
async def add_mileage(data: MileageAdd, session: AsyncSession = Depends(get_session)):
    res = await session.execute(select(Vehicle).limit(1))
    vehicle = res.scalar_one_or_none()
    if not vehicle:
        raise HTTPException(404, "Véhicule non trouvé")
    record = MileageRecord(
        vehicle_id=vehicle.id,
        mileage=data.mileage,
        recorded_at=data.recorded_at,
        source=data.source,
        notes=data.notes,
    )
    session.add(record)
    if data.mileage > vehicle.current_mileage:
        vehicle.current_mileage = data.mileage
        vehicle.updated_at = datetime.utcnow()
    await session.commit()
    # Recalculer alertes
    engine = MaintenanceEngine(session)
    await engine.generate_alerts(vehicle.id)
    await session.refresh(record)
    return {"id": record.id, "mileage": record.mileage, "recorded_at": record.recorded_at.isoformat()}


# ------------------------------------------------------------------ opérations
@router.get("/operations")
async def list_operations(
    op_type: Optional[str] = None,
    is_ct: Optional[bool] = None,
    session: AsyncSession = Depends(get_session),
):
    q = select(MaintenanceOperation).order_by(MaintenanceOperation.performed_at.desc())
    if op_type:
        try:
            q = q.where(MaintenanceOperation.op_type == OperationType(op_type))
        except ValueError:
            pass
    if is_ct is not None:
        q = q.where(MaintenanceOperation.is_ct == is_ct)
    res = await session.execute(q)
    ops = res.scalars().all()
    return [
        {
            "id": o.id,
            "op_type": o.op_type.value,
            "title": o.title,
            "description": o.description,
            "performed_at": o.performed_at.isoformat(),
            "mileage": o.mileage,
            "garage": o.garage,
            "country": o.country,
            "total_cost": o.total_cost,
            "is_ct": o.is_ct,
            "ct_result": o.ct_result,
            "ct_next_due": o.ct_next_due.isoformat() if o.ct_next_due else None,
            "document_id": o.document_id,
        }
        for o in ops
    ]


@router.post("/operations")
async def add_operation(data: OperationAdd, session: AsyncSession = Depends(get_session)):
    res = await session.execute(select(Vehicle).limit(1))
    vehicle = res.scalar_one_or_none()
    if not vehicle:
        raise HTTPException(404, "Véhicule non trouvé")
    try:
        op_type = OperationType(data.op_type)
    except ValueError:
        op_type = OperationType.OTHER
    op = MaintenanceOperation(
        vehicle_id=vehicle.id,
        op_type=op_type,
        title=data.title,
        description=data.description,
        performed_at=data.performed_at,
        mileage=data.mileage,
        garage=data.garage,
        country=data.country,
        total_cost=data.total_cost,
        is_ct=data.is_ct,
        ct_result=data.ct_result,
    )
    if data.is_ct and data.performed_at:
        op.ct_next_due = MaintenanceEngine._add_months(data.performed_at, settings.CT_INTERVAL_NEXT_MONTHS)
    session.add(op)
    await session.commit()
    # Recalculer planning + alertes
    engine = MaintenanceEngine(session)
    await engine.generate_alerts(vehicle.id)
    await session.refresh(op)
    return {"id": op.id, "title": op.title, "performed_at": op.performed_at.isoformat()}


# ------------------------------------------------------------------ planning
@router.get("/schedule")
async def get_schedule(session: AsyncSession = Depends(get_session)):
    res = await session.execute(select(Vehicle).limit(1))
    vehicle = res.scalar_one_or_none()
    if not vehicle:
        raise HTTPException(404, "Véhicule non trouvé")
    engine = MaintenanceEngine(session)
    items = await engine.recalculate_schedule(vehicle.id)
    current_km = await engine.get_latest_mileage(vehicle.id) or vehicle.current_mileage
    today = date.today()
    result = []
    for item in items:
        days_left = (item.next_due_date - today).days if item.next_due_date else None
        km_left = (item.next_due_mileage - current_km) if item.next_due_mileage else None
        status = "ok"
        if days_left is not None and days_left < 0 or (km_left is not None and km_left < 0):
            status = "overdue"
        elif (days_left is not None and days_left <= 60) or (km_left is not None and km_left <= 3000):
            status = "soon"
        result.append({
            "id": item.id,
            "op_type": item.op_type.value,
            "title": item.title,
            "description": item.description,
            "interval_km": item.interval_km,
            "interval_months": item.interval_months,
            "is_critical": item.is_critical,
            "last_done_at": item.last_done_at.isoformat() if item.last_done_at else None,
            "last_done_mileage": item.last_done_mileage,
            "next_due_date": item.next_due_date.isoformat() if item.next_due_date else None,
            "next_due_mileage": item.next_due_mileage,
            "days_left": days_left,
            "km_left": km_left,
            "status": status,
        })
    return result


@router.get("/schedule/specs")
async def get_schedule_specs():
    """Retourne les préconisations constructeur pour la C2 1.4 HDi."""
    return [
        {
            "op_type": s.op_type.value,
            "title": s.title,
            "description": s.description,
            "interval_km": s.interval_km,
            "interval_months": s.interval_months,
            "is_critical": s.is_critical,
            "severity": s.severity.value,
            "category": s.category,
        }
        for s in C2_14HDI_SCHEDULE
    ]


# ------------------------------------------------------------------ alertes
@router.get("/alerts")
async def list_alerts(
    dismissed: Optional[bool] = False,
    severity: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
):
    q = select(Alert).order_by(Alert.created_at.desc())
    if dismissed is not None:
        q = q.where(Alert.is_dismissed == dismissed)
    if severity:
        try:
            q = q.where(Alert.severity == AlertSeverity(severity))
        except ValueError:
            pass
    res = await session.execute(q)
    alerts = res.scalars().all()
    return [
        {
            "id": a.id,
            "severity": a.severity.value,
            "title": a.title,
            "message": a.message,
            "category": a.category,
            "is_dismissed": a.is_dismissed,
            "created_at": a.created_at.isoformat() if a.created_at else None,
            "related_document_id": a.related_document_id,
            "related_schedule_id": a.related_schedule_id,
        }
        for a in alerts
    ]


@router.post("/alerts/{alert_id}/dismiss")
async def dismiss_alert(alert_id: int, session: AsyncSession = Depends(get_session)):
    alert = await session.get(Alert, alert_id)
    if not alert:
        raise HTTPException(404, "Alerte non trouvée")
    alert.is_dismissed = True
    alert.dismissed_at = datetime.utcnow()
    await session.commit()
    return {"id": alert.id, "is_dismissed": True}


@router.post("/alerts/refresh")
async def refresh_alerts(session: AsyncSession = Depends(get_session)):
    res = await session.execute(select(Vehicle).limit(1))
    vehicle = res.scalar_one_or_none()
    if not vehicle:
        raise HTTPException(404, "Véhicule non trouvé")
    engine = MaintenanceEngine(session)
    alerts = await engine.generate_alerts(vehicle.id)
    return {"generated": len(alerts)}


# ------------------------------------------------------------------ dashboard
@router.get("/dashboard")
async def get_dashboard(session: AsyncSession = Depends(get_session)):
    res = await session.execute(select(Vehicle).limit(1))
    vehicle = res.scalar_one_or_none()
    if not vehicle:
        raise HTTPException(404, "Véhicule non trouvé")
    engine = MaintenanceEngine(session)
    return await engine.get_dashboard(vehicle.id)


# ------------------------------------------------------------------ stats
@router.get("/stats")
async def get_stats(session: AsyncSession = Depends(get_session)):
    res = await session.execute(select(Document))
    docs = res.scalars().all()
    by_country: dict[str, dict] = {}
    by_type: dict[str, int] = {}
    total = 0.0
    for d in docs:
        c = d.garage_country or "Inconnu"
        by_country.setdefault(c, {"count": 0, "total": 0.0})
        by_country[c]["count"] += 1
        by_country[c]["total"] += d.total_ttc or 0
        total += d.total_ttc or 0
        by_type[d.doc_type.value] = by_type.get(d.doc_type.value, 0) + 1

    res = await session.execute(select(func.sum(MaintenanceOperation.total_cost)))
    ops_total = res.scalar_one() or 0.0

    return {
        "documents": {"total": len(docs), "by_type": by_type, "by_country": by_country},
        "total_spent_documents": round(total, 2),
        "total_spent_operations": round(ops_total, 2),
        "total_spent": round(total + ops_total, 2),
        "documents_with_unreadable_zones": sum(1 for d in docs if d.unreadable_zones),
    }


# ------------------------------------------------------------------ export
@router.get("/export/carnet-entretien")
async def export_carnet(session: AsyncSession = Depends(get_session)):
    """Génère le carnet d'entretien complet en JSON (export structuré)."""
    res = await session.execute(select(Vehicle).limit(1))
    vehicle = res.scalar_one_or_none()
    if not vehicle:
        raise HTTPException(404, "Véhicule non trouvé")

    engine = MaintenanceEngine(session)
    dashboard = await engine.get_dashboard(vehicle.id)
    schedule = await engine.recalculate_schedule(vehicle.id)

    res = await session.execute(
        select(Document).order_by(Document.document_date.desc().nullslast(), Document.uploaded_at.desc())
    )
    docs = res.scalars().all()

    res = await session.execute(
        select(MaintenanceOperation).order_by(MaintenanceOperation.performed_at.desc())
    )
    ops = res.scalars().all()

    res = await session.execute(
        select(MileageRecord).order_by(MileageRecord.recorded_at.desc())
    )
    mileages = res.scalars().all()

    carnet = {
        "export_info": {
            "generated_at": datetime.utcnow().isoformat(),
            "app": settings.APP_NAME,
            "version": settings.APP_VERSION,
        },
        "vehicle": {
            "brand": vehicle.brand,
            "model": vehicle.model,
            "engine": vehicle.engine,
            "year": vehicle.year,
            "fuel": vehicle.fuel,
            "vin": vehicle.vin,
            "plate": vehicle.plate,
            "color": vehicle.color,
            "current_mileage": dashboard.get("current_mileage"),
            "km_per_year_estimate": dashboard.get("km_per_year_estimate"),
            "first_registration": vehicle.first_registration.isoformat() if vehicle.first_registration else None,
            "notes": vehicle.notes,
        },
        "maintenance_plan": [
            {
                "title": s.title,
                "description": s.description,
                "interval_km": s.interval_km,
                "interval_months": s.interval_months,
                "is_critical": s.is_critical,
                "next_due_date": s.next_due_date.isoformat() if s.next_due_date else None,
                "next_due_mileage": s.next_due_mileage,
                "last_done_at": s.last_done_at.isoformat() if s.last_done_at else None,
                "last_done_mileage": s.last_done_mileage,
            }
            for s in schedule
        ],
        "documents": [
            {
                "id": d.id,
                "type": d.doc_type.value,
                "filename": d.original_filename,
                "date": d.document_date.isoformat() if d.document_date else None,
                "number": d.document_number,
                "garage": d.garage_name,
                "country": d.garage_country,
                "mileage": d.mileage_at_service,
                "total_ttc": d.total_ttc,
                "currency": d.currency,
                "language": d.detected_language,
                "unreadable_zones": d.unreadable_zones,
            }
            for d in docs
        ],
        "operations": [
            {
                "id": o.id,
                "type": o.op_type.value,
                "title": o.title,
                "description": o.description,
                "date": o.performed_at.isoformat(),
                "mileage": o.mileage,
                "garage": o.garage,
                "country": o.country,
                "cost": o.total_cost,
                "is_ct": o.is_ct,
                "ct_result": o.ct_result,
            }
            for o in ops
        ],
        "mileage_history": [
            {
                "date": m.recorded_at.isoformat(),
                "mileage": m.mileage,
                "source": m.source,
            }
            for m in mileages
        ],
        "alerts": dashboard.get("alerts", []),
        "statistics": dashboard.get("stats", {}),
    }

    # Sauvegarder l'export
    export_path = settings.EXPORT_DIR / f"carnet_entretien_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.json"
    export_path.write_text(json.dumps(carnet, indent=2, ensure_ascii=False, default=str), encoding="utf-8")

    return FileResponse(
        export_path,
        media_type="application/json",
        filename=f"carnet_entretien_c2_{vehicle.plate or vehicle.vin or 'export'}.json",
    )


@router.get("/export/carnet-entretien/preview")
async def export_preview(session: AsyncSession = Depends(get_session)):
    """Aperçu JSON du carnet (sans téléchargement de fichier)."""
    res = await session.execute(select(Vehicle).limit(1))
    vehicle = res.scalar_one_or_none()
    if not vehicle:
        raise HTTPException(404, "Véhicule non trouvé")
    engine = MaintenanceEngine(session)
    return await engine.get_dashboard(vehicle.id)


# ------------------------------------------------------------------ config
@router.get("/config/languages")
async def get_supported_languages():
    return {
        "ocr_languages": settings.OCR_LANGUAGES,
        "confidence_threshold": settings.OCR_CONFIDENCE_THRESHOLD,
        "ocr_engine": settings.OCR_ENGINE,
        "allowed_extensions": sorted(settings.ALLOWED_EXTENSIONS),
    }


@router.get("/health")
async def health():
    return {"status": "ok", "app": settings.APP_NAME, "version": settings.APP_VERSION}
