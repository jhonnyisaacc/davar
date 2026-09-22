#!/usr/bin/env python3
"""
Fix mismatches utility script.

Scans lexicon files for entries with missing or empty translations and fixes them
by re-translating in a single batch.
"""

import argparse
import logging
import sys
from pathlib import Path
from typing import Dict, List, NamedTuple


from ..utils import load_json, save_json, create_backup, ProgressTracker

logger = logging.getLogger(__name__)


class DefinitionRef(NamedTuple):
    """Reference to a definition that needs translation."""
    file_type: str  # 'roots' or 'words'
    entry_key: str
    definition_idx: int
    text_en: str
    batch_key: str


def parse_args():
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description='Fix entries with missing or empty translations by re-translating them in batch',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )

    parser.add_argument(
        '--file',
        choices=['roots', 'words'],
        help='Process specific file (roots.json or words.json). If not specified, processes both.'
    )

    parser.add_argument(
        '--language',
        '--lang',
        dest='language',
        default='es',
        help='Target language code (default: es)'
    )

    parser.add_argument(
        '--batch-size',
        type=int,
        default=500,
        help='Number of definitions per API call (default: 500)'
    )

    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Preview changes without saving to files'
    )

    parser.add_argument(
        '--verbose',
        '-v',
        action='store_true',
        help='Enable verbose logging'
    )

    return parser.parse_args()


def main():
    """Main entry point."""
    args = parse_args()

    # Set up logging
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )

    # Validate API key
    try:
        from .config import validate_grok_api_key
        if not validate_grok_api_key():
            logger.error(
                "XAI_API_KEY not found in environment variables.\n"
                "Please create a .env file in the project root with:\n"
                "XAI_API_KEY=your_api_key_here\n"
                "Get your API key from: https://console.x.ai/team/default/api-keys"
            )
            sys.exit(1)
    except ImportError as e:
        logger.error(f"Failed to import Grok configuration: {e}")
        sys.exit(1)

    # Validate language
    from .config import validate_language, SUPPORTED_LANGUAGES
    if not validate_language(args.language):
        logger.error(
            f"Unsupported language: {args.language}\n"
            f"Supported languages: {', '.join(SUPPORTED_LANGUAGES.keys())}"
        )
        sys.exit(1)

    try:
        fixer = MismatchFixer(
            target_lang=args.language,
            batch_size=args.batch_size
        )

        stats = fixer.fix_mismatches(
            file_filter=args.file,
            dry_run=args.dry_run
        )

        # Print summary
        print("\n" + "="*60)
        print("Mismatch Fix Summary")
        print("="*60)

        total_fixed = 0
        for file_type, file_stats in stats.items():
            if file_stats['problems_found'] > 0 or file_stats['fixed'] > 0:
                print(f"\n{file_type.capitalize()}:")
                print(f"  Problems found: {file_stats['problems_found']}")
                print(f"  Successfully fixed: {file_stats['fixed']}")
                total_fixed += file_stats['fixed']

        print(f"\nTotal entries fixed: {total_fixed}")
        print("="*60)

        if args.dry_run:
            print("\n⚠️  DRY RUN MODE - No files were saved")
        else:
            print("\n✅ Mismatch fixing completed!")

    except KeyboardInterrupt:
        logger.info("\n\nMismatch fixing interrupted by user")
        sys.exit(1)

    except Exception as e:
        logger.error(f"Mismatch fixing failed: {e}", exc_info=args.verbose)
        sys.exit(1)


class MismatchFixer:
    """Fixes entries with missing or empty translations."""

    def __init__(self, target_lang: str, batch_size: int = 500):
        """
        Initialize the fixer.

        Args:
            target_lang: Target language code (e.g., 'es', 'pt')
            batch_size: Number of definitions to translate per API call
        """
        from .config import validate_language
        if not validate_language(target_lang):
            raise ValueError(f"Unsupported language: {target_lang}")

        self.target_lang = target_lang.lower()
        self.text_field = f"text_{self.target_lang}"
        self.batch_size = batch_size

        # Initialize Grok translator
        from .translator import GrokTranslator
        self.translator = GrokTranslator()

    def _load_json_file(self, file_path: Path) -> Dict:
        """Load JSON file using utils module."""
        return load_json(file_path)

    def _save_json_file(self, data: Dict, file_path: Path):
        """Save JSON file using utils module."""
        save_json(data, file_path)

    def _find_problems_in_file(self, file_path: Path, file_type: str) -> List[DefinitionRef]:
        """
        Find entries with missing or empty translations in a file.

        Args:
            file_path: Path to the JSON file
            file_type: 'roots' or 'words'

        Returns:
            List of DefinitionRef objects for problematic definitions
        """
        data = self._load_json_file(file_path)
        problems = []

        for entry_key, entry in data.items():
            definitions = entry.get('definitions', [])

            for def_idx, defn in enumerate(definitions):
                # Check if translation is missing or empty
                existing_translation = defn.get(self.text_field)
                if not isinstance(existing_translation, str) or not existing_translation.strip():
                    # Check if we have English text to translate from
                    text_en = defn.get('text_en') or defn.get('text', '')
                    if text_en.strip():
                        # This is a problem we can fix
                        order = defn.get('order', def_idx + 1)
                        batch_key = f"{entry_key}-def-{order}"
                        problems.append(DefinitionRef(
                            file_type=file_type,
                            entry_key=entry_key,
                            definition_idx=def_idx,
                            text_en=text_en,
                            batch_key=batch_key
                        ))

        return problems

    def fix_mismatches(self, file_filter: str = None, dry_run: bool = False) -> Dict[str, Dict[str, int]]:
        """
        Find and fix all entries with missing or empty translations.

        Args:
            file_filter: Optional filter for 'roots' or 'words' only
            dry_run: If True, don't save changes

        Returns:
            Statistics dictionary
        """
        from .config import ROOTS_FILE, WORDS_FILE

        stats = {
            'roots': {'problems_found': 0, 'fixed': 0},
            'words': {'problems_found': 0, 'fixed': 0}
        }

        # Collect all problems from both files
        all_problems = []

        files_to_process = []
        if file_filter == 'roots' or file_filter is None:
            files_to_process.append(('roots', ROOTS_FILE))
        if file_filter == 'words' or file_filter is None:
            files_to_process.append(('words', WORDS_FILE))

        for file_type, file_path in files_to_process:
            logger.info(f"Scanning {file_path} for problems...")
            problems = self._find_problems_in_file(file_path, file_type)
            stats[file_type]['problems_found'] = len(problems)
            all_problems.extend(problems)
            logger.info(f"Found {len(problems)} problems in {file_type}")

        if not all_problems:
            logger.info("No problems found - all translations are complete!")
            return stats

        logger.info(f"Found {len(all_problems)} total problems across all files")

        # Group problems by file for easier processing
        problems_by_file = {}
        for problem in all_problems:
            if problem.file_type not in problems_by_file:
                problems_by_file[problem.file_type] = []
            problems_by_file[problem.file_type].append(problem)

        # Load the data files
        data_files = {}
        for file_type in problems_by_file.keys():
            if file_type == 'roots':
                data_files[file_type] = self._load_json_file(ROOTS_FILE)
            elif file_type == 'words':
                data_files[file_type] = self._load_json_file(WORDS_FILE)

        # Process each file's problems
        total_fixed = 0

        for file_type, problems in problems_by_file.items():
            logger.info(f"Fixing {len(problems)} problems in {file_type}")

            data = data_files[file_type]
            fixed_count = 0

            # Translate in batches
            for batch_idx in range(0, len(problems), self.batch_size):
                batch_problems = problems[batch_idx:batch_idx + self.batch_size]
                batch_texts = [p.text_en for p in batch_problems]
                batch_keys = [p.batch_key for p in batch_problems]

                try:
                    logger.info(f"Translating batch {batch_idx // self.batch_size + 1} with {len(batch_problems)} definitions...")
                    translations = self.translator.translate_batch(
                        batch_texts,
                        self.target_lang,
                        keys=batch_keys,
                        batch_index=batch_idx // self.batch_size + 1
                    )

                    # Apply translations back to data
                    for problem, translation in zip(batch_problems, translations):
                        entry = data[problem.entry_key]
                        definitions = entry.get('definitions', [])

                        if problem.definition_idx < len(definitions):
                            defn = definitions[problem.definition_idx]

                            # Migrate 'text' to 'text_en' if needed
                            if 'text' in defn and 'text_en' not in defn:
                                defn['text_en'] = defn.pop('text')

                            # Add the translation
                            defn[self.text_field] = translation.strip()
                            fixed_count += 1

                except Exception as e:
                    logger.error(f"Failed to translate batch starting at index {batch_idx}: {e}")
                    continue

            stats[file_type]['fixed'] = fixed_count
            total_fixed += fixed_count
            logger.info(f"Fixed {fixed_count} entries in {file_type}")

            # Save the updated file (with backup)
            if not dry_run and fixed_count > 0:
                if file_type == 'roots':
                    backup_path = create_backup(ROOTS_FILE)
                    logger.info(f"Created backup: {backup_path}")
                    self._save_json_file(data, ROOTS_FILE)
                elif file_type == 'words':
                    backup_path = create_backup(WORDS_FILE)
                    logger.info(f"Created backup: {backup_path}")
                    self._save_json_file(data, WORDS_FILE)

                logger.info(f"Saved updated {file_type} file")

        logger.info(f"Total fixed across all files: {total_fixed}")
        return stats


if __name__ == '__main__':
    main()
