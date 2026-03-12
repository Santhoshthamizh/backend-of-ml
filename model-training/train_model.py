import pandas as pd
import joblib

from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.pipeline import Pipeline
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix

df = pd.read_csv("../dataset/cleaned_fake_job_postings.csv")

X = df["combined_text"]
y = df["fraudulent"]

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

pipeline = Pipeline([
    ("tfidf", TfidfVectorizer(
        stop_words="english",
        max_features=5000,
        ngram_range=(1, 2),
    )),
    ("model", LogisticRegression(
        class_weight="balanced",
        max_iter=1000,
    )),
])

pipeline.fit(X_train, y_train)

y_pred = pipeline.predict(X_test)

print("Accuracy:", accuracy_score(y_test, y_pred))
print("\nConfusion Matrix:\n", confusion_matrix(y_test, y_pred))
print("\nClassification Report:\n", classification_report(y_test, y_pred))

cv_scores = cross_val_score(pipeline, X, y, cv=5, scoring="f1")
print("\nCross-validation F1 scores:", cv_scores)
print("Mean CV F1:", cv_scores.mean())

joblib.dump(pipeline, "../backend/model/fake_job_pipeline.pkl")
print("\nModel saved to ../backend/model/fake_job_pipeline.pkl")
