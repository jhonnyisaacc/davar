#!/usr/bin/env python3
"""
Main CLI entry point for lexicon translation.

Translates English definitions in lexicon JSON files to target languages
using xAI Grok API.
"""

import argparse
import logging
import sys
from pathlib import Path

from .processor import LexiconProcessor
from .config import DEFAULT_LANGUAGE, DEFAULT_BATCH_SIZE

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)


def parse_args():
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description='Translate lexicon dictionary definitions to target languages using xAI Grok API',
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    
    parser.add_argument(
        '--file',
        choices=['roots', 'words'],
        help='Process specific file (roots.json or words.json). If not specified, processes both.'
    )
    
    parser.add_argument(
        '--strong-number',
        '--strong',
        dest='strong_number',
        help='Process single entry by Strong\'s number (e.g., H1, H10). Searches in both files if --file not specified.'
    )
    
    parser.add_argument(
        '--language',
        '--lang',
        dest='language',
        default=DEFAULT_LANGUAGE,
        help=f'Target language code (default: {DEFAULT_LANGUAGE}). Examples: es, pt, fr'
    )
    
    parser.add_argument(
        '--batch-size',
        type=int,
        default=DEFAULT_BATCH_SIZE,
        help=f'Number of definitions per API call (default: {DEFAULT_BATCH_SIZE}). Ignored when using --strong-number.'
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
    
    # Set logging level
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
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
    
    # Initialize processor
    try:
        # Use specified batch_size, but warn if using --strong-number with large batches
        effective_batch_size = args.batch_size
        if args.strong_number and args.batch_size > 1:
            logger.warning(
                f"Using batch_size={args.batch_size} with --strong-number. "
                f"This will batch definitions within the single entry."
            )

        processor = LexiconProcessor(
            target_lang=args.language,
            batch_size=effective_batch_size
        )
    except Exception as e:
        logger.error(f"Failed to initialize processor: {e}")
        sys.exit(1)
    
    # Process files
    all_stats = {
        'roots': {'entries_processed': 0, 'definitions_translated': 0},
        'words': {'entries_processed': 0, 'definitions_translated': 0},
    }
    
    try:
        if args.strong_number:
            # Single entry processing
            logger.info(f"Processing Strong's number: {args.strong_number}")
            
            if args.file == 'roots' or args.file is None:
                logger.info("Searching in roots.json...")
                stats = processor.process_roots(args.strong_number, args.dry_run)
                all_stats['roots'] = stats
            
            if args.file == 'words' or args.file is None:
                logger.info("Searching in words.json...")
                stats = processor.process_words(args.strong_number, args.dry_run)
                all_stats['words'] = stats
            
            if all_stats['roots']['entries_processed'] == 0 and \
               all_stats['words']['entries_processed'] == 0:
                logger.warning(
                    f"Strong's number {args.strong_number} not found in any file"
                )
        
        else:
            # Full file processing
            if args.file == 'roots' or args.file is None:
                logger.info("Processing roots.json...")
                stats = processor.process_roots(dry_run=args.dry_run)
                all_stats['roots'] = stats
            
            if args.file == 'words' or args.file is None:
                logger.info("Processing words.json...")
                stats = processor.process_words(dry_run=args.dry_run)
                all_stats['words'] = stats
        
        # Print summary
        print("\n" + "="*60)
        print("Translation Summary")
        print("="*60)
        
        total_entries = 0
        total_definitions = 0
        
        for file_type, stats in all_stats.items():
            entries = stats.get('entries_processed', 0)
            definitions = stats.get('definitions_translated', 0)
            
            if entries > 0 or definitions > 0:
                print(f"\n{file_type.capitalize()}:")
                print(f"  Entries processed: {entries}")
                print(f"  Definitions translated: {definitions}")
                
                total_entries += entries
                total_definitions += definitions
        
        print(f"\nTotal:")
        print(f"  Entries processed: {total_entries}")
        print(f"  Definitions translated: {total_definitions}")

        # Print mismatch statistics
        mismatch_stats = processor.get_mismatch_stats()
        if mismatch_stats['total_batches'] > 0:
            print(f"\nTranslation Quality Stats:")
            print(f"  Total batches processed: {mismatch_stats['total_batches']}")
            print(f"  Batches with mismatches: {mismatch_stats['mismatched_batches']}")
            if mismatch_stats['mismatched_batches'] > 0:
                print(f"  Missing translations: {mismatch_stats['total_missing']}")
                print(f"  Extra translations: {mismatch_stats['total_extra']}")
                print(f"  Mismatch patterns: {mismatch_stats['mismatch_patterns']}")

        print("="*60)

        if args.dry_run:
            print("\n⚠️  DRY RUN MODE - No files were saved")
        else:
            print("\n✅ Translation completed successfully!")
    
    except KeyboardInterrupt:
        logger.info("\n\nTranslation interrupted by user")
        sys.exit(1)
    
    except Exception as e:
        logger.error(f"Translation failed: {e}", exc_info=args.verbose)
        sys.exit(1)


if __name__ == '__main__':
    main()
