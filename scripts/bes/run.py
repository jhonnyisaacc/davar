#!/usr/bin/env python3
"""
Orchestrator script for BES processing pipeline
Downloads USFX XML, parses to JSON, and validates output
"""

import logging


from .download import download_bes_usfx
from .parse_usfx import parse_usfx_file
from .validate import validate_bes_output, print_validation_report

logger = logging.getLogger(__name__)

def run_bes_pipeline() -> bool:
    """
    Run the complete BES processing pipeline.

    Returns:
        True if all steps succeed, False otherwise
    """
    logger.info("Starting BES processing pipeline")

    # Step 1: Download USFX XML
    logger.info("Step 1: Downloading BES USFX XML...")
    if not download_bes_usfx():
        logger.error("Failed to download BES USFX XML")
        return False

    # Step 2: Parse USFX to JSON
    logger.info("Step 2: Parsing USFX XML to JSON...")
    if not parse_usfx_file():
        logger.error("Failed to parse USFX XML")
        return False

    # Step 3: Validate output
    logger.info("Step 3: Validating JSON output...")
    is_valid, errors = validate_bes_output()
    print_validation_report(is_valid, errors)

    if not is_valid:
        logger.error("Validation failed")
        return False

    logger.info("✅ BES processing pipeline completed successfully!")
    return True

if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s'
    )

    success = run_bes_pipeline()
    exit(0 if success else 1)