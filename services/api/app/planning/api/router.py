from fastapi import APIRouter

from app.planning.api.agents import router as agents_router
from app.planning.api.backlogs import router as backlogs_router
from app.planning.api.epics import router as epics_router
from app.planning.api.labels import router as labels_router
from app.planning.api.projects import router as projects_router
from app.planning.api.stories import router as stories_router

router = APIRouter()

router.include_router(projects_router)
router.include_router(epics_router)
router.include_router(stories_router)
router.include_router(agents_router)
router.include_router(labels_router)
router.include_router(backlogs_router)
