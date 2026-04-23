from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import audit, auth, health, imports, invites, media, notifications, persons, places, relationships, stories, tags, trash, trees, users
from app.config import settings

app = FastAPI(
    title="TellingTree",
    description="Open-source genealogy app focused on storytelling and memories",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
app.include_router(places.router, prefix="/api/v1")
app.include_router(places.tree_router, prefix="/api/v1")
app.include_router(trash.router, prefix="/api/v1")
app.include_router(audit.router, prefix="/api/v1")
app.include_router(invites.router, prefix="/api/v1")
app.include_router(notifications.router, prefix="/api/v1")
