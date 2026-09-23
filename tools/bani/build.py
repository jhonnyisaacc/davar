#!/usr/bin/env python3
"""
Pre-generate transliterations for dictionary data.

Usage:
    python -m tools.bani.build --lexicon --prefixes
    python -m tools.bani.build --lexicon-only
    python -m tools.bani.build --prefixes-only
    python -m tools.bani.build --test  # Dry run
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Dict, Any, List, Optional
import sys
from pathlib import Path


from .apply import Transliterator, load_jsonc


def _engine(language: str) -> Transliterator:
    schema_path = Path(__file__).parent / "schemas" / f"{language}.json"
    return Transliterator(load_jsonc(schema_path))


def _guide(engine: Transliterator, hebrew: str, strongs: str = "") -> str:
    if not hebrew or not hebrew.strip():
        return ""
    return engine.transliterate_word(hebrew, strongs).get("guide", "")


def load_json_file(path: Path) -> Dict[str, Any]:
    """Load JSON file."""
    with path.open('r', encoding='utf-8') as f:
        return json.load(f)


def save_json_file(path: Path, data: Dict[str, Any]) -> None:
    """Save JSON file with proper formatting."""
    with path.open('w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def build_lexicon_transliterations(test_mode: bool = False, limit: Optional[int] = None) -> None:
    """Add transliteration_en/es to data/dict/lexicon/words.json"""
    print("Building lexicon transliterations...")

    lexicon_path = Path(__file__).parent.parent.parent / "data" / "dict" / "lexicon" / "words.json"

    if not lexicon_path.exists():
        print(f"Error: Lexicon file not found: {lexicon_path}")
        return

    # Load lexicon
    lexicon = load_json_file(lexicon_path)
    print(f"Loaded {len(lexicon)} lexicon entries")

    # Initialize transliterators
    en_transliterator = _engine("en")
    es_transliterator = _engine("es")

    # Process entries
    processed = 0
    for strongs_num, entry in lexicon.items():
        if limit and processed >= limit:
            break

        hebrew = entry.get('lemma', '')
        if not hebrew:
            continue

        # Generate transliterations
        translit_en = _guide(en_transliterator, hebrew, strongs_num)
        translit_es = _guide(es_transliterator, hebrew, strongs_num)

        # Add to entry
        entry['transliteration_en'] = translit_en
        entry['transliteration_es'] = translit_es

        processed += 1

        if processed % 1000 == 0:
            print(f"  Processed {processed} entries...")

    if test_mode:
        print(f"Test mode: Would process {processed} entries")
        return

    # Save back
    save_json_file(lexicon_path, lexicon)
    print(f"✓ Updated lexicon with transliterations: {lexicon_path}")


def build_prefix_transliterations(test_mode: bool = False) -> None:
    """Add transliteration_en/es to data/dict/prefixes/entries/*.json"""
    print("Building prefix transliterations...")

    prefixes_dir = Path(__file__).parent.parent.parent / "data" / "dict" / "prefixes" / "entries"

    if not prefixes_dir.exists():
        print(f"Error: Prefixes directory not found: {prefixes_dir}")
        return

    # Initialize transliterators
    en_transliterator = _engine("en")
    es_transliterator = _engine("es")

    # Process each prefix file
    prefix_files = list(prefixes_dir.glob("*.json"))
    print(f"Found {len(prefix_files)} prefix files")

    processed = 0
    for prefix_file in prefix_files:
        # Load prefix data
        prefix_data = load_json_file(prefix_file)

        hebrew = prefix_data.get('main_form', '')
        if not hebrew:
            continue

        # Generate transliterations
        translit_en = _guide(en_transliterator, hebrew, prefix_data.get('id', ''))
        translit_es = _guide(es_transliterator, hebrew, prefix_data.get('id', ''))

        # Add to prefix data
        prefix_data['transliteration_en'] = translit_en
        prefix_data['transliteration_es'] = translit_es

        if test_mode:
            print(f"  Test: {prefix_file.name} -> en:'{translit_en}' es:'{translit_es}'")
        else:
            # Save back
            save_json_file(prefix_file, prefix_data)

        processed += 1

    if test_mode:
        print(f"Test mode: Would process {processed} prefix files")
    else:
        print(f"✓ Updated {processed} prefix files with transliterations")


def main():
    parser = argparse.ArgumentParser(description="Pre-generate transliterations for dictionary data")
    parser.add_argument('--lexicon', action='store_true', help='Update lexicon transliterations')
    parser.add_argument('--prefixes', action='store_true', help='Update prefix transliterations')
    parser.add_argument('--lexicon-only', action='store_true', help='Update only lexicon')
    parser.add_argument('--prefixes-only', action='store_true', help='Update only prefixes')
    parser.add_argument('--test', action='store_true', help='Test mode (dry run, show what would be done)')
    parser.add_argument('--limit', type=int, help='Limit lexicon entries for testing')

    args = parser.parse_args()

    # Determine what to build
    do_lexicon = args.lexicon or args.lexicon_only
    do_prefixes = args.prefixes or args.prefixes_only

    if not (do_lexicon or do_prefixes):
        print("Error: Specify --lexicon, --prefixes, --lexicon-only, or --prefixes-only")
        return 1

    if args.lexicon_only and args.prefixes_only:
        print("Error: Cannot specify both --lexicon-only and --prefixes-only")
        return 1

    try:
        if do_lexicon:
            build_lexicon_transliterations(args.test, args.limit)

        if do_prefixes:
            build_prefix_transliterations(args.test)

        if args.test:
            print("✓ Test completed successfully")
        else:
            print("✓ Build completed successfully")

    except Exception as e:
        print(f"Error: {e}")
        return 1

    return 0


if __name__ == '__main__':
    sys.exit(main())