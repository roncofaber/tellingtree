import logging
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1 import admin, audit, auth, health, imports, invites, media, notifications, persons, places, relationships, stories, tags, trash, trees, users
from app.config import settings

_is_prod = settings.environment == "production"

# ── Logging setup ─────────────────────────────────────────────────────────────

def _configure_logging() -> None:
    log_dir = Path("logs")
    log_dir.mkdir(exist_ok=True)

    fmt = logging.Formatter(
        "%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    file_handler = RotatingFileHandler(
        log_dir / "api.log",
        maxBytes=10 * 1024 * 1024,  # 10 MB per file
        backupCount=3,
        encoding="utf-8",
    )
    file_handler.setFormatter(fmt)
    file_handler.setLevel(logging.DEBUG)

    # Attach to the root logger and to uvicorn's loggers
    for name in ("", "uvicorn", "uvicorn.error", "uvicorn.access", "sqlalchemy.engine"):
        lg = logging.getLogger(name)
        lg.addHandler(file_handler)

    logging.getLogger("sqlalchemy.engine").setLevel(
        logging.INFO if not _is_prod else logging.WARNING
    )

_configure_logging()
logger = logging.getLogger("tellingtree")

app = FastAPI(
    title="TellingTree",
    description="Open-source genealogy app focused on storytelling and memories",
    version="0.1.0",
    docs_url=None if _is_prod else "/docs",
    redoc_url=None if _is_prod else "/redoc",
    openapi_url=None if _is_prod else "/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def _unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})

app.include_router(health.router, prefix="/api/v1")
app.include_router(auth.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(trees.router, prefix="/api/v1")
app.include_router(persons.router, prefix="/api/v1")
app.include_router(relationships.relationship_types_router, prefix="/api/v1")
app.include_router(relationships.router, prefix="/api/v1")
app.include_router(relationships.person_relationships_router, prefix="/api/v1")
app.include_router(stories.router, prefix="/api/v1")
app.include_router(media.router, prefix="/api/v1")
app.include_router(tags.router, prefix="/api/v1")
app.include_router(imports.router, prefix="/api/v1")
app.include_router(imports.export_router, prefix="/api/v1")
app.include_router(imports.import_router, prefix="/api/v1")
app.include_router(places.router, prefix="/api/v1")
app.include_router(places.tree_router, prefix="/api/v1")
app.include_router(trash.router, prefix="/api/v1")
app.include_router(audit.router, prefix="/api/v1")
app.include_router(invites.router, prefix="/api/v1")
app.include_router(notifications.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")
