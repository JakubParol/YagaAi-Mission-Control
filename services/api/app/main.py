from fastapi import FastAPI

from app.config import settings
from app.shared.api.health import router as health_router

app = FastAPI(title=settings.app_name)
app.include_router(health_router)
