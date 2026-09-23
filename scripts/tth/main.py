#!/usr/bin/env python3
"""
TTH2 Main CLI
==============

Main entry point for the TTH2 processing system.

Usage:
    python main.py split        # Split all DOCX files into per-book markdown
    python main.py convert <book> # Convert single book markdown to JSON
    python main.py all          # Full pipeline: split all + convert all
    python main.py books        # List available books

Author: Davar Project
"""

import sys
import os
import logging
import json
from pathlib import Path
from typing import List, Optional

# Try to import tqdm for progress bars
try:
    from tqdm import tqdm
    TQDM_AVAILABLE = True
except ImportError:
    TQDM_AVAILABLE = False
    # Fallback: simple progress indicator

    class tqdm:
        def __init__(self, iterable=None, desc='', total=None, **kwargs):
            self.iterable = iterable
            self.desc = desc
            self.total = total or (len(iterable) if iterable else 0)
            self.n = 0

        @staticmethod
        def write(message: str):
            print(message)

        def __iter__(self):
            for item in self.iterable:
                yield item
                self.update(1)

        def update(self, n=1):
            self.n += n
            if self.total > 0:
                percent = int(100 * self.n / self.total)
                print(
                    f"\r{self.desc}: {percent}% ({self.n}/{self.total})", end='', flush=True)
                if self.n >= self.total:
                    print()

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

# Add current directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(levelname)s: %(message)s'
)
logger = logging.getLogger('tth2')

try:
    from docx_to_md import convert_docx
    from book_splitter import split_markdown, TTH2BookSplitter
    from md_to_json import convert_book_markdown_to_json
    from json_postprocess import get_postprocessor
    from format_validator import get_format_validator, print_book_report
    from config import BOOKS_INFO
    from section_headers import detect_section_headers_in_json
    from fix_false_restart_markers import repair_books
except ImportError:
    # Fallback for direct execution
    import docx_to_md
    import book_splitter
    import md_to_json
    import json_postprocess
    import format_validator
    import config
    import section_headers
    import fix_false_restart_markers
    convert_docx = docx_to_md.convert_docx
    split_markdown = book_splitter.split_markdown
    TTH2BookSplitter = book_splitter.TTH2BookSplitter
    convert_book_markdown_to_json = md_to_json.convert_book_markdown_to_json
    get_postprocessor = json_postprocess.get_postprocessor
    get_format_validator = format_validator.get_format_validator
    print_book_report = format_validator.print_book_report
    BOOKS_INFO = config.BOOKS_INFO
    detect_section_headers_in_json = section_headers.detect_section_headers_in_json
    repair_books = fix_false_restart_markers.repair_books


# Default directories
DATA_DIR = Path.home() / "davar" / "data" / "tth"
RAW_DIR = DATA_DIR / "raw"
MARKDOWN_DIR = DATA_DIR / "markdown"
JSON_DIR = DATA_DIR / "json"


def show_banner():
    """Show application banner."""
    print("=" * 60)
    print("TTH2 Processing System - Davar Project")
    print("Simplified Textual Translation of Hebrew")
    print("=" * 60)
    print()


def show_help():
    """Show help information."""
    print("""
USAGE:
  python main.py split                    Split all DOCX files into per-book markdown
  python main.py convert <book>           Convert single book markdown to JSON
  python main.py convert all              Convert all markdown files to JSON
  python main.py postprocess <book>       Post-process JSON (fix italics, convert to <em>)
  python main.py postprocess all          Post-process all JSON files
  python main.py validate <book>          Validate single book JSON file
  python main.py validate all             Validate all JSON files
    python main.py validate-format <book>   Validate formatting + structure for one JSON
    python main.py validate-format all      Validate formatting + structure for all JSON
  python main.py process <docx> [--books <book1> <book2> ...]  Process specific DOCX file for specific books
  python main.py all                      Full pipeline: split + convert + postprocess
  python main.py books                    List available books
  python main.py --help                   Show this help

EXAMPLES:
  python scripts/tth/main.py split             # Split all DOCX to markdown/
  python scripts/tth/main.py convert amos      # Convert amos.md to amos.json
  python scripts/tth/main.py postprocess lukas # Fix formatting in lukas.json
  python scripts/tth/main.py validate amos     # Check amos.json for issues
  python scripts/tth/main.py validate all      # Check all JSON files
  python scripts/tth/main.py process data/tth/raw/romanos.docx --books romanos  # Process specific book
  python scripts/tth/main.py all               # Complete workflow

OPTIONS FOR POSTPROCESS:
  --dry-run                               Show changes without modifying files
  --backup                                Create .bak backup before modifying

VALIDATE-FORMAT NOTES:
    Uses canonical structure from web/public/data/tth/*.json
    Checks chapter count and per-chapter verse counts in addition to formatting

DIRECTORIES:
  Raw DOCX files:     data/tth/raw/
  Markdown files:     data/tth/markdown/
  JSON files:         data/tth/json/

AVAILABLE BOOKS:
""" + "\n".join(f"  {book}" for book in sorted(BOOKS_INFO.keys())))


def ensure_directories():
    """Ensure all required directories exist."""
    for dir_path in [RAW_DIR, MARKDOWN_DIR, JSON_DIR]:
        dir_path.mkdir(parents=True, exist_ok=True)


def get_docx_files() -> List[Path]:
    """Get all DOCX files from the raw directory."""
    if not RAW_DIR.exists():
        print(f"❌ Raw directory not found: {RAW_DIR}")
        return []

    docx_files = list(RAW_DIR.glob("*.docx"))
    return sorted(docx_files)


def infer_books_for_docx(docx_file: Path) -> List[str]:
    """
    Infer which books should be extracted from a given DOCX source.

    This avoids false-positive matches (e.g. TOC lines in tanaj.docx)
    overwriting markdown files for books that do not belong to that source.
    """
    stem = docx_file.stem.lower()

    # Explicit single-book sources
    explicit_map = {
        'apocalipsis': ['sodot'],
        'romanos': ['romanos'],
        'galatas': ['galatas'],
        'besorah': ['matityahu', 'markos', 'lukas', 'iojanan', 'maasei_hashlijim'],
    }
    if stem in explicit_map:
        return explicit_map[stem]

    # Section-scoped sources
    if stem == 'tanaj':
        allowed_sections = {'torah', 'neviim', 'ketuvim'}
    else:
        # Unknown source name: keep current broad behavior for compatibility.
        return list(BOOKS_INFO.keys())

    return [
        key for key, info in BOOKS_INFO.items()
        if info.get('section') in allowed_sections
    ]


def split_all_docx():
    """Split all DOCX files into per-book markdown files."""
    print("Splitting DOCX files into per-book markdown...\n")

    docx_files = get_docx_files()
    if not docx_files:
        print("❌ No DOCX files found in raw directory")
        return False

    splitter = TTH2BookSplitter()
    total_books = 0
    conversion_failures = 0
    split_failures = 0
    extraction_failures = 0

    # Process each DOCX file
    for docx_file in tqdm(docx_files, desc="Processing DOCX files", unit="file"):
        print(f"\n📄 {docx_file.name}")

        books_to_extract = infer_books_for_docx(docx_file)
        if not books_to_extract:
            print("  ⚠️  No matching books configured for this DOCX, skipping")
            continue
        print(f"  Target books: {len(books_to_extract)}")

        # Convert DOCX to markdown
        try:
            temp_md_file = docx_file.with_suffix('.md')
            print(f"  Converting to markdown...", end=' ', flush=True)
            convert_docx(str(docx_file), str(temp_md_file))
            print("✓")
        except Exception as e:
            print(f"\n  ❌ Conversion failed: {e}")
            conversion_failures += 1
            continue

        # Split into per-book files
        try:
            print(f"  Extracting books:")
            extracted = splitter.split_complete_markdown(
                str(temp_md_file),
                str(MARKDOWN_DIR),
                books_to_extract=books_to_extract,
                verbose=True,
            )
            print(f"  ✓ Extracted {len(extracted)} books")
            total_books += len(extracted)

            if len(extracted) == 0:
                print("  ❌ No target books were extracted from this DOCX")
                extraction_failures += 1

            # Clean up temporary file
            temp_md_file.unlink(missing_ok=True)

        except Exception as e:
            print(f"  ❌ Split failed: {e}")
            split_failures += 1
            continue

    print(f"\n{'='*60}")
    print(f"✓ Split complete! Extracted {total_books} books total")
    if conversion_failures:
        print(f"⚠️  DOCX conversion failures: {conversion_failures}")
    if split_failures:
        print(f"⚠️  Split failures: {split_failures}")
    if extraction_failures:
        print(f"⚠️  Extraction failures: {extraction_failures}")
    print(f"{'='*60}")

    # Guardrail: don't continue pipeline if nothing was actually extracted.
    if total_books == 0:
        print("❌ No books were extracted during split step.")
        print("This usually means DOCX conversion failed (e.g. missing mammoth)")
        print("or book headers did not match configured patterns.")
        return False

    # Guardrail: do not silently continue if one or more source DOCX files yielded nothing.
    if extraction_failures > 0:
        print("❌ One or more DOCX files produced zero extracted target books.")
        print("Fix source headers/patterns before continuing the full pipeline.")
        return False

    return True


def convert_book_to_json(book_key: str, verbose: bool = True):
    """Convert a single book markdown file to JSON."""
    if book_key not in BOOKS_INFO:
        if verbose:
            print(f"❌ Unknown book: {book_key}")
            print("Use 'python main.py books' to see available books")
        return False

    markdown_file = MARKDOWN_DIR / f"{book_key}.md"
    if not markdown_file.exists():
        if verbose:
            print(f"❌ Markdown file not found: {markdown_file}")
            print("Run 'python main.py split' first to generate markdown files")
        return False

    json_file = JSON_DIR / f"{book_key}.json"

    # Normalize known markdown wrap artifacts before conversion so reruns are stable.
    _, repaired_markers, _ = repair_books(book_keys={book_key}, verbose=False)
    if repaired_markers > 0 and verbose:
        print(
            f"ℹ️  Auto-repaired {repaired_markers} false verse restart marker(s) in {book_key}.md")

    try:
        convert_book_markdown_to_json(book_key, str(
            markdown_file), str(json_file), verbose=verbose)

        # Hard guard: converted JSON must never contain non-increasing verse order.
        with open(json_file, 'r', encoding='utf-8') as f:
            data = json.load(f)

        regressions = []
        for chapter_data in data.get('chapters', []):
            chapter_num = chapter_data.get('chapter', 0)
            previous_verse = None
            for verse_data in chapter_data.get('verses', []):
                verse_num = verse_data.get('verse')
                if not isinstance(verse_num, int):
                    continue
                if previous_verse is not None and verse_num <= previous_verse:
                    regressions.append(
                        (chapter_num, previous_verse, verse_num))
                previous_verse = verse_num

        if regressions:
            if verbose:
                print(
                    f"❌ Failed to convert {book_key}: verse sequence regressions remain in JSON")
                for chapter_num, prev, cur in regressions[:10]:
                    print(f"   - Ch {chapter_num}: {cur} after {prev}")
                if len(regressions) > 10:
                    print(f"   ... and {len(regressions) - 10} more")
            return False

        if verbose:
            print(f"✓ Converted {book_key} to JSON")
        return True
    except Exception as e:
        if verbose:
            print(f"❌ Failed to convert {book_key}: {e}")
        return False


def convert_all_books():
    """Convert all available markdown files to JSON."""
    print("Converting all books to JSON...\n")

    if not MARKDOWN_DIR.exists():
        print(f"❌ Markdown directory not found: {MARKDOWN_DIR}")
        print("Run 'python main.py split' first")
        return False

    markdown_files = list(MARKDOWN_DIR.glob("*.md"))
    if not markdown_files:
        print("❌ No markdown files found")
        print("Run 'python main.py split' first")
        return False

    # Global pre-convert repair to keep future reruns deterministic.
    repaired_files, repaired_markers, _ = repair_books(verbose=False)
    if repaired_markers > 0:
        print(
            f"ℹ️  Auto-repaired {repaired_markers} false restart marker(s) in {repaired_files} markdown file(s).\n")

    converted = 0
    failed = 0
    failed_books = []

    # Convert with progress bar
    for md_file in tqdm(sorted(markdown_files), desc="Converting to JSON", unit="book"):
        book_key = md_file.stem
        if book_key in BOOKS_INFO:
            if convert_book_to_json(book_key, verbose=False):
                converted += 1
                tqdm.write(f"  ✓ {book_key}")
            else:
                failed += 1
                failed_books.append(book_key)
                tqdm.write(f"  ❌ {book_key}")
        else:
            tqdm.write(f"  ⚠️  Skipping unknown book: {book_key}")

    print(f"\n{'='*60}")
    print(f"✓ Conversion complete! {converted} books converted")
    if failed > 0:
        print(f"⚠️  {failed} books failed:")
        for book in failed_books:
            print(f"   - {book}")
    print(f"{'='*60}")

    return failed == 0


def postprocess_book(book_key: str, dry_run: bool = False, backup: bool = False, verbose: bool = True):
    """Post-process a single book's JSON file."""
    json_file = JSON_DIR / f"{book_key}.json"
    if not json_file.exists():
        if verbose:
            print(f"❌ JSON file not found: {json_file}")
            print("Run 'python main.py convert' first to generate JSON files")
        return False

    try:
        processor = get_postprocessor(verbose=verbose)
        success, file_stats = processor.process_json_file(
            json_file, dry_run=dry_run, backup=backup)
        if success and verbose:
            processor.print_summary(dry_run)
        return success
    except Exception as e:
        if verbose:
            print(f"❌ Failed to post-process {book_key}: {e}")
        return False


def postprocess_all_books(dry_run: bool = False, backup: bool = False):
    """Post-process all JSON files to convert italics to <em> tags."""
    print(f"{'[DRY RUN] ' if dry_run else ''}Post-processing all JSON files...\n")

    if not JSON_DIR.exists():
        print(f"❌ JSON directory not found: {JSON_DIR}")
        print("Run 'python main.py convert' first")
        return False

    processor = get_postprocessor(verbose=False)
    success = processor.process_all_files(
        JSON_DIR, dry_run=dry_run, backup=backup)
    return success


def validate_book(book_key: str, verbose: bool = True) -> bool:
    """Validate a single book's JSON file."""
    json_file = JSON_DIR / f"{book_key}.json"
    if not json_file.exists():
        if verbose:
            logger.error(f"JSON file not found: {json_file}")
        return False

    try:
        with open(json_file, 'r', encoding='utf-8') as f:
            data = json.load(f)

        issues = []
        book_info = data.get('book_info', {})
        chapters = data.get('chapters', [])

        # Check chapter count
        expected_chapters = BOOKS_INFO.get(
            book_key, {}).get('expected_chapters', 0)
        actual_chapters = len(chapters)
        if expected_chapters != actual_chapters:
            issues.append(
                f"Chapter count mismatch: expected {expected_chapters}, got {actual_chapters}")

        # Check for empty verses and validate structure
        total_verses = 0
        for chapter_data in chapters:
            chapter_num = chapter_data.get('chapter', 0)
            verses = chapter_data.get('verses', [])

            for verse_data in verses:
                verse_num = verse_data.get('verse', 0)
                verse_text = verse_data.get('tth', '').strip()
                footnotes = verse_data.get('footnotes', [])

                total_verses += 1

                # Check for empty verses
                if not verse_text:
                    issues.append(
                        f"Empty verse: Chapter {chapter_num}, Verse {verse_num}")

                # Check footnote references
                for footnote in footnotes:
                    marker = footnote.get('marker', '')
                    number = footnote.get('number', 0)
                    if not marker or number == 0:
                        issues.append(
                            f"Invalid footnote in Chapter {chapter_num}, Verse {verse_num}")

        # Check for section headers in verse text
        section_issues = detect_section_headers_in_json(json_file)
        if section_issues:
            for chapter, verse, header in section_issues:
                issues.append(
                    f"Section header in verse: Chapter {chapter}, Verse {verse}: '{header}'")

        if issues:
            if verbose:
                print(f"❌ {book_key}: {len(issues)} issues found")
                for issue in issues[:5]:  # Show first 5 issues
                    print(f"   - {issue}")
                if len(issues) > 5:
                    print(f"   ... and {len(issues) - 5} more")
            return False
        else:
            if verbose:
                print(
                    f"✅ {book_key}: OK ({actual_chapters} chapters, {total_verses} verses)")
            return True

    except Exception as e:
        if verbose:
            print(f"❌ {book_key}: Error validating - {e}")
        return False


def validate_all_books(verbose: bool = True) -> bool:
    """Validate all JSON files."""
    if not JSON_DIR.exists():
        if verbose:
            print(f"❌ JSON directory not found: {JSON_DIR}")
        return False

    json_files = list(JSON_DIR.glob("*.json"))
    if not json_files:
        if verbose:
            print("❌ No JSON files found")
        return False

    if verbose:
        logger.info("Validating all JSON files...")

    total_books = 0
    valid_books = 0
    total_issues = 0

    for json_file in sorted(json_files):
        book_key = json_file.stem
        if book_key in BOOKS_INFO:
            total_books += 1
            if validate_book(book_key, verbose=verbose):
                valid_books += 1
            else:
                # Count issues for summary
                try:
                    issues = detect_section_headers_in_json(json_file)
                    total_issues += len(issues)
                except:
                    total_issues += 1

    if verbose:
        logger.info(
            f"Validation Summary: {valid_books}/{total_books} books valid")
        if total_issues > 0:
            logger.warning(f"Total issues found: {total_issues}")

    return valid_books == total_books


def validate_format_book(book_key: str, verbose: bool = True) -> bool:
    """Validate formatting consistency for a single book JSON file."""
    json_file = JSON_DIR / f"{book_key}.json"
    if not json_file.exists():
        if verbose:
            logger.error(f"JSON file not found: {json_file}")
        return False

    try:
        validator = get_format_validator(verbose=verbose)
        is_valid, issues, stats = validator.validate_book_file(json_file)
        if verbose:
            print_book_report(book_key, is_valid, issues, stats)
        return is_valid
    except Exception as e:
        if verbose:
            print(f"❌ {book_key}: Error validating format - {e}")
        return False


def validate_format_all_books(verbose: bool = True) -> bool:
    """Validate formatting consistency for all JSON files."""
    if not JSON_DIR.exists():
        if verbose:
            print(f"❌ JSON directory not found: {JSON_DIR}")
        return False

    validator = get_format_validator(verbose=verbose)
    all_valid, all_stats, all_issues = validator.validate_all_books(JSON_DIR)

    if verbose:
        total_books = len(all_stats)
        valid_books = 0
        for book_key in sorted(all_stats.keys()):
            issues = all_issues.get(book_key, [])
            is_valid = len(issues) == 0
            if is_valid:
                valid_books += 1
            print_book_report(book_key, is_valid, issues, all_stats[book_key])
        print()
        print(
            f"Formatting Validation Summary: {valid_books}/{total_books} books valid")

    return all_valid


def process_docx_books(docx_path: str, book_keys: List[str]):
    """Process a specific DOCX file for specific books: split → convert → postprocess → validate."""
    docx_file = Path(docx_path)
    if not docx_file.exists():
        print(f"❌ DOCX file not found: {docx_path}")
        return False

    print(f"Processing {docx_file.name} for books: {', '.join(book_keys)}")
    print()

    # Validate book keys
    invalid_books = [book for book in book_keys if book not in BOOKS_INFO]
    if invalid_books:
        print(f"❌ Unknown books: {', '.join(invalid_books)}")
        print("Use 'python main.py books' to see available books")
        return False

    splitter = TTH2BookSplitter()

    # Step 1: Convert DOCX to temporary markdown
    print("STEP 1: Converting DOCX to markdown")
    temp_md_file = docx_file.with_suffix('.md')
    try:
        convert_docx(str(docx_file), str(temp_md_file))
        print("✓ DOCX converted to markdown")
    except Exception as e:
        print(f"❌ DOCX conversion failed: {e}")
        return False

    # Step 2: Split specific books from markdown
    print("\nSTEP 2: Extracting books from markdown")
    try:
        extracted = splitter.split_complete_markdown(str(temp_md_file), str(
            MARKDOWN_DIR), books_to_extract=book_keys, verbose=True)
        if not extracted:
            print("❌ No books were extracted")
            temp_md_file.unlink(missing_ok=True)
            return False
        missing_books = [book for book in book_keys if book not in extracted]
        if missing_books:
            print(
                f"❌ Failed to extract requested books: {', '.join(missing_books)}")
            print(
                "Check book headers/patterns in DOCX and scripts/tth/config.py for those books.")
            temp_md_file.unlink(missing_ok=True)
            return False
        print(f"✓ Extracted {len(extracted)} books")
    except Exception as e:
        print(f"❌ Book extraction failed: {e}")
        temp_md_file.unlink(missing_ok=True)
        return False

    # Clean up temporary file
    temp_md_file.unlink(missing_ok=True)

    # Step 3: Convert extracted books to JSON
    print("\nSTEP 3: Converting to JSON")
    converted = 0
    for book_key in book_keys:
        if convert_book_to_json(book_key, verbose=True):
            converted += 1

    if converted != len(book_keys):
        print(
            f"❌ Only {converted}/{len(book_keys)} books converted successfully")
        return False

    # Step 4: Post-process JSON files
    print("\nSTEP 4: Post-processing JSON")
    postprocessed = 0
    for book_key in book_keys:
        if postprocess_book(book_key, verbose=False):
            postprocessed += 1

    if postprocessed != len(book_keys):
        print(
            f"❌ Only {postprocessed}/{len(book_keys)} books post-processed successfully")
        return False

    # Step 5: Validate JSON files
    print("\nSTEP 5: Validating JSON")
    validated = 0
    for book_key in book_keys:
        if validate_book(book_key, verbose=True):
            validated += 1

    if validated != len(book_keys):
        print(
            f"❌ Only {validated}/{len(book_keys)} books validated successfully")
        return False

    # Step 6: Validate formatting consistency
    print("\nSTEP 6: Validating formatting consistency")
    format_validated = 0
    for book_key in book_keys:
        if validate_format_book(book_key, verbose=True):
            format_validated += 1

    if format_validated != len(book_keys):
        print(
            f"❌ Only {format_validated}/{len(book_keys)} books passed format validation")
        return False

    print(
        f"\n🎉 Successfully processed {len(book_keys)} books from {docx_file.name}!")
    return True


def list_books():
    """List all available books."""
    print("AVAILABLE BOOKS:")
    print()

    # Group by section
    sections = {}
    for book_key, info in BOOKS_INFO.items():
        section = info.get('section', 'other')
        if section not in sections:
            sections[section] = []
        sections[section].append((book_key, info))

    section_names = {
        'torah': 'TORAH (Pentateuch)',
        'neviim': 'NEVIIM (Prophets)',
        'ketuvim': 'KETUVIM (Writings)',
        'besorah': 'BESORAH (New Testament)',
    }

    for section in ['torah', 'neviim', 'ketuvim', 'besorah']:
        if section in sections:
            print(f"{section_names.get(section, section.upper())}:")
            for book_key, info in sorted(sections[section]):
                print(f"  {book_key:<20} - {info.get('spanish_name', '')}")
            print()


def main():
    """Main entry point."""
    show_banner()

    # No arguments - show help
    if len(sys.argv) == 1:
        show_help()
        sys.exit(0)

    # Parse command
    command = sys.argv[1].lower()

    # Ensure directories exist
    ensure_directories()

    # Handle commands
    if command in ['--help', '-h', 'help']:
        show_help()
        sys.exit(0)

    elif command == 'books':
        list_books()
        sys.exit(0)

    elif command == 'split':
        success = split_all_docx()
        sys.exit(0 if success else 1)

    elif command == 'convert':
        if len(sys.argv) < 3:
            print(
                "Usage: python main.py convert <book_key> or python main.py convert all")
            sys.exit(1)

        book_key = sys.argv[2]
        if book_key == 'all':
            success = convert_all_books()
            sys.exit(0 if success else 1)
        else:
            success = convert_book_to_json(book_key)
            sys.exit(0 if success else 1)

    elif command == 'postprocess':
        if len(sys.argv) < 3:
            print(
                "Usage: python main.py postprocess <book_key> or python main.py postprocess all")
            print("Options: --dry-run, --backup")
            sys.exit(1)

        book_key = sys.argv[2]
        dry_run = '--dry-run' in sys.argv
        backup = '--backup' in sys.argv

        if book_key == 'all':
            success = postprocess_all_books(dry_run=dry_run, backup=backup)
            sys.exit(0 if success else 1)
        else:
            success = postprocess_book(
                book_key, dry_run=dry_run, backup=backup)
            sys.exit(0 if success else 1)

    elif command == 'validate':
        if len(sys.argv) < 3:
            print(
                "Usage: python main.py validate <book_key> or python main.py validate all")
            sys.exit(1)

        book_key = sys.argv[2]
        if book_key == 'all':
            success = validate_all_books()
            sys.exit(0 if success else 1)
        else:
            if book_key not in BOOKS_INFO:
                print(f"Unknown book: {book_key}")
                print("Use 'python main.py books' to see available books")
                sys.exit(1)
            success = validate_book(book_key)
            sys.exit(0 if success else 1)

    elif command == 'validate-format':
        if len(sys.argv) < 3:
            print(
                "Usage: python main.py validate-format <book_key> or python main.py validate-format all")
            sys.exit(1)

        book_key = sys.argv[2]
        if book_key == 'all':
            success = validate_format_all_books()
            sys.exit(0 if success else 1)
        else:
            if book_key not in BOOKS_INFO:
                print(f"Unknown book: {book_key}")
                print("Use 'python main.py books' to see available books")
                sys.exit(1)
            success = validate_format_book(book_key)
            sys.exit(0 if success else 1)

    elif command == 'process':
        if len(sys.argv) < 3:
            print(
                "Usage: python main.py process <docx_path> [--books <book1> <book2> ...]")
            print(
                "If --books is not specified, attempts to infer book from DOCX filename")
            sys.exit(1)

        docx_path = sys.argv[2]

        # Parse --books argument
        book_keys = []
        if '--books' in sys.argv:
            books_index = sys.argv.index('--books')
            if books_index + 1 < len(sys.argv):
                book_keys = sys.argv[books_index + 1:]
            else:
                print("Error: --books requires at least one book key")
                sys.exit(1)
        else:
            # Try to infer book from filename
            docx_name = Path(docx_path).stem.lower()
            if docx_name in BOOKS_INFO:
                book_keys = [docx_name]
                print(f"Inferred book '{docx_name}' from DOCX filename")
            else:
                print(f"Could not infer book from DOCX filename '{docx_name}'")
                print("Please specify books with --books option")
                sys.exit(1)

        success = process_docx_books(docx_path, book_keys)
        sys.exit(0 if success else 1)

    elif command == 'all':
        print("Running full TTH2 pipeline...")
        print()

        # Step 1: Split DOCX files
        print("STEP 1: Splitting DOCX files")
        if not split_all_docx():
            print("❌ Pipeline failed at DOCX splitting")
            sys.exit(1)

        print()
        print("STEP 2: Converting to JSON")
        if not convert_all_books():
            print("❌ Pipeline failed at JSON conversion")
            sys.exit(1)

        print()
        print("STEP 3: Post-processing JSON (converting italics to <em>)")
        if not postprocess_all_books():
            print("❌ Pipeline failed at post-processing")
            sys.exit(1)

        print()
        print("STEP 4: Validating formatting consistency")
        if not validate_format_all_books(verbose=True):
            print("❌ Pipeline failed at format validation")
            sys.exit(1)

        print("\n🎉 Pipeline completed successfully!")
        sys.exit(0)

    else:
        print(f"Unknown command: {command}")
        print()
        show_help()
        sys.exit(1)


if __name__ == '__main__':
    main()
