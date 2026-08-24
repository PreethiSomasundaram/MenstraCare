"""
MenstraCare backend
--------------------
Loads the three pre-trained scikit-learn pipelines (Logistic Regression,
Random Forest, SVM) that were produced by MenstraCare_Training.ipynb and
exposes them through a small FastAPI service.

IMPORTANT:
The .joblib files in models/ already contain the full preprocessing
pipeline (median imputation + StandardScaler for numeric features, and a
most-frequent imputer + OneHotEncoder for any categorical features).
This backend NEVER re-implements or duplicates that preprocessing — it
simply hands a pandas DataFrame with the expected columns to
`pipeline.predict()` / `pipeline.predict_proba()` and lets the saved
pipeline do the rest, exactly like the notebook did.
"""

import json
from pathlib import Path
from typing import Dict

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

BASE_DIR = Path(__file__).resolve().parent
MODELS_DIR = BASE_DIR / "models"
FRONTEND_DIR = BASE_DIR.parent / "frontend"

# ---------------------------------------------------------------------------
# Load configuration / metadata produced during training
# ---------------------------------------------------------------------------


def _load_json(name: str):
    path = MODELS_DIR / name
    if not path.exists():
        raise FileNotFoundError(f"Required artifact missing: {path}")
    with open(path, "r") as f:
        return json.load(f)


feature_columns = _load_json("feature_columns.json")
feature_info = _load_json("feature_info.json")
target_info = _load_json("target_info.json")
deployment_config = _load_json("deployment_config.json")
model_performance = _load_json("model_performance.json")
training_artifacts = _load_json("training_artifacts.json")

CLASS_MAPPING: Dict[str, str] = target_info["class_mapping"]
MODEL_FILES: Dict[str, str] = deployment_config["models"]

MODEL_DISPLAY_NAMES = {
    "logistic_regression": "Logistic Regression",
    "random_forest": "Random Forest",
    "svm": "Support Vector Machine (SVM)",
}

# ---------------------------------------------------------------------------
# Load the trained pipelines ONCE at startup
# ---------------------------------------------------------------------------

loaded_models: Dict[str, object] = {}
load_errors: Dict[str, str] = {}

for model_key, filename in MODEL_FILES.items():
    model_path = MODELS_DIR / filename
    try:
        loaded_models[model_key] = joblib.load(model_path)
    except Exception as exc:  # pragma: no cover - defensive
        load_errors[model_key] = str(exc)

# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(title="MenstraCare API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PredictRequest(BaseModel):
    model: str
    features: Dict[str, float]


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "models_loaded": list(loaded_models.keys()),
        "load_errors": load_errors,
    }


@app.get("/api/model-info")
def model_info():
    """Everything the frontend needs to build the prediction form and the
    model selector, sourced directly from the training artifacts."""
    return {
        "project": deployment_config.get("project", "MenstraCare"),
        "target_column": target_info["target_column"],
        "class_mapping": CLASS_MAPPING,
        "models": [
            {
                "key": key,
                "label": MODEL_DISPLAY_NAMES.get(key, key),
                "available": key in loaded_models,
            }
            for key in MODEL_FILES.keys()
        ],
        "feature_columns": feature_columns,
        "numeric_features": feature_info.get("numeric_features", []),
        "categorical_features": feature_info.get("categorical_features", []),
    }


@app.get("/api/training-results")
def get_training_results():
    """Real metrics + visualization data computed during/derived from
    MenstraCare_Training.ipynb. Nothing here is fabricated at request time."""
    comparison = []
    for key, metrics in model_performance.items():
        comparison.append(
            {
                "key": key,
                "model": MODEL_DISPLAY_NAMES.get(key, key),
                **metrics,
            }
        )

    return {
        "comparison": comparison,
        "confusion_matrices": training_artifacts["confusion_matrices"],
        "roc_curves": training_artifacts["roc_curves"],
        "feature_importance": training_artifacts["feature_importance"],
        "dataset": training_artifacts["dataset"],
    }


@app.post("/api/predict")
def predict(payload: PredictRequest):
    model_key = payload.model
    if model_key not in MODEL_FILES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown model '{model_key}'. Valid options: {list(MODEL_FILES.keys())}",
        )

    if model_key not in loaded_models:
        raise HTTPException(
            status_code=500,
            detail=f"Model '{model_key}' failed to load: {load_errors.get(model_key, 'unknown error')}",
        )

    missing = [c for c in feature_columns if c not in payload.features]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Missing required feature(s): {missing}",
        )

    try:
        # Build a single-row DataFrame with columns in the exact order the
        # pipeline was trained on. The pipeline itself owns imputation +
        # scaling/encoding, so we pass raw values straight through.
        row = {col: payload.features[col] for col in feature_columns}
        X = pd.DataFrame([row], columns=feature_columns)

        pipeline = loaded_models[model_key]
        prediction = int(pipeline.predict(X)[0])
        probability = None
        if hasattr(pipeline, "predict_proba"):
            probability = float(pipeline.predict_proba(X)[0][1])

        return {
            "model": model_key,
            "model_label": MODEL_DISPLAY_NAMES.get(model_key, model_key),
            "prediction": prediction,
            "label": CLASS_MAPPING.get(str(prediction), str(prediction)),
            "probability": probability,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {exc}")


# ---------------------------------------------------------------------------
# Serve the static frontend (plain HTML/CSS/JS — no build step required)
# ---------------------------------------------------------------------------

if FRONTEND_DIR.exists():
    # Mounted at "/" (not "/static") so the frontend's relative paths
    # (css/styles.css, js/common.js, prediction.html, ...) resolve exactly
    # as written in the HTML. This is registered AFTER the API routes above,
    # so /api/... requests are matched by them first and never reach here.
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
