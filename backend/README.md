# Fake Job Detector — Backend

FastAPI backend for the Fake Job Detector application.

## Prerequisites

- Python 3.9+

## Installation

```bash
cd backend
pip install -r requirements.txt
```

## Running the Server

```bash
cd backend
uvicorn main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`.

Interactive API docs: `http://localhost:8000/docs`

## API Endpoints

### `POST /predict`

Analyze a job posting for fraud risk.

**Request body:**
```json
{
  "title": "Software Engineer",
  "description": "Join our team...",
  "company": "Acme Corp"
}
```

**Response:**
```json
{
  "fraud_probability": 25.0,
  "risk_level": "Safe",
  "trust_score": 75,
  "confidence": 80.5,
  "suspicious_words": 0,
  "missing_details": 0,
  "salary_pattern": "Normal",
  "domain_trust": 75,
  "company_verified": true,
  "similar_cases": 1,
  "timeline": [20, 25, 22, 28, 24, 26, 25],
  "explanation": "..."
}
```

### `GET /health`

Returns API status and whether the ML model is loaded.

**Response:**
```json
{
  "status": "healthy",
  "model_loaded": false,
  "version": "1.0.0"
}
```

### `POST /analyze-extension`

Same as `/predict` with an optional `source_url` field. Used by the Chrome extension.

## ML Model

Place the trained model file at `backend/model/fake_job_pipeline.pkl`.

If the model file is not present, the backend automatically falls back to a
heuristic-based analysis so the API remains functional without training.

See `model-training/README.md` for training instructions.
