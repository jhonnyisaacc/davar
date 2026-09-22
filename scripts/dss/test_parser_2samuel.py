#!/usr/bin/env python3
"""
Test parser on 2 Samuel to verify group variant handling
"""

import sys


from .xml_parsers import parse_dss_book
from .config import DSS_DIR

# Parse 2 Samuel
dss_file = DSS_DIR / "DSS_-_TC_2Samuel.xml"
print(f"Testing parser on: {dss_file}")
print("=" * 60)

if not dss_file.exists():
    print(f"ERROR: File not found: {dss_file}")
    sys.exit(1)

variants_data = parse_dss_book(dss_file)

# Check specific verses
target_verses = {
    (5, 3): "Should have note variant",
    (15, 1): "Should have group variant (ואבשלום יעשה לו)",
    (15, 2): "Should have group variant (והשכים אבשלום)",
    (20, 10): "Should have word variant"
}

print(f"\nTotal verses with variants: {len(variants_data)}")
print(f"\nChecking target verses:\n")

for chapter, verse in sorted(target_verses.keys()):
    expected = target_verses[(chapter, verse)]
    found = None
    
    for verse_data in variants_data:
        if verse_data['chapter'] == chapter and verse_data['verse'] == verse:
            found = verse_data
            break
    
    if found:
        print(f"✓ 2 Samuel {chapter}:{verse} - FOUND")
        print(f"  Expected: {expected}")
        print(f"  Variants: {len(found['variants'])}")
        for var in found['variants']:
            print(f"    - Position {var['position']}: {var['word'][:50]} (ID: {var['variant_id']})")
    else:
        print(f"✗ 2 Samuel {chapter}:{verse} - MISSING")
        print(f"  Expected: {expected}")
    print()

print("=" * 60)
