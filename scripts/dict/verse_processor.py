"""
Verse processing module.

Handles the creation of lightweight verse JSON files from Hebrew text data,
integrating morphological analysis and lexicon validation.
"""

import json
import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from pathlib import Path
from .config import config
from .book_mappings import BookMapper
from .strong_processor import StrongProcessor
from morphus_loader import MorphusLoader


class VerseProcessor:
    """Handles verse processing and generation."""

    def __init__(self, strong_processor: StrongProcessor, morphus_loader: MorphusLoader):
        self.strong_processor = strong_processor
        self.morphus_loader = morphus_loader

    def process_word(self, word_data: Dict, position: int, sense: Optional[str] = None) -> Dict:
        """
        Process a word from the oe/ file and convert it to verse format

        Args:
            word_data: Word data from oe/
            position: Position of the word in the verse
            sense: BDB sense as string from morphus (already normalized without decimals)

        Returns:
            Dict with lightweight verse format
        """
        # Extract Strong's number
        strong = word_data.get('strong') or word_data.get('lemma', '')
        strong_number = self.strong_processor.extract_strong_number(strong)

        # Get Hebrew text of the word (without separators)
        hebrew_text = word_data.get('text', '').replace('/', '')

        # Validate sense against lexicon
        if sense and strong_number:
            sense = self.strong_processor.validate_sense(strong_number, sense)
            # If validation fails, use null - don't use lexicon fallback

        # If morphus didn't provide a sense, use null
        # The lexicon lists all possible senses, but we need morphus to tell us which one applies

        return {
            "position": position,
            "hebrew": hebrew_text,
            "strong_number": strong_number,
            "sense": sense  # String without decimals: "1", "0", etc., or None
        }

    def generate_verse(self, book_key: str, chapter: int, verse: int, verse_data: Dict, morphus_senses: Optional[Dict] = None) -> Dict:
        """
        Generate a lightweight verse from oe/ data

        Args:
            book_key: Book key in BOOK_MAPPING
            chapter: Chapter number
            verse: Verse number
            verse_data: Verse data from oe/
            morphus_senses: BDB senses dictionary from morphus

        Returns:
            Dict with lightweight verse format
        """
        book_info = BookMapper.get_book_info(book_key)
        if not book_info:
            raise ValueError(f"Book not found in BOOK_MAPPING: {book_key}")

        # Get book_id (full English name in lowercase)
        book_id = BookMapper.get_book_id(book_info)
        reference = f"{book_id}.{chapter}.{verse}"

        # Get sense for this verse from morphus
        verse_senses = None
        if morphus_senses:
            verse_senses = morphus_senses.get(reference)

        # Get complete Hebrew text of the verse
        hebrew_text = verse_data.get('hebrew', '').replace('/', ' ')
        # Clean multiple spaces
        hebrew_text = re.sub(r'\s+', ' ', hebrew_text).strip()

        # Process words
        words_data = verse_data.get('words', [])
        words = []
        for i, word_data in enumerate(words_data, start=1):
            # Get sense for this position (already normalized without decimals)
            sense = None
            if verse_senses:
                sense = verse_senses.get(str(i))

            word = self.process_word(word_data, i, sense)
            words.append(word)

        # Build verse
        verse_obj = {
            "reference": reference,
            "book_id": book_id,
            "chapter": chapter,
            "verse": verse,
            "hebrew_text": hebrew_text,
            "words": words
        }

        return verse_obj

    def process_oe_file(self, book_key: str, chapter_file: Path, morphus_senses: Optional[Dict] = None) -> List[Dict]:
        """
        Process a chapter file from oe/ and generate verses

        Args:
            book_key: Book key in BOOK_MAPPING
            chapter_file: Path to the chapter JSON file
            morphus_senses: Dict with BDB senses from morphus

        Returns:
            List of generated verses
        """
        with open(chapter_file, 'r', encoding='utf-8') as f:
            verses_data = json.load(f)

        # Extract chapter number from filename
        chapter_num = int(chapter_file.stem)

        verses = []
        for verse_data in verses_data:
            verse_num = verse_data.get('verse', 0)
            if verse_num == 0:
                continue

            try:
                verse_obj = self.generate_verse(book_key, chapter_num, verse_num, verse_data, morphus_senses)
                verses.append(verse_obj)
            except Exception as e:
                print(f"Warning: Error processing verse {chapter_num}:{verse_num}: {e}")

        return verses

    def process_book(self, book_key: str, book_dir: Path, chapter_num: Optional[int] = None, verbose: bool = False) -> Tuple[int, int]:
        """
        Process chapters of a book

        Args:
            book_key: Book key in BOOK_MAPPING
            book_dir: Path to the book directory in oe/
            chapter_num: Optional chapter number to process only that chapter
            verbose: Enable verbose output

        Returns:
            Tuple (processed verses, errors)
        """
        book_info = BookMapper.get_book_info(book_key)
        if not book_info:
            print(f"Error: Book not found: {book_key}")
            return 0, 0

        if verbose:
            print(f"📖 Processing: {book_info['en']} ({book_key})")
        if chapter_num and verbose:
            print(f"  📄 Chapter: {chapter_num}")

        # Load BDB senses from morphus
        morphus_senses = self.morphus_loader.load_morphus_senses(book_key)
        if morphus_senses and verbose:
            print("  ✅ BDB senses loaded from morphus")
        elif verbose:
            print("  ⚠️  No BDB senses found")

        total_verses = 0
        total_errors = 0
        book_data = {}  # Consolidated book data

        # Get chapter files
        if chapter_num:
            # Process only the specified chapter
            chapter_file = book_dir / f"{chapter_num:02d}.json"
            if not chapter_file.exists():
                chapter_file = book_dir / f"{chapter_num}.json"
            chapter_files = [chapter_file] if chapter_file.exists() else []
        else:
            # Get all chapter files
            chapter_files = sorted(book_dir.glob("*.json"), key=lambda x: int(x.stem))

        # Create directory for the book if it doesn't exist
        book_id = BookMapper.get_book_id(book_info)
        output_book_dir = config.BOOKS_DIR / book_id
        output_book_dir.mkdir(exist_ok=True)

        for chapter_file in chapter_files:
            if not chapter_file.exists():
                if verbose:
                    print(f"  ⚠️  Chapter file not found: {chapter_file}")
                continue

            try:
                verses = self.process_oe_file(book_key, chapter_file, morphus_senses)

                # Accumulate verses in consolidated structure
                for verse in verses:
                    chapter = str(verse['chapter'])
                    verse_num = str(verse['verse'])

                    if chapter not in book_data:
                        book_data[chapter] = {}
                    book_data[chapter][verse_num] = verse

                    total_verses += 1

                if verses and verbose:
                    print(f"  ✅ Chapter {chapter_file.stem}: {len(verses)} verses")

            except Exception as e:
                print(f"  ❌ Error processing {chapter_file}: {e}")
                total_errors += 1

        return total_verses, total_errors, book_data
