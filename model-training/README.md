# Model Training

Train the Logistic Regression / TF-IDF pipeline used by the Fake Job Detector backend.

## Dataset

Place your dataset at:

```
dataset/cleaned_fake_job_postings.csv
```

The CSV must contain at least these two columns:

| Column | Description |
|---|---|
| `combined_text` | Pre-processed text combining job title, company, description, etc. |
| `fraudulent` | Binary label: `1` = fraudulent, `0` = real |

## Running Training

```bash
cd model-training
python train_model.py
```

The script will:
1. Load the dataset from `../dataset/cleaned_fake_job_postings.csv`
2. Split into train/test sets (80/20, stratified)
3. Train a TF-IDF + Logistic Regression pipeline
4. Print accuracy, confusion matrix, classification report, and 5-fold CV F1 scores
5. Save the trained model to `../backend/model/fake_job_pipeline.pkl`

## After Training

Restart the backend server — it will automatically detect and load the new model file:

```bash
cd backend
uvicorn main:app --reload --port 8000
```
