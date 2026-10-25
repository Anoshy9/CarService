"""
Moteur de planification d'entretien — Citroën C2 1.4 HDi 70 (DV4TD) 2009.

Préconisations constructeur (carnet d'entretien Citroën) :
- Révision / vidange : tous les 30 000 km OU tous les 24 mois (1er atteint)
- Filtre à gasoil : tous les 60 000 km
- Filtre à air : tous les 60 000 km
- Filtre d'habitacle : tous les 30 000 km
- Courroie de distribution : tous les 240 000 km OU 10 ans (1er atteint) — CRITIQUE
- Courroie d'accessoires : tous les 180 000 km OU 10 ans
- Liquide de refroidissement : tous les 5 ans (60 mois)
- Liquide de frein : tous les 2 ans (24 mois)
- Huile de boîte de vitesses : contrôle tous les 60 000 km
- Contrôle technique : 1er à 4 ans, puis tous les 2 ans

Ce moteur calcule, à partir de l'historique, les prochaines échéances
en date ET en kilométrage, et génère les alertes associées.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.database import (
    Vehicle, MaintenanceOperation, MaintenanceSchedule, Document,
    MileageRecord, Alert, OperationType, AlertSeverity, DocumentType,
)


@dataclass
class ScheduleItemSpec:
    """Spécification d'un poste d'entretien préventif."""
    op_type: OperationType
    title: str
    description: str
    interval_km: Optional[int]
    interval_months: Optional[int]
    is_critical: bool = False
    severity: AlertSeverity = AlertSeverity.WARNING
    category: str = "entretien"


# Plan d'entretien constructeur C2 1.4 HDi
C2_14HDI_SCHEDULE: list[ScheduleItemSpec] = [
    ScheduleItemSpec(
        op_type=OperationType.OIL_CHANGE,
        title="Vidange moteur + filtre à huile",
        description="Vidange huile moteur 5W40/5W30 ACEA C2/C3 + remplacement filtre à huile. "
                    "Préconisation Citroën : tous les 30 000 km ou 24 mois.",
        interval_km=settings.SERVICE_INTERVAL_KM,
        interval_months=settings.SERVICE_INTERVAL_MONTHS,
        is_critical=False,
        severity=AlertSeverity.URGENT,
    ),
    ScheduleItemSpec(
        op_type=OperationType.FILTERS,
        title="Filtre à gasoil (filtre à carburant)",
        description="Remplacement du filtre à carburant. Moteur HDi sensible à la qualité du gasoil. "
                    "Tous les 60 000 km.",
        interval_km=settings.FUEL_FILTER_KM,
        interval_months=None,
        is_critical=False,
        severity=AlertSeverity.WARNING,
    ),
    ScheduleItemSpec(
        op_type=OperationType.FILTERS,
        title="Filtre à air",
        description="Remplacement du filtre à air moteur. Tous les 60 000 km.",
        interval_km=settings.AIR_FILTER_KM,
        interval_months=None,
        severity=AlertSeverity.WARNING,
    ),
    ScheduleItemSpec(
        op_type=OperationType.FILTERS,
        title="Filtre d'habitacle (filtre à pollen)",
        description="Remplacement du filtre d'habitacle. Tous les 30 000 km ou 24 mois.",
        interval_km=settings.CABIN_FILTER_KM,
        interval_months=settings.SERVICE_INTERVAL_MONTHS,
        severity=AlertSeverity.INFO,
    ),
    ScheduleItemSpec(
        op_type=OperationType.TIMING_BELT,
        title="Courroie de distribution + galets + pompe à eau",
        description="REMPLACEMENT IMPÉRATIF. La C2 1.4 HDi (DV4TD) a une distribution par courroie. "
                    "La rupture entraîne la destruction du moteur (interférence soupapes/pistons). "
                    "Préconisation : 240 000 km ou 10 ans, le premier atteint. "
                    "Remplacer impérativement galets tendeurs et pompe à eau en même temps.",
        interval_km=settings.TIMING_BELT_KM,
        interval_months=settings.TIMING_BELT_MONTHS,
        is_critical=True,
        severity=AlertSeverity.URGENT,
    ),
    ScheduleItemSpec(
        op_type=OperationType.ACCESSORY_BELT,
        title="Courroie d'accessoires (serpentine) + galets",
        description="Contrôle/remplacement de la courroie d'accessoires et des galets. "
                    "Tous les 180 000 km ou 10 ans.",
        interval_km=settings.ACCESSORY_BELT_KM,
        interval_months=settings.ACCESSORY_BELT_MONTHS,
        severity=AlertSeverity.WARNING,
    ),
    ScheduleItemSpec(
        op_type=OperationType.COOLANT,
        title="Liquide de refroidissement",
        description="Vidange et remplacement du liquide de refroidissement (Glaceol / antigel). "
                    "Tous les 5 ans (60 mois), quel que soit le kilométrage.",
        interval_km=None,
        interval_months=settings.COOLANT_MONTHS,
        severity=AlertSeverity.WARNING,
    ),
    ScheduleItemSpec(
        op_type=OperationType.BRAKES,
        title="Liquide de frein (DOT 4)",
        description="Vidange du liquide de frein. Hygroscopique : à remplacer tous les 2 ans (24 mois). "
                    "Contrôler disques et plaquettes à chaque révision.",
        interval_km=None,
        interval_months=settings.BRAKE_FLUID_MONTHS,
        severity=AlertSeverity.WARNING,
    ),
    ScheduleItemSpec(
        op_type=OperationType.GEARBOX,
        title="Huile de boîte de vitesses (contrôle)",
        description="Contrôle du niveau et de l'état de l'huile de boîte de vitesses. "
                    "Remplacement si nécessaire. Tous les 60 000 km.",
        interval_km=settings.GEARBOX_OIL_KM,
        interval_months=None,
        severity=AlertSeverity.INFO,
    ),
    ScheduleItemSpec(
        op_type=OperationType.CT,
        title="Contrôle technique",
        description="Contrôle technique obligatoire. 1er CT à 4 ans après la 1ère mise en circulation, "
                    "puis tous les 2 ans.",
        interval_km=None,
        interval_months=settings.CT_INTERVAL_NEXT_MONTHS,
        severity=AlertSeverity.URGENT,
        category="controle_technique",
    ),
]


class MaintenanceEngine:
    """Calcule les échéances et génère alertes + planning."""

    def __init__(self, session: AsyncSession):
        self.session = session

    # ------------------------------------------------------------------ helpers
    @staticmethod
    def _add_months(d: date, months: int) -> date:
        """Ajoute N mois à une date (gestion fin de mois)."""
        month = d.month - 1 + months
        year = d.year + month // 12
        month = month % 12 + 1
        # jour max du mois cible
        if month == 12:
            next_month = date(year + 1, 1, 1)
        else:
            next_month = date(year, month + 1, 1)
        last_day = (next_month - timedelta(days=1)).day
        return date(year, month, min(d.day, last_day))

    async def get_vehicle(self) -> Optional[Vehicle]:
        res = await self.session.execute(select(Vehicle).limit(1))
        return res.scalar_one_or_none()

    async def get_latest_mileage(self, vehicle_id: int) -> Optional[int]:
        res = await self.session.execute(
            select(MileageRecord.mileage)
            .where(MileageRecord.vehicle_id == vehicle_id)
            .order_by(MileageRecord.recorded_at.desc(), MileageRecord.id.desc())
            .limit(1)
        )
        row = res.scalar_one_or_none()
        if row is not None:
            return row
        res = await self.session.execute(select(Vehicle.current_mileage).where(Vehicle.id == vehicle_id))
        return res.scalar_one_or_none()

    # ------------------------------------------------------- init du planning
    async def initialize_schedule(self, vehicle_id: int) -> list[MaintenanceSchedule]:
        """Crée les postes du plan d'entretien s'ils n'existent pas encore."""
        res = await self.session.execute(
            select(MaintenanceSchedule).where(MaintenanceSchedule.vehicle_id == vehicle_id)
        )
        existing = {s.title: s for s in res.scalars().all()}
        created: list[MaintenanceSchedule] = []
        for spec in C2_14HDI_SCHEDULE:
            if spec.title in existing:
                continue
            item = MaintenanceSchedule(
                vehicle_id=vehicle_id,
                op_type=spec.op_type,
                title=spec.title,
                description=spec.description,
                interval_km=spec.interval_km,
                interval_months=spec.interval_months,
                severity_when_due=spec.severity,
                is_critical=spec.is_critical,
            )
            self.session.add(item)
            created.append(item)
        await self.session.commit()
        return created

    # ------------------------------------------------------- recalcul échéances
    async def recalculate_schedule(self, vehicle_id: int) -> list[MaintenanceSchedule]:
        """
        Recalcule les prochaines échéances de chaque poste du plan à partir
        de l'historique des opérations réalisées.
        """
        vehicle = await self.get_vehicle()
        if not vehicle:
            return []
        current_km = await self.get_latest_mileage(vehicle_id) or vehicle.current_mileage
        today = date.today()

        res = await self.session.execute(
            select(MaintenanceSchedule).where(MaintenanceSchedule.vehicle_id == vehicle_id)
        )
        items = res.scalars().all()

        # Récupérer toutes les opérations pour faire correspondre les catégories
        res = await self.session.execute(
            select(MaintenanceOperation)
            .where(MaintenanceOperation.vehicle_id == vehicle_id)
            .order_by(MaintenanceOperation.performed_at.desc())
        )
        ops = res.scalars().all()

        # Dernier CT
        last_ct = next((o for o in ops if o.is_ct), None)

        # Dernier kilométrage connu à une date donnée (pour les calculs temporels)
        res = await self.session.execute(
            select(MileageRecord)
            .where(MileageRecord.vehicle_id == vehicle_id)
            .order_by(MileageRecord.recorded_at.desc())
        )
        mileage_records = res.scalars().all()

        for item in items:
            last_op = self._find_last_matching_op(item, ops)
            last_date = last_op.performed_at if last_op else None
            last_km = last_op.mileage if last_op and last_op.mileage else None

            # Cas particulier CT : si pas de CT dans l'historique, échéance basée sur 1ère MEC
            if item.op_type == OperationType.CT and last_date is None:
                if vehicle.first_registration:
                    first_ct_due = self._add_months(vehicle.first_registration, settings.CT_INTERVAL_FIRST_MONTHS)
                    # si le 1er CT a déjà dû avoir lieu, le prochain est 2 ans après le dernier CT connu
                    # sinon on programme le 1er
                    item.last_done_at = None
                    item.next_due_date = first_ct_due
                    item.next_due_mileage = None
                    continue

            item.last_done_at = last_date
            item.last_done_mileage = last_km

            # Calcul échéance date
            next_date: Optional[date] = None
            base_date = last_date or vehicle.first_registration or today
            if item.interval_months:
                next_date = self._add_months(base_date, item.interval_months)

            # Calcul échéance kilométrage
            next_km: Optional[int] = None
            if item.interval_km and last_km is not None:
                next_km = last_km + item.interval_km
            elif item.interval_km and current_km:
                # si pas de réf 费, on extrapole depuis le kilométrage actuel
                # (on considère que le dernier service connu est à current_km)
                next_km = current_km + item.interval_km

            # Pour le CT sans historique : échéance = dernier CT + 24 mois, ou 1ère MEC + 48 mois
            if item.op_type == OperationType.CT:
                if last_date:
                    next_date = self._add_months(last_date, settings.CT_INTERVAL_NEXT_MONTHS)
                elif vehicle.first_registration:
                    next_date = self._add_months(vehicle.first_registration, settings.CT_INTERVAL_FIRST_MONTHS)

            item.next_due_date = next_date
            item.next_due_mileage = next_km

        await self.session.commit()
        return items

    def _find_last_matching_op(self, item: MaintenanceSchedule, ops: list[MaintenanceOperation]):
        """Trouve la dernière opération correspondant au poste du plan."""
        # Correspondance par type d'opération
        type_map = {
            OperationType.OIL_CHANGE: {"vidange", "huile", "oil"},
            OperationType.FILTERS: {"filtre", "filter", "filtro", "filtro", "filter"},
            OperationType.TIMING_BELT: {"distribution", "timing", "courroie distri", "cinghia"},
            OperationType.ACCESSORY_BELT: {"accessoire", "serpentine", "courroie access"},
            OperationType.COOLANT: {"refroidissement", "coolant", "liquide", "raffreddamento"},
            OperationType.BRAKES: {"frein", "brake", "freins", "brakes", "liquide frein"},
            OperationType.GEARBOX: {"boîte", "boite", "gearbox", "cambio", "transmission"},
            OperationType.CT: set(),  # géré via is_ct
        }
        if item.op_type == OperationType.CT:
            return next((o for o in ops if o.is_ct), None)

        keywords = type_map.get(item.op_type, set())
        # Recherche par op_type exact d'abord
        exact = next((o for o in ops if o.op_type == item.op_type), None)
        if exact:
            return exact
        # Sinon par mots-clés dans le titre
        for o in ops:
            title_low = (o.title or "").lower()
            desc_low = (o.description or "").lower()
            haystack = title_low + " " + desc_low
            if keywords and any(kw in haystack for kw in keywords):
                return o
        return None

    # ------------------------------------------------------------- alertes
    async def generate_alerts(self, vehicle_id: int) -> list[Alert]:
        """Génère les alertes pour les échéances proches/dépassées."""
        items = await self.recalculate_schedule(vehicle_id)
        vehicle = await self.get_vehicle()
        if not vehicle:
            return []
        current_km = await self.get_latest_mileage(vehicle_id) or vehicle.current_mileage
        today = date.today()

        # Supprimer les anciennes alertes non dismissées de catégorie entretien/ct pour regénérer
        res = await self.session.execute(
            select(Alert).where(
                Alert.vehicle_id == vehicle_id,
                Alert.category.in_(["entretien", "controle_technique"]),
                Alert.is_dismissed == False,
            )
        )
        old_alerts = res.scalars().all()
        for a in old_alerts:
            await self.session.delete(a)

        new_alerts: list[Alert] = []

        for item in items:
            due_date = item.next_due_date
            due_km = item.next_due_mileage

            # Alerte basée sur la date
            date_alert = self._evaluate_date_alert(item, due_date, today)
            if date_alert:
                new_alerts.append(date_alert)

            # Alerte basée sur le kilométrage
            if due_km and current_km:
                km_alert = self._evaluate_km_alert(item, due_km, current_km)
                if km_alert:
                    new_alerts.append(km_alert)

        for alert in new_alerts:
            self.session.add(alert)
        await self.session.commit()
        return new_alerts

    def _evaluate_date_alert(self, item: MaintenanceSchedule, due_date: Optional[date], today: date) -> Optional[Alert]:
        if not due_date:
            return None
        days_left = (due_date - today).days
        if days_left < 0:
            sev = AlertSeverity.OVERDUE
            msg = f"EN RETARD de {-days_left} jour(s). Échéance dépassée le {due_date.strftime('%d/%m/%Y')}."
        elif days_left <= 30:
            sev = AlertSeverity.URGENT
            msg = f"Échéance dans {days_left} jour(s) (le {due_date.strftime('%d/%m/%Y')})."
        elif days_left <= 90:
            sev = AlertSeverity.WARNING
            msg = f"Échéance à prévoir dans {days_left} jour(s) (le {due_date.strftime('%d/%m/%Y')})."
        else:
            return None

        prefix = "🔴 CRITIQUE — " if item.is_critical else ""
        return Alert(
            vehicle_id=item.vehicle_id,
            severity=sev,
            title=f"{prefix}{item.title}",
            message=f"{msg} {item.description}",
            category=item.op_type.value if item.op_type != OperationType.CT else "controle_technique",
            related_schedule_id=item.id,
        )

    def _evaluate_km_alert(self, item: MaintenanceSchedule, due_km: int, current_km: int) -> Optional[Alert]:
        km_left = due_km - current_km
        if km_left < 0:
            sev = AlertSeverity.OVERDUE
            msg = f"Kilométrage dépassé de {-km_left:,} km".replace(",", " ")
            msg += f" (échéance : {due_km:,} km, actuel : {current_km:,} km)".replace(",", " ")
        elif km_left <= 1000:
            sev = AlertSeverity.URGENT
            msg = f"{km_left:,} km restant(s) avant échéance".replace(",", " ")
            msg += f" ({due_km:,} km)".replace(",", " ")
        elif km_left <= 5000:
            sev = AlertSeverity.WARNING
            msg = f"{km_left:,} km restant(s) avant échéance".replace(",", " ")
            msg += f" ({due_km:,} km)".replace(",", " ")
        else:
            return None
        prefix = "🔴 CRITIQUE — " if item.is_critical else ""
        return Alert(
            vehicle_id=item.vehicle_id,
            severity=sev,
            title=f"{prefix}{item.title} (kilométrage)",
            message=msg,
            category=item.op_type.value,
            related_schedule_id=item.id,
        )

    # ------------------------------------------------------- tableau de bord
    async def get_dashboard(self, vehicle_id: int) -> dict:
        """Données agrégées pour le tableau de bord."""
        vehicle = await self.get_vehicle()
        if not vehicle:
            return {}
        current_km = await self.get_latest_mileage(vehicle_id) or vehicle.current_mileage
        today = date.today()

        items = await self.recalculate_schedule(vehicle_id)

        upcoming: list[dict] = []
        overdue: list[dict] = []
        ok: list[dict] = []

        for item in items:
            entry = {
                "id": item.id,
                "title": item.title,
                "description": item.description,
                "is_critical": item.is_critical,
                "last_done_at": item.last_done_at.isoformat() if item.last_done_at else None,
                "last_done_mileage": item.last_done_mileage,
                "next_due_date": item.next_due_date.isoformat() if item.next_due_date else None,
                "next_due_mileage": item.next_due_mileage,
                "interval_km": item.interval_km,
                "interval_months": item.interval_months,
            }
            # statut
            date_status = "ok"
            km_status = "ok"
            if item.next_due_date:
                days_left = (item.next_due_date - today).days
                if days_left < 0:
                    date_status = "overdue"
                elif days_left <= 60:
                    date_status = "soon"
            if item.next_due_mileage and current_km:
                km_left = item.next_due_mileage - current_km
                if km_left < 0:
                    km_status = "overdue"
                elif km_left <= 3000:
                    km_status = "soon"
            worst = "ok"
            if "overdue" in (date_status, km_status):
                worst = "overdue"
            elif "soon" in (date_status, km_status):
                worst = "soon"
            entry["status"] = worst
            entry["days_left"] = (item.next_due_date - today).days if item.next_due_date else None
            entry["km_left"] = (item.next_due_mileage - current_km) if item.next_due_mileage else None

            if worst == "overdue":
                overdue.append(entry)
            elif worst == "soon":
                upcoming.append(entry)
            else:
                ok.append(entry)

        # Alertes actives
        res = await self.session.execute(
            select(Alert).where(
                Alert.vehicle_id == vehicle_id,
                Alert.is_dismissed == False,
            ).order_by(Alert.created_at.desc())
        )
        alerts = res.scalars().all()

        # Stats documents
        res = await self.session.execute(
            select(Document).where(Document.vehicle_id == vehicle_id)
        )
        docs = res.scalars().all()
        total_spent = sum(d.total_ttc or 0 for d in docs)

        res = await self.session.execute(
            select(MaintenanceOperation).where(MaintenanceOperation.vehicle_id == vehicle_id)
        )
        ops_count = len(res.scalars().all())

        res = await self.session.execute(
            select(func.count(MileageRecord.id)).where(MileageRecord.vehicle_id == vehicle_id)
        )
        mileage_records_count = res.scalar_one()

        # Dernier CT
        res = await self.session.execute(
            select(MaintenanceOperation)
            .where(MaintenanceOperation.vehicle_id == vehicle_id, MaintenanceOperation.is_ct == True)
            .order_by(MaintenanceOperation.performed_at.desc())
            .limit(1)
        )
        last_ct = res.scalar_one_or_none()
        next_ct_date = None
        if last_ct:
            next_ct_date = self._add_months(last_ct.performed_at, settings.CT_INTERVAL_NEXT_MONTHS)
        elif vehicle.first_registration:
            next_ct_date = self._add_months(vehicle.first_registration, settings.CT_INTERVAL_FIRST_MONTHS)

        # Kilométrage estimé par an (basé sur les 2 derniers relevés)
        res = await self.session.execute(
            select(MileageRecord)
            .where(MileageRecord.vehicle_id == vehicle_id)
            .order_by(MileageRecord.recorded_at.desc())
            .limit(2)
        )
        last_two = res.scalars().all()
        km_per_year = None
        if len(last_two) == 2:
            a, b = last_two[0], last_two[1]
            days = (a.recorded_at - b.recorded_at).days
            if days > 30:
                km_per_year = round((a.mileage - b.mileage) / days * 365)

        return {
            "vehicle": {
                "id": vehicle.id,
                "brand": vehicle.brand,
                "model": vehicle.model,
                "engine": vehicle.engine,
                "year": vehicle.year,
                "fuel": vehicle.fuel,
                "vin": vehicle.vin,
                "plate": vehicle.plate,
                "current_mileage": current_km,
                "first_registration": vehicle.first_registration.isoformat() if vehicle.first_registration else None,
            },
            "current_mileage": current_km,
            "km_per_year_estimate": km_per_year,
            "upcoming": sorted(upcoming, key=lambda x: (x["days_left"] if x["days_left"] is not None else 9999)),
            "overdue": sorted(overdue, key=lambda x: (x["days_left"] if x["days_left"] is not None else -9999)),
            "ok": ok,
            "alerts": [
                {
                    "id": a.id,
                    "severity": a.severity.value,
                    "title": a.title,
                    "message": a.message,
                    "category": a.category,
                    "created_at": a.created_at.isoformat() if a.created_at else None,
                }
                for a in alerts
            ],
            "stats": {
                "documents_count": len(docs),
                "operations_count": ops_count,
                "mileage_records_count": mileage_records_count,
                "total_spent": round(total_spent, 2),
                "documents_with_unreadable_zones": sum(1 for d in docs if d.unreadable_zones),
            },
            "last_ct": {
                "date": last_ct.performed_at.isoformat() if last_ct else None,
                "result": last_ct.ct_result if last_ct else None,
                "garage": last_ct.garage if last_ct else None,
                "next_due": next_ct_date.isoformat() if next_ct_date else None,
            } if last_ct or next_ct_date else None,
        }
