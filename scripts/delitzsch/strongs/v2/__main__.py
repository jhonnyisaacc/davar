"""
CLI entry point for v2 Strong's assignment system.

Usage:
    python -m scripts.delitzsch.strongs.v2 --book jude
    python -m scripts.delitzsch.strongs.v2 --all
    python -m scripts.delitzsch.strongs.v2 --book jude --force
"""

import argparse
import logging
import sys
from pathlib import Path


from .processor import StrongsProcessorV2
from .config import ALL_BOOKS, validate_dictionary


def setup_logging(verbose: bool = False):
    """Set up logging configuration."""
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )


def parse_args():
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description='Assign Strong\'s numbers to Hebrew words in Delitzsch NT (v2 - Dictionary-based)',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python -m scripts.delitzsch.strongs.v2 --book jude
  python -m scripts.delitzsch.strongs.v2 --all
  python -m scripts.delitzsch.strongs.v2 --book jude --force
  python -m scripts.delitzsch.strongs.v2 --book jude --verbose
        """
    )
    
    parser.add_argument(
        '--book',
        choices=ALL_BOOKS,
        help='Process specific book (e.g., jude). If not specified, processes all books with --all.'
    )
    
    parser.add_argument(
        '--all',
        action='store_true',
        help='Process all books'
    )
    
    parser.add_argument(
        '--force',
        action='store_true',
        help='Re-process books even if output files already exist'
    )
    
    parser.add_argument(
        '--verbose',
        '-v',
        action='store_true',
        help='Enable verbose logging'
    )
    
    parser.add_argument(
        '--stats',
        action='store_true',
        help='Show detailed statistics after processing'
    )
    
    return parser.parse_args()


def main():
    """Main entry point."""
    args = parse_args()
    
    setup_logging(args.verbose)
    logger = logging.getLogger(__name__)
    
    # Validate dictionary exists
    if not validate_dictionary():
        logger.error(
            "Dictionary file not found. Please ensure the dictionary exists at:\n"
            f"  {Path(__file__).parent / 'config.py'}.DICTIONARY_PATH"
        )
        sys.exit(1)
    
    # Validate arguments
    if not args.book and not args.all:
        logger.error("Please specify --book <book_name> or --all")
        sys.exit(1)
    
    # Initialize processor
    processor = StrongsProcessorV2()
    
    try:
        if args.book:
            # Process single book
            logger.info(f"Processing book: {args.book}")
            result = processor.process_book(args.book, force=args.force)
            
            print(f"\n{'='*60}")
            print(f"Results for {result.book}:")
            print(f"{'='*60}")
            print(f"  Total null words: {result.total_null_words}")
            print(f"  Assigned: {result.total_assigned}")
            print(f"  Failed: {result.total_failed}")
            print(f"  Skipped: {result.total_skipped}")
            
            if result.total_null_words > 0:
                success_rate = result.total_assigned / result.total_null_words * 100
                print(f"  Success rate: {success_rate:.1f}%")
            
            if args.stats:
                stats = processor.get_stats()
                print(f"\nDetailed Statistics:")
                print(f"  Dictionary entries: {stats['dictionary']['total_entries']}")
                print(f"  Root entries: {stats['dictionary']['root_entries']}")
                print(f"  Proper names: {stats['dictionary']['proper_names']}")
                
        elif args.all:
            # Process all books
            logger.info("Processing all books...")
            results = processor.process_all_books(force=args.force)
            
            print(f"\n{'='*60}")
            print("Summary for all books:")
            print(f"{'='*60}")
            
            total_null = sum(r.total_null_words for r in results)
            total_assigned = sum(r.total_assigned for r in results)
            total_failed = sum(r.total_failed for r in results)
            total_skipped = sum(r.total_skipped for r in results)
            
            print(f"  Books processed: {len(results)}")
            print(f"  Total null words: {total_null}")
            print(f"  Total assigned: {total_assigned}")
            print(f"  Total failed: {total_failed}")
            print(f"  Total skipped: {total_skipped}")
            
            if total_null > 0:
                success_rate = total_assigned / total_null * 100
                print(f"  Overall success rate: {success_rate:.1f}%")
            
            # Per-book breakdown
            print(f"\nPer-book breakdown:")
            for result in results:
                if result.total_null_words > 0:
                    rate = result.total_assigned / result.total_null_words * 100
                    print(f"  {result.book:15s}: {result.total_assigned:3d}/{result.total_null_words:3d} ({rate:5.1f}%)")
    
    except KeyboardInterrupt:
        logger.info("Interrupted by user")
        sys.exit(130)
    except Exception as e:
        logger.exception("Processing failed")
        sys.exit(1)


if __name__ == '__main__':
    main()