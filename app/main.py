"""
Point d'entrée de l'application Carnet d'Entretien Automobile.
Citroën C2 1.4 HDi 2009 — Suivi professionnel avec OCR multilingue.

Lancement : uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
"""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings, BASE_DIR
from app.models.database import init_db
from app.api.routes import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db()
    yield
    # Shutdown (rien de particulier)


app = FastAPI(
    title=settings.APP_NAME,
    description=(
        "Application professionnelle de suivi d'entretien automobile. "
        "Citroën C2 1.4 HDi 2009. OCR multilingue (FR/EN/IT/DE/ES/PT/NL), "
        "gestion des factures et contrôles techniques, planification des révisions "
        "selon les préconisations constructeur, alertes de maintenance, "
        "et export du carnet d'entretien complet."
    ),
    version=settings.APP_VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# API REST
app.include_router(router, prefix="/api")

# Fichiers statiques
static_dir = BASE_DIR / "app" / "static"
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

# Templates
templates = Jinja2Templates(directory=str(BASE_DIR / "app" / "templates"))


# ------------------------------------------------------------------ pages web
@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse(request, "dashboard.html", {"request": request, "page": "dashboard"})


@app.get("/upload", response_class=HTMLResponse)
async def upload_page(request: Request):
    return templates.TemplateResponse(request, "upload.html", {"request": request, "page": "upload"})


@app.get("/documents", response_class=HTMLResponse)
async def documents_page(request: Request):
    return templates.TemplateResponse(request, "documents.html", {"request": request, "page": "documents"})


@app.get("/documents/{document_id}", response_class=HTMLResponse)
async def document_detail_page(request: Request, document_id: int):
    return templates.TemplateResponse(request, "document_detail.html", {
        "request": request, "page": "documents", "document_id": document_id,
    })


@app.get("/history", response_class=HTMLResponse)
async def history_page(request: Request):
    return templates.TemplateResponse(request, "history.html", {"request": request, "page": "history"})


@app.get("/schedule", response_class=HTMLResponse)
async def schedule_page(request: Request):
    return templates.TemplateResponse(request, "schedule.html", {"request": request, "page": "schedule"})


@app.get("/mileage", response_class=HTMLResponse)
async def mileage_page(request: Request):
    return templates.TemplateResponse(request, "mileage.html", {"request": request, "page": "mileage"})


@app.get("/settings", response_class=HTMLResponse)
async def settings_page(request: Request):
    return templates.TemplateResponse(request, "settings.html", {"request": request, "page": "settings"})


@app.get("/export", response_class=HTMLResponse)
async def export_page(request: Request):
    return templates.TemplateResponse(request, "export.html", {"request": request, "page": "export"})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=settings.DEBUG)
