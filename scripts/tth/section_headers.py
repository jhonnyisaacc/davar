#!/usr/bin/env python3
"""
Detect Section Headers in JSON Verses
====================================

Scans all TTH2 JSON files to detect section headers/subtitles that are incorrectly
included in verse text instead of being filtered out.

Section headers appear as <em>Title</em> at the end of verses, like:
<em>Anuncio del nacimiento de Iojanán</em>

This script identifies these issues so we can fix the markdown processing.
"""

import json
import re
from pathlib import Path
from typing import Dict, List, Tuple

try:
    from .patterns import SECTION_HEADER_PATTERN
except ImportError:
    from patterns import SECTION_HEADER_PATTERN


def detect_section_headers_in_json(json_file: Path) -> List[Tuple[int, int, str]]:
    """
    Scan a single JSON file for section headers in verse text.

    Returns list of tuples: (chapter, verse, detected_header)
    """
    issues = []

    try:
        with open(json_file, 'r', encoding='utf-8') as f:
            data = json.load(f)

        if 'chapters' not in data:
            return issues

        for chapter in data['chapters']:
            chapter_num = chapter.get('chapter', 0)
            for verse in chapter.get('verses', []):
                verse_num = verse.get('verse', 0)
                verse_text = verse.get('tth', '')

                # Look for <em> tags at the end of verses that look like section headers
                # Pattern: text <em>Title-like phrase</em> at end of verse
                end_pattern = r'(.+?)\s*<em>([^<]+)</em>\s*$'
                match = re.search(end_pattern, verse_text.strip())

                if match:
                    potential_header = match.group(2).strip()

                    # Skip if it's too long (likely legitimate verse content)
                    if len(potential_header.split()) > 10:
                        continue

                    # Skip if it doesn't start with capital letter (likely not a title)
                    if not potential_header[0].isupper():
                        continue

                    # Check for section header indicators - be more restrictive
                    title_indicators = [
                        'anuncio', 'nacimiento', 'visita', 'profecía', 'crecimiento',
                        'proclamación', 'inmersión', 'genealogía', 'tentación',
                        'enseña', 'sanación', 'llamado', 'pregunta', 'advertencia',
                        'parábola', 'emisión', 'regreso', 'reino', 'juicio',
                        'bautismo', 'crucifixión', 'resurrección', 'ascensión',
                        'introducción', 'saludo', 'justicia', 'venida', 'oración',
                        'despedida', 'firmes', 'deber', 'trabajar', 'advertencia',
                        'ansiedad', 'siervos', 'vigilantes', 'fiel', 'infiel',
                        'división', 'discuten', 'humillado', 'humillación',
                        'entregado', 'estrellas', 'proclamación', 'monte', 'sal',
                        'luz', 'adulterio', 'juramento', 'venganza', 'otros',
                        'leproso', 'ciegos', 'doce', 'discípulos', 'manda',
                        'habla', 'parábolas', 'multitudes', 'sembrador', 'propósito',
                        'cizaña', 'mostaza', 'levadura', 'tesoro', 'piedras',
                        'preciosas', 'red', 'mar', 'sabio', 'natzrat',
                        'oveja', 'perdida', 'deudores', 'divorcio', 'obreros',
                        'viña', 'tercera', 'vez', 'jerijó', 'boda',
                        'higuera', 'siervo', 'vírgenes', 'monedas', 'oro',
                        'final', 'cruz', 'ladrones', 'sepultura', 'levantó',
                        'aparición', 'dos', 'sube', 'cielos', 'presenta',
                        'santuario', 'poder', 'echa', 'mercaderes', 'casa',
                        'יהוה', 'piedra', 'esquina', 'cabeza', 'edificada',
                        'desierto', 'babilonia', 'reconstrucción', 'templo', 'palacio'
                    ]

                    # More restrictive: must start with a section header word
                    section_starters = [
                        'anuncio', 'nacimiento', 'visita', 'profecía', 'crecimiento',
                        'proclamación', 'inmersión', 'genealogía', 'tentación',
                        'enseña', 'sanación', 'llamado', 'advertencia',
                        'parábola', 'regreso', 'reino', 'juicio',
                        'bautismo', 'crucifixión', 'resurrección', 'ascensión',
                        'introducción', 'saludo', 'venida', 'oración',
                        'despedida', 'firmes', 'trabajar', 'ansiedad',
                        'vigilantes', 'división', 'discuten', 'humillado',
                        'proclamación', 'monte', 'luz', 'juramento',
                        'venganza', 'ciegos', 'discípulos', 'parábolas',
                        'multitudes', 'sembrador', 'cizaña', 'mostaza',
                        'levadura', 'tesoro', 'piedras', 'preciosas',
                        'red', 'mar', 'oveja', 'perdida', 'deudores',
                        'divorcio', 'obreros', 'viña', 'boda',
                        'higuera', 'vírgenes', 'monedas', 'cruz',
                        'ladrones', 'sepultura', 'aparición', 'cielos',
                        'mercaderes', 'esquina', 'desierto', 'babilonia',
                        'reconstrucción', 'templo', 'palacio'
                    ]

                    header_lower = potential_header.lower()
                    # Must start with a section header word and include a non-starter indicator.
                    starts_with_section = any(header_lower.startswith(
                        starter) for starter in section_starters)
                    non_starter_indicators = [
                        indicator
                        for indicator in title_indicators
                        if indicator not in section_starters
                    ]
                    contains_indicator = any(
                        indicator in header_lower
                        for indicator in non_starter_indicators
                    )

                    if starts_with_section and contains_indicator:
                        issues.append(
                            (chapter_num, verse_num, potential_header))

    except Exception as e:
        print(f"Error processing {json_file}: {e}")

    return issues


def scan_all_json_files(json_dir: Path) -> Dict[str, List[Tuple[int, int, str]]]:
    """
    Scan all JSON files and return issues found.
    """
    json_files = sorted(json_dir.glob('*.json'))
    all_issues = {}

    print(
        f"Scanning {len(json_files)} JSON files for section headers in verses...")

    for json_file in json_files:
        book_name = json_file.stem
        issues = detect_section_headers_in_json(json_file)

        if issues:
            all_issues[book_name] = issues
            print(f"  {book_name}: {len(issues)} issues found")

    return all_issues


def generate_report(all_issues: Dict[str, List[Tuple[int, int, str]]]):
    """
    Generate a comprehensive report of all issues found.
    """
    print("\n" + "="*80)
    print("SECTION HEADER DETECTION REPORT")
    print("="*80)

    total_books = len(all_issues)
    total_issues = sum(len(issues) for issues in all_issues.values())

    print(f"\nTotal books with issues: {total_books}")
    print(f"Total section headers found in verses: {total_issues}")

    if total_issues == 0:
        print("\n✅ No section headers found in verse text!")
        return

    print(f"\n📋 Breakdown by book:")

    for book_name, issues in sorted(all_issues.items()):
        print(f"\n{book_name.upper()} ({len(issues)} issues):")
        for chapter, verse, header in issues:
            print(f"  Chapter {chapter}, Verse {verse}: '{header}'")

    print(f"\n🔍 Analysis:")
    print(f"- These appear to be section headers that should be separate from verse text")
    print(f"- They are currently appended to the end of verses during markdown processing")
    print(f"- The fix should filter out standalone '*Title*' lines before verse concatenation")


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(
        description='Detect section headers in TTH2 JSON verses')
    parser.add_argument(
        '--json-dir',
        type=Path,
        default=Path(__file__).parent.parent.parent /
        "data" / "tth" / "json",
        help='Path to JSON directory'
    )
    parser.add_argument(
        '--book',
        help='Check only specific book (e.g., lukas)'
    )

    args = parser.parse_args()

    if args.book:
        # Check single book
        json_file = args.json_dir / f"{args.book}.json"
        if not json_file.exists():
            print(f"❌ Book not found: {json_file}")
            return

        print(f"Checking {args.book}...")
        issues = detect_section_headers_in_json(json_file)

        if issues:
            print(f"Found {len(issues)} section headers in verses:")
            for chapter, verse, header in issues:
                print(f"  Chapter {chapter}, Verse {verse}: '{header}'")
        else:
            print("✅ No section headers found in verse text")
    else:
        # Check all books
        all_issues = scan_all_json_files(args.json_dir)
        generate_report(all_issues)


if __name__ == '__main__':
    main()
