import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes.predict import router as predict_router
from services import ml_service

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    loaded = ml_service.load_model()
    if loaded:
        logger.info("ML model loaded on startup.")
    else:
        logger.info("Running in heuristic-fallback mode (no model file found).")
    yield


app = FastAPI(
    title="Fake Job Detector API",
    description="FastAPI backend for detecting fraudulent job postings using ML.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    # Allow all origins for development. Restrict to specific domains in production.
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(predict_router)
