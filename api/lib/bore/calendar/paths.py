from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data"
STORE_DIR = DATA_DIR / "store"
OUTPUT_DIR = DATA_DIR / "output"
FIXTURES_DIR = DATA_DIR / "fixtures"
LOCALES_DIR = Path(__file__).resolve().parent / "localization" / "locales"
