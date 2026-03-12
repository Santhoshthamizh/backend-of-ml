import logging

from fastapi import APIRouter, HTTPException

from schemas.job_schema import (
    ExtensionInput,
    HealthResponse,
    JobInput,
    PredictionResponse,
)
from services import ml_service

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/predict", response_model=PredictionResponse)
async def predict_job(job: JobInput):
    """Analyze a job posting and return a fraud risk assessment."""
    try:
        result = ml_service.predict(
            title=job.title,
            description=job.description,
            company=job.company,
        )
        return PredictionResponse(**result)
    except Exception as exc:
        logger.exception("Prediction error: %s", exc)
        raise HTTPException(status_code=500, detail="Prediction failed") from exc


@router.post("/analyze-extension", response_model=PredictionResponse)
async def analyze_extension(job: ExtensionInput):
    """Chrome extension endpoint — same prediction logic with optional source URL."""
    try:
        result = ml_service.predict(
            title=job.title,
            description=job.description,
            company=job.company,
        )
        return PredictionResponse(**result)
    except Exception as exc:
        logger.exception("Extension analysis error: %s", exc)
        raise HTTPException(status_code=500, detail="Analysis failed") from exc


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """Return API health status and whether the ML model is loaded."""
    return HealthResponse(
        status="healthy",
        model_loaded=ml_service.is_model_loaded(),
        version="1.0.0",
    )
