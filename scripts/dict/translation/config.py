"""
Configuration module for Grok translation system.

Loads API keys and configures Grok-specific translation settings.
"""

import os
from pathlib import Path
from typing import Dict, Optional
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[3]

from scripts.dict.config import config as dict_config


# Load environment variables from .env file
ENV_FILE = dict_config.PROJECT_ROOT / '.env'

# Try to load .env file, but don't fail if it doesn't exist or can't be read
try:
    if ENV_FILE.exists() and ENV_FILE.is_file():
        load_dotenv(ENV_FILE, override=False)
except (PermissionError, IOError) as e:
    # If we can't read .env, continue - environment variables might be set elsewhere
    import warnings
    warnings.warn(
        f"Could not load .env file: {e}. Using environment variables if available.")

# Supported languages mapping: code -> full name
SUPPORTED_LANGUAGES: Dict[str, str] = {
    'es': 'Spanish',
    'pt': 'Portuguese',
    'fr': 'French',
    'de': 'German',
    'it': 'Italian',
    'ar': 'Arabic',
    'fa': 'Farsi',
}

# Default language
DEFAULT_LANGUAGE = 'es'

# Grok API Configuration
XAI_API_KEY = os.getenv('XAI_API_KEY')
GROK_MODEL = 'grok-4-1-fast-reasoning'  # Use the fast reasoning model

# Paths (use parent config module)
LEXICON_DIR = dict_config.LEXICON_DIR
ROOTS_FILE = LEXICON_DIR / 'roots.json'
WORDS_FILE = LEXICON_DIR / 'words.json'

# Translation settings
# Number of definitions per API call (recommended: 50-100)
DEFAULT_BATCH_SIZE = 50
MAX_BATCH_SIZE = 100     # Maximum allowed batch size
MIN_BATCH_SIZE = 1       # Minimum allowed batch size

# Rate limiting and retry settings
# Grok has higher rate limits than Gemini free tier
MAX_RETRIES = 3                # Number of retry attempts on failure
RETRY_BACKOFF_BASE = 2         # Exponential backoff: 2^retry seconds
# Seconds to wait between API calls (Grok has higher limits)
RATE_LIMIT_DELAY = 1.0

# Mismatch handling strategy
# Options: 'pad' (add empty strings), 'truncate' (remove extras), 'fail' (raise error)
MISMATCH_STRATEGY = 'pad'      # Default: pad with empty strings for robustness

# Validation settings
VALIDATE_TRANSLATIONS = True   # Validate translations before saving
STRICT_VALIDATION = False      # If True, fail on any empty translation

# Batch API settings (Grok doesn't use batch API, but kept for compatibility)
USE_BATCH_API = False          # Grok doesn't support batch API
BATCH_INLINE_MAX_SIZE = 1000   # Not used for Grok
BATCH_FILE_THRESHOLD = 1000    # Not used for Grok
BATCH_POLL_INTERVAL = 60       # Not used for Grok
BATCH_MAX_WAIT_HOURS = 24      # Not used for Grok

# API Configuration
GROK_BASE_URL = "https://api.x.ai/v1"
# 1 hour timeout (recommended for reasoning models, though grok-4 is fast)
GROK_TIMEOUT = 3600


def validate_language(lang_code: str) -> bool:
    """
    Validate if a language code is supported.

    Args:
        lang_code: Language code (e.g., 'es', 'pt')

    Returns:
        True if supported, False otherwise
    """
    return lang_code.lower() in SUPPORTED_LANGUAGES


def get_language_name(lang_code: str) -> Optional[str]:
    """
    Get the full name of a language from its code.

    Args:
        lang_code: Language code (e.g., 'es', 'pt')

    Returns:
        Full language name or None if not found
    """
    return SUPPORTED_LANGUAGES.get(lang_code.lower())


def validate_grok_api_key() -> bool:
    """
    Validate that the xAI API key is set.

    Returns:
        True if API key is set, False otherwise
    """
    return XAI_API_KEY is not None and len(XAI_API_KEY.strip()) > 0
