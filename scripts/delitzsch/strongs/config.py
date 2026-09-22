"""
Configuration module for Delitzsch Strong's assignment system.

Loads API keys and configures Grok-specific settings for assigning
Strong's numbers to Hebrew words in Delitzsch NT translation.
"""

import os
import sys
from pathlib import Path
from typing import List
from dotenv import load_dotenv

# Add parent directory to path for config import
sys.path.insert(0, str(Path(__file__).parent.parent))

# Import from parent config module
from scripts.dict.config import Config
config = Config()

# Load environment variables from .env file
ENV_FILE = config.PROJECT_ROOT / '.env'

# Try to load .env file, but don't fail if it doesn't exist or can't be read
try:
    if ENV_FILE.exists() and ENV_FILE.is_file():
        load_dotenv(ENV_FILE, override=False)
except (PermissionError, IOError) as e:
    # If we can't read .env, continue - environment variables might be set elsewhere
    import warnings
    warnings.warn(f"Could not load .env file: {e}. Using environment variables if available.")

# Grok API Configuration
XAI_API_KEY = os.getenv('XAI_API_KEY')
GROK_MODEL = 'grok-4-1-fast-non-reasoning'  # Non-reasoning model: faster for mechanical lexicographic tasks

# Paths
PARSED_DIR = config.DATA_DIR / "delitzsch" / "parsed"
OUTPUT_DIR = PARSED_DIR / "strongs"

# All 27 NT books in Delitzsch translation
ALL_BOOKS = [
    'matthew', 'mark', 'luke', 'john', 'acts',
    'romans', 'corinthians1', 'corinthians2', 'galatians',
    'ephesians', 'philippians', 'colossians', 'thessalonians1',
    'thessalonians2', 'timothy1', 'timothy2', 'titus',
    'philemon', 'hebrews', 'james', 'peter1', 'peter2',
    'john1', 'john2', 'john3', 'jude', 'revelation'
]

# Assignment settings
DEFAULT_BATCH_SIZE = 30   # Small batches improve per-word accuracy
MAX_BATCH_SIZE = 500      # Maximum allowed batch size
MIN_BATCH_SIZE = 1        # Minimum allowed batch size

# Rate limiting and retry settings
# Grok has higher rate limits than Gemini free tier
MAX_RETRIES = 3                # Number of retry attempts on failure
RETRY_BACKOFF_BASE = 2         # Exponential backoff: 2^retry seconds
RATE_LIMIT_DELAY = 0.2         # Seconds to wait between API calls
MAX_CONCURRENT = 10            # Maximum concurrent verse API calls

# API Configuration
GROK_BASE_URL = "https://api.x.ai/v1"
GROK_TIMEOUT = 120             # 2 minute timeout (sufficient for fast non-reasoning model)

# Validation settings
VALIDATE_ASSIGNMENTS = True    # Validate assignments before saving
STRICT_VALIDATION = False      # If True, fail on any invalid assignment

# Output settings
CREATE_BACKUPS = True          # Create backups before overwriting output files


def validate_grok_api_key() -> bool:
    """
    Validate that the xAI API key is set.

    Returns:
        True if API key is set, False otherwise
    """
    return XAI_API_KEY is not None and len(XAI_API_KEY.strip()) > 0


def get_language_name(lang_code: str) -> str:
    """
    Get the full name of a language from its code.

    Args:
        lang_code: Language code (e.g., 'es', 'pt')

    Returns:
        Full language name or the code if not found
    """
    # For this module, we only deal with English and Spanish names
    names = {
        'en': 'English',
        'es': 'Spanish',
    }
    return names.get(lang_code.lower(), lang_code)