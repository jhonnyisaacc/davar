"""
Configuration for per-word transliteration pipeline.
"""

import os
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).parent.parent.parent
ENV_FILE = PROJECT_ROOT / ".env"

try:
    if ENV_FILE.exists() and ENV_FILE.is_file():
        load_dotenv(ENV_FILE, override=False)
except (PermissionError, IOError):
    # Gracefully skip loading .env if file is inaccessible (e.g., in restricted environments)
    pass

DATA_DIR = PROJECT_ROOT / "data"
SCRIPTS_DIR = PROJECT_ROOT / "scripts" / "translit"
OUTPUT_DIR = DATA_DIR / "translit"
RULES_PATH = SCRIPTS_DIR / "RULES.md"

TANAKH_DIR = DATA_DIR / "oe"
BESORAH_DIR = DATA_DIR / "delitzsch" / "parsed"
DSS_BOOKS_DIR = DATA_DIR / "dss" / "books"
DSS_TRANSLIT_DIR = DATA_DIR / "translit" / "dss"
LEXICON_ROOTS_DIR = DATA_DIR / "dict" / "lexicon" / "roots"
LEXICON_WORDS_DIR = DATA_DIR / "dict" / "lexicon" / "words"

BATCH_TOKEN_BUDGET = 1500

PRICE_INPUT_PER_M = 0.20
PRICE_OUTPUT_PER_M = 0.50

SUPPORTED_TARGET_LANGS = ("en", "es")


def estimate_tokens(text: str) -> int:
    """
    Rough token estimate: 1 token per ~4 characters, minimum 1.
    """
    if not text:
        return 1
    return max(1, len(text) // 4)


def compute_cost(input_tokens: int, output_tokens: int) -> float:
    """
    Estimate cost using configured per-1M token pricing.
    """
    return (input_tokens / 1_000_000) * PRICE_INPUT_PER_M + (output_tokens / 1_000_000) * PRICE_OUTPUT_PER_M


def safe_int(value: Optional[str], default: int) -> int:
    try:
        return int(value) if value is not None else default
    except (TypeError, ValueError):
        return default


def safe_float(value: Optional[str], default: float) -> float:
    try:
        return float(value) if value is not None else default
    except (TypeError, ValueError):
        return default


XAI_API_KEY = os.getenv("XAI_API_KEY")
XAI_BASE_URL = "https://api.x.ai/v1"
XAI_VOCALIZATION_MODEL = os.getenv("XAI_VOCALIZATION_MODEL", "grok-4-1-fast-reasoning")
XAI_TIMEOUT_SECONDS = safe_int(os.getenv("XAI_TIMEOUT_SECONDS"), 300)
XAI_RATE_LIMIT_DELAY_SECONDS = safe_float(
    os.getenv("XAI_RATE_LIMIT_DELAY_SECONDS"),
    1.0,
)
XAI_MAX_RETRIES = safe_int(os.getenv("XAI_MAX_RETRIES"), 3)
XAI_RETRY_BACKOFF_BASE = safe_int(os.getenv("XAI_RETRY_BACKOFF_BASE"), 2)

DSS_XAI_MAX_CHARS_PER_REQUEST = safe_int(
    os.getenv("DSS_XAI_MAX_CHARS_PER_REQUEST"),
    12000,
)
DSS_VOCALIZATION_CACHE_PATH = DSS_TRANSLIT_DIR / "vocalization_cache.json"
