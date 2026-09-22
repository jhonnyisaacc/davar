"""
Debug script to analyze matching failures and improve the algorithm.
"""

import json
import sys
from pathlib import Path
from collections import Counter

sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

from .dictionary_index import DictionaryIndex
from .normalizer import normalize_hebrew, strip_prefixes, extract_stem
from .config import PREFIX_MAP

def analyze_failures():
    """Analyze the failed matches from jude.json output."""
    
    # Load the output
    output_path = Path(__file__).parent.parent.parent.parent / "data" / "delitzsch" / "parsed" / "strongs" / "v2" / "jude.json"
    
    with open(output_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Collect failed words
    failed_words = []
    for chapter in data.get('chapters', []):
        for assignment in chapter.get('assignments', []):
            if assignment.get('type') == 'failed':
                failed_words.append({
                    'text': assignment['text'],
                    'prefixes': assignment['prefixes'],
                    'word_index': assignment['word_index']
                })
    
    print(f"Total failed words: {len(failed_words)}")
    print("\nAnalyzing failed words...\n")
    
    # Load dictionary
    dictionary = DictionaryIndex()
    dictionary.load()
    
    # Analyze each failure
    patterns = Counter()
    
    for word_data in failed_words[:30]:  # Analyze first 30
        text = word_data['text']
        prefixes = word_data['prefixes']
        
        # Normalize
        consonants = normalize_hebrew(text)
        stem = extract_stem(text, prefixes)
        
        print(f"Word: {text}")
        print(f"  Consonants: {consonants}")
        print(f"  Prefixes: {prefixes}")
        print(f"  Extracted stem: {stem}")
        
        # Check if stem is in dictionary
        entries = dictionary.lookup_by_lemma(stem)
        if entries:
            print(f"  ✓ Found in dictionary: {[e.strong for e in entries]}")
        else:
            print(f"  ✗ Not in dictionary")
            
            # Try to identify pattern
            if len(stem) >= 3:
                # Try removing common suffixes
                suffixes = ['ים', 'ות', 'י', 'ך', 'ה', 'ו', 'ת', 'יִם', 'וֹת']
                for suffix in suffixes:
                    if stem.endswith(suffix):
                        base = stem[:-len(suffix)]
                        base_entries = dictionary.lookup_by_lemma(base)
                        if base_entries:
                            print(f"    → Without suffix '{suffix}': {base} → {[e.strong for e in base_entries]}")
                            patterns[f'ends_with_{suffix}'] += 1
                            break
                else:
                    patterns['no_pattern_match'] += 1
        
        print()
    
    print("\nPattern Analysis:")
    for pattern, count in patterns.most_common():
        print(f"  {pattern}: {count}")


def test_specific_words():
    """Test specific problematic words."""
    
    dictionary = DictionaryIndex()
    dictionary.load()
    
    test_cases = [
        ("וַאֲהוּבִים", ["Hc"]),  # Should match H157
        ("וּשְׁמוּרִים", ["Hc"]),  # Should match H8104
        ("לָכֶם", ["Hl"]),  # Pronominal - skip
        ("הִתְגַּנְּבוּ", []),  # Hitpael form
        ("מִקְצָת", []),  # Noun form
        ("מְקֻדָּשִׁים", []),  # Pual participle
    ]
    
    print("Testing specific words:\n")
    
    for text, prefixes in test_cases:
        consonants = normalize_hebrew(text)
        stem = extract_stem(text, prefixes)
        
        print(f"Word: {text}")
        print(f"  Consonants: {consonants}")
        print(f"  Stem: {stem}")
        
        # Direct lookup
        entries = dictionary.lookup_by_lemma(stem)
        if entries:
            for e in entries[:3]:
                print(f"  → {e.strong}: {e.lemma} (root: {e.is_root})")
        else:
            print(f"  → No direct match")
        
        print()


if __name__ == '__main__':
    print("="*60)
    print("DEBUG: Analyzing matching failures")
    print("="*60)
    
    print("\n1. Testing specific words:\n")
    test_specific_words()
    
    print("\n2. Analyzing failure patterns:\n")
    analyze_failures()