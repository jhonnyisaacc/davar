#!/usr/bin/env python3
"""
Book processing logic for extracting DSS differences
"""

from typing import Dict, Optional


from .xml_parsers import parse_dss_book, parse_wlc_book
from .notes_parser import extract_masoretic_dss_words, is_fragment_to_fragment_difference
from .config import DSS_DIR, WLC_DIR, BOOK_NAMES


class BookProcessor:
    """Processes a single book to extract DSS differences."""
    
    def __init__(self, notes: Dict[str, Dict]):
        """
        Initialize processor with parsed notes.
        
        Args:
            notes: Dictionary of variant notes from notes_parser
        """
        self.notes = notes
    
    def process_book(self, book_name: str) -> Optional[Dict]:
        """
        Process a single book to extract differences.
        
        Args:
            book_name: Name of the book (matching BOOK_NAMES keys)
            
        Returns:
            Book structure with differences, or None if no differences found
        """
        print(f"\n{'='*60}")
        print(f"Processing {book_name}")
        print(f"{'='*60}")
        
        dss_file = DSS_DIR / f"DSS_-_TC_{book_name}.xml"
        wlc_file = WLC_DIR / f"{book_name}.xml"
        
        if not dss_file.exists():
            print(f"DSS file not found: {dss_file}")
            return None
        
        if not wlc_file.exists():
            print(f"WLC file not found: {wlc_file}")
            return None
        
        # Parse both files
        dss_data = parse_dss_book(dss_file)
        wlc_data = parse_wlc_book(wlc_file)
        
        # Build book structure
        book_structure = {
            'name': BOOK_NAMES.get(book_name, book_name),
            'chapters': {}
        }
        
        for dss_verse in dss_data:
            self._process_verse(dss_verse, wlc_data, book_structure)
        
        total_diffs = self._count_differences(book_structure)
        print(f"Found {total_diffs} differences in {book_name}")
        
        return book_structure if total_diffs > 0 else None
    
    def _process_verse(
        self, 
        dss_verse: Dict, 
        wlc_data: Dict, 
        book_structure: Dict
    ):
        """Process a single verse and add to book structure."""
        chapter = dss_verse['chapter']
        verse = dss_verse['verse']
        
        # Get corresponding Masoretic text
        key = (chapter, verse)
        wlc_verse = wlc_data.get(key, {})
        
        # Initialize chapter if needed
        if str(chapter) not in book_structure['chapters']:
            book_structure['chapters'][str(chapter)] = {'verses': {}}
        
        # Build differences array
        differences = []
        for var in dss_verse['variants']:
            diff = self._process_variant(var, wlc_verse)
            # Only append if it passed the fragment-to-fragment filter
            if diff is not None:
                differences.append(diff)
        
        # Only add verse if it has valid differences
        if not differences:
            return
        
        # Add verse data
        book_structure['chapters'][str(chapter)]['verses'][str(verse)] = {
            'masoretic_text': wlc_verse.get('text', ''),
            'dss_text': dss_verse['dss_text'],
            'differences': differences
        }
    
    def _process_variant(self, var: Dict, wlc_verse: Dict) -> Optional[Dict]:
        """Process a single variant and extract word differences."""
        # Try to get note data if available
        note_data = None
        commentary = ""
        if var['variant_id']:
            note_data = self.notes.get(var['variant_id'])
            if note_data:
                commentary = note_data['commentary']
        
        # FILTER: Only include fragment-to-fragment differences
        # (those mentioning 2+ different DSS manuscripts)
        if not is_fragment_to_fragment_difference(commentary):
            return None
        
        # Extract Masoretic and DSS words from commentary
        masoretic_word, dss_word = extract_masoretic_dss_words(
            note_data, 
            var['word']
        )
        
        # Fallback to position-based matching if extraction failed
        if not masoretic_word:
            if wlc_verse and 'words' in wlc_verse:
                pos = var['position'] - 1
                if 0 <= pos < len(wlc_verse['words']):
                    masoretic_word = wlc_verse['words'][pos]
        
        return {
            'position': var['position'],
            'masoretic_word': masoretic_word or var['word'],
            'dss_word': dss_word,
            'commentary': commentary
        }
    
    @staticmethod
    def _count_differences(book_structure: Dict) -> int:
        """Count total differences in a book structure."""
        return sum(
            len(verse_data['differences'])
            for ch in book_structure['chapters'].values()
            for verse_data in ch['verses'].values()
        )
