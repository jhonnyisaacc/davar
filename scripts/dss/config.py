#!/usr/bin/env python3
"""
Configuration and constants for DSS parser
"""

from pathlib import Path

from scripts.books import dss_book_names

# Paths
SCRIPT_DIR = Path(__file__).parent
REPO_BASE = SCRIPT_DIR.parent.parent / "data/dss/deadseainsights/data"
DSS_DIR = REPO_BASE / "DSS_TC"
WLC_DIR = REPO_BASE / "tanach/Books"
NOTES_FILE = DSS_DIR / "DSS_TC_Notes.xml"
OUTPUT_DIR = SCRIPT_DIR.parent.parent / "data/dss/dssi"

# XML file stem -> English display name. Names load from the book registry.
BOOK_NAMES = dss_book_names()

# Metadata
SOURCE_URL = 'https://codeberg.org/dandeto/deadseainsights'
LICENSE = 'CC BY-SA 4.0'
