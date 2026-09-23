#!/usr/bin/env python3
"""
Sync translations from consolidated roots.json/words.json back to individual files.

This ensures that individual files in lexicon/roots/ and lexicon/words/ have
the same Spanish translations (text_es) as the consolidated files.

Use this before running transliteration or other operations that modify individual files.
"""

import json
from pathlib import Path
from typing import Dict, Optional

from .config import config


def sync_translations_to_individual_files(file_type: str = "both") -> None:
    """
    Sync translations from consolidated files to individual files.
    
    Args:
        file_type: "roots", "words", or "both"
    """
    if file_type in ("roots", "both"):
        print("📥 Syncing roots translations...")
        sync_file_type("roots")
    
    if file_type in ("words", "both"):
        print("📥 Syncing words translations...")
        sync_file_type("words")


def sync_file_type(file_type: str) -> None:
    """Sync translations for a specific file type."""
    # Load consolidated file
    consolidated_file = config.LEXICON_DIR / f"{file_type}.json"
    individual_dir = config.LEXICON_ROOTS_DIR if file_type == "roots" else config.LEXICON_WORDS_DIR
    
    if not consolidated_file.exists():
        print(f"❌ Consolidated file not found: {consolidated_file}")
        return
    
    print(f"   Loading {consolidated_file}...")
    with consolidated_file.open("r", encoding="utf-8") as f:
        consolidated_data = json.load(f)
    
    updated = 0
    skipped = 0
    errors = 0
    
    # Update each individual file
    for strong_number, consolidated_entry in consolidated_data.items():
        individual_file = individual_dir / f"{strong_number}.json"
        
        if not individual_file.exists():
            skipped += 1
            continue
        
        try:
            # Load individual file
            with individual_file.open("r", encoding="utf-8") as f:
                individual_entry = json.load(f)
            
            # Check if definitions need updating
            needs_update = False
            if "definitions" in consolidated_entry:
                # Sync definitions (including text_es)
                individual_entry["definitions"] = consolidated_entry["definitions"]
                needs_update = True
            
            # Sync other translation-related fields if present
            for field in ["root", "root_strong", "root_definitions"]:
                if field in consolidated_entry:
                    individual_entry[field] = consolidated_entry[field]
                    needs_update = True
            
            if needs_update:
                # Save back to individual file
                with individual_file.open("w", encoding="utf-8") as f:
                    json.dump(individual_entry, f, ensure_ascii=False, indent=2)
                updated += 1
        
        except Exception as e:
            print(f"   ❌ Error processing {strong_number}: {e}")
            errors += 1
    
    print(f"   ✅ Updated: {updated}")
    print(f"   ⏭️  Skipped (not found): {skipped}")
    if errors > 0:
        print(f"   ❌ Errors: {errors}")


def export_translations_backup(output_file: Optional[str] = None, verbose: bool = False) -> int:
    """
    Export all translations from consolidated files to a backup JSON file.
    
    This creates a translations.json file with the format:
    {
        "H1:1": {"es": "...", "pt": "..."},
        "H1:2": {"es": "..."},
        ...
    }
    
    Args:
        output_file: Path to output file (default: data/dict/lexicon/translations.json)
        verbose: Enable verbose output
        
    Returns:
        Exit code (0 for success)
    """
    if output_file is None:
        output_file_path = config.LEXICON_DIR / "translations.json"
    else:
        output_file_path = Path(output_file)
    
    translations = {}
    
    # Process roots.json
    roots_file = config.LEXICON_DIR / "roots.json"
    if roots_file.exists():
        if verbose:
            print(f"📖 Processing {roots_file}...")
        
        with roots_file.open("r", encoding="utf-8") as f:
            roots_data = json.load(f)
        
        for strong_number, entry in roots_data.items():
            if "definitions" in entry:
                for i, definition in enumerate(entry["definitions"]):
                    key = f"{strong_number}:{i+1}"
                    
                    # Extract translations
                    trans_entry = {}
                    if "text_es" in definition and definition["text_es"]:
                        trans_entry["es"] = definition["text_es"]
                    if "text_pt" in definition and definition["text_pt"]:
                        trans_entry["pt"] = definition["text_pt"]
                    
                    if trans_entry:
                        translations[key] = trans_entry
    
    # Process words.json
    words_file = config.LEXICON_DIR / "words.json"
    if words_file.exists():
        if verbose:
            print(f"📖 Processing {words_file}...")
        
        with words_file.open("r", encoding="utf-8") as f:
            words_data = json.load(f)
        
        for strong_number, entry in words_data.items():
            if "definitions" in entry:
                for i, definition in enumerate(entry["definitions"]):
                    key = f"{strong_number}:{i+1}"
                    
                    # Extract translations
                    trans_entry = {}
                    if "text_es" in definition and definition["text_es"]:
                        trans_entry["es"] = definition["text_es"]
                    if "text_pt" in definition and definition["text_pt"]:
                        trans_entry["pt"] = definition["text_pt"]
                    
                    if trans_entry:
                        translations[key] = trans_entry
    
    # Save translations backup
    output_file_path.parent.mkdir(parents=True, exist_ok=True)
    
    if verbose:
        print(f"💾 Saving to {output_file_path}...")
    
    with output_file_path.open("w", encoding="utf-8") as f:
        json.dump(translations, f, ensure_ascii=False, indent=2)
    
    print(f"✅ Exported {len(translations)} translation entries to {output_file_path}")
    
    return 0


def main():
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Sync translations from consolidated to individual lexicon files"
    )
    parser.add_argument(
        "--file",
        choices=["roots", "words", "both"],
        default="both",
        help="Which files to sync (default: both)"
    )
    
    args = parser.parse_args()
    
    print("="*60)
    print("SYNCING TRANSLATIONS TO INDIVIDUAL FILES")
    print("="*60)
    
    sync_translations_to_individual_files(args.file)
    
    print("="*60)
    print("✅ Sync complete!")
    print("="*60)


if __name__ == "__main__":
    main()
