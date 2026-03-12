import re
from typing import List

SUSPICIOUS_WORDS: List[str] = [
    "urgent",
    "immediate",
    "guaranteed",
    "no experience",
    "work from home",
    "easy money",
    "unlimited",
    "free",
    "act now",
    "wire transfer",
    "western union",
    "money order",
    "upfront fee",
    "processing fee",
    "registration fee",
]

SALARY_SUSPICIOUS_PATTERNS: List[str] = [
    "guaranteed",
    "unlimited",
    "easy money",
]


def clean_text(text: str) -> str:
    """Lowercase and strip extra whitespace from text."""
    text = text.lower()
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def combine_text(title: str, company: str, description: str) -> str:
    """Combine job fields into a single text string for ML inference."""
    parts = [title.strip(), company.strip(), description.strip()]
    return " ".join(filter(None, parts))


def count_suspicious_words(text: str) -> int:
    """Return the number of suspicious phrases found in the text."""
    text_lower = text.lower()
    return sum(1 for word in SUSPICIOUS_WORDS if word in text_lower)


def count_missing_details(title: str, description: str, company: str) -> int:
    """Count how many expected details are absent from the job posting."""
    missing = 0
    if not title or len(title.strip()) < 5:
        missing += 1
    if not description or len(description.strip()) < 50:
        missing += 1
    if not company or len(company.strip()) < 2:
        missing += 1
    if description and not re.search(r"\d", description):
        missing += 1
    return missing


def detect_salary_pattern(text: str) -> str:
    """Return 'Suspicious' if the text contains suspicious salary language."""
    text_lower = text.lower()
    for pattern in SALARY_SUSPICIOUS_PATTERNS:
        if pattern in text_lower:
            return "Suspicious"
    return "Normal"
