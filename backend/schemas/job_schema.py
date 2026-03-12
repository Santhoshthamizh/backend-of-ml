from typing import List, Optional
from pydantic import BaseModel, Field


class JobInput(BaseModel):
    title: str = Field(..., min_length=1, description="Job title")
    description: str = Field(..., min_length=1, description="Job description")
    company: str = Field(default="", description="Company name")


class ExtensionInput(JobInput):
    source_url: Optional[str] = Field(None, description="URL where the job was found")


class PredictionResponse(BaseModel):
    fraud_probability: float = Field(..., ge=0, le=100)
    risk_level: str
    trust_score: int = Field(..., ge=0, le=100)
    confidence: float = Field(..., ge=0, le=100)
    suspicious_words: int = Field(..., ge=0)
    missing_details: int = Field(..., ge=0)
    salary_pattern: str
    domain_trust: int = Field(..., ge=0, le=100)
    company_verified: bool
    similar_cases: int = Field(..., ge=0)
    timeline: List[int] = Field(..., min_length=7, max_length=7)
    explanation: str = Field(..., min_length=1)


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    version: str
