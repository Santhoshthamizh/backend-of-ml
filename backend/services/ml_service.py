import logging
import random
from pathlib import Path
from typing import List, Tuple

from utils.text_processor import (
    combine_text,
    count_suspicious_words,
    count_missing_details,
    detect_salary_pattern,
)

logger = logging.getLogger(__name__)

HIGH_RISK_THRESHOLD = 60
MEDIUM_RISK_THRESHOLD = 30
# Multiplier used to derive a deterministic seed from fraud_probability for timeline generation.
TIMELINE_SEED_MULTIPLIER = 137

MODEL_PATH = Path(__file__).parent.parent / "model" / "fake_job_pipeline.pkl"

_pipeline = None
_model_loaded = False


def load_model() -> bool:
    """Attempt to load the trained pipeline from disk. Returns True on success."""
    global _pipeline, _model_loaded
    if not MODEL_PATH.exists():
        logger.warning(
            "Model file not found at %s. Using heuristic fallback.", MODEL_PATH
        )
        _model_loaded = False
        return False
    try:
        import joblib  # noqa: PLC0415

        _pipeline = joblib.load(MODEL_PATH)
        _model_loaded = True
        logger.info("Model loaded successfully from %s", MODEL_PATH)
        return True
    except (OSError, ValueError, ImportError) as exc:  # pragma: no cover
        logger.error("Failed to load model: %s", exc)
        _model_loaded = False
        return False


def is_model_loaded() -> bool:
    return _model_loaded


def _ml_predict(combined_text: str) -> Tuple[float, float]:
    """Run the ML pipeline and return (fraud_probability_0_100, confidence_0_100)."""
    probs = _pipeline.predict_proba([combined_text])[0]
    fraud_prob = float(probs[1]) * 100
    confidence = float(max(probs)) * 100
    return fraud_prob, confidence


def _heuristic_predict(
    title: str, company: str, description: str, suspicious_count: int, missing_count: int
) -> Tuple[float, float]:
    """Simple rule-based fallback when no model is available."""
    score = 0.0
    score += min(suspicious_count * 8, 40)
    score += min(missing_count * 10, 30)
    combined = f"{title} {company} {description}".lower()
    if len(description.strip()) < 100:
        score += 10
    vague_phrases = ["competitive salary", "great opportunity", "be your own boss"]
    for phrase in vague_phrases:
        if phrase in combined:
            score += 5
    score = max(0.0, min(score, 95.0))
    confidence = 60.0 + (abs(score - 50) / 50) * 35
    return score, round(confidence, 1)


def _build_timeline(fraud_probability: float) -> List[int]:
    """Generate a 7-point timeline that trends toward fraud_probability."""
    base = fraud_probability
    random.seed(int(fraud_probability * TIMELINE_SEED_MULTIPLIER))
    points = []
    for i in range(7):
        noise = random.uniform(-15, 15)
        val = base + noise * (1 - i / 10)
        points.append(int(round(max(0.0, min(100.0, val)))))
    points[-1] = int(round(fraud_probability))
    return points


def _compute_domain_trust(company: str, fraud_probability: float) -> int:
    """Estimate domain trust inversely proportional to fraud probability."""
    base = max(5.0, 100.0 - fraud_probability)
    if not company or len(company.strip()) < 3:
        base = max(5.0, base - 20)
    return int(round(base))


def _is_company_verified(company: str, fraud_probability: float) -> bool:
    """Heuristic: companies are considered verified when fraud probability is low."""
    if not company or len(company.strip()) < 3:
        return False
    return fraud_probability < 40.0


def _estimate_similar_cases(fraud_probability: float) -> int:
    """Estimate similar fraud cases based on probability band."""
    if fraud_probability >= 70:
        return int(10 + fraud_probability / 10)
    elif fraud_probability >= 40:
        return int(3 + fraud_probability / 20)
    else:
        return max(0, int(fraud_probability / 20))


def _build_explanation(
    fraud_probability: float,
    risk_level: str,
    suspicious_count: int,
    missing_count: int,
    salary_pattern: str,
    domain_trust: int,
    company_verified: bool,
    model_used: bool,
) -> str:
    parts = []
    method = "ML model analysis" if model_used else "heuristic analysis"
    parts.append(
        f"Based on {method}, this job posting received a fraud probability of "
        f"{fraud_probability:.0f}% ({risk_level})."
    )
    if suspicious_count > 0:
        parts.append(
            f"The text contains {suspicious_count} suspicious phrase(s) commonly "
            "found in fraudulent postings."
        )
    if missing_count > 0:
        parts.append(
            f"{missing_count} expected detail(s) are absent (e.g., short title, "
            "vague description, missing company, or no numeric data)."
        )
    if salary_pattern == "Suspicious":
        parts.append(
            "Salary language such as 'guaranteed', 'unlimited', or 'easy money' "
            "was detected, which is a common red flag."
        )
    if domain_trust < 40:
        parts.append(
            f"The company domain trust score is low ({domain_trust}/100), "
            "suggesting limited online credibility."
        )
    if not company_verified:
        parts.append("The company could not be verified through known business registries.")
    if risk_level == "Safe":
        parts.append(
            "Overall, this posting appears legitimate based on the available signals."
        )
    return " ".join(parts)


def predict(title: str, description: str, company: str) -> dict:
    """Run prediction and return a dict matching PredictionResponse."""
    combined = combine_text(title, company, description)
    suspicious_count = count_suspicious_words(combined)
    missing_count = count_missing_details(title, description, company)
    salary_pattern = detect_salary_pattern(combined)

    if _model_loaded and _pipeline is not None:
        fraud_probability, confidence = _ml_predict(combined)
        model_used = True
    else:
        fraud_probability, confidence = _heuristic_predict(
            title, company, description, suspicious_count, missing_count
        )
        model_used = False

    fraud_probability = round(fraud_probability, 1)
    confidence = round(confidence, 1)

    if fraud_probability >= HIGH_RISK_THRESHOLD:
        risk_level = "High Risk"
    elif fraud_probability >= MEDIUM_RISK_THRESHOLD:
        risk_level = "Medium Risk"
    else:
        risk_level = "Safe"

    trust_score = int(round(100.0 - fraud_probability))
    domain_trust = _compute_domain_trust(company, fraud_probability)
    company_verified = _is_company_verified(company, fraud_probability)
    similar_cases = _estimate_similar_cases(fraud_probability)
    timeline = _build_timeline(fraud_probability)
    explanation = _build_explanation(
        fraud_probability,
        risk_level,
        suspicious_count,
        missing_count,
        salary_pattern,
        domain_trust,
        company_verified,
        model_used,
    )

    return {
        "fraud_probability": fraud_probability,
        "risk_level": risk_level,
        "trust_score": trust_score,
        "confidence": confidence,
        "suspicious_words": suspicious_count,
        "missing_details": missing_count,
        "salary_pattern": salary_pattern,
        "domain_trust": domain_trust,
        "company_verified": company_verified,
        "similar_cases": similar_cases,
        "timeline": timeline,
        "explanation": explanation,
    }
