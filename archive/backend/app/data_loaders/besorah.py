"""
Besorah (Delitzsch) data loader
Loads Hebrew text from Delitzsch parsed JSON files
"""

import os
from typing import Dict, List, Any, Optional
from pathlib import Path
from .base import DataLoader


class BesorahLoader(DataLoader):
    """Loader for Besorah Hebrew text from Delitzsch data"""

    def __init__(self, data_path: Optional[str] = None):
        super().__init__(data_path)
        self.delitzsch_path = self.data_path / "delitzsch" / "parsed"

    def get_book_chapters(self, book_name: str) -> List[int]:
        """Get list of available chapters for a book"""
        book_path = self.delitzsch_path / book_name
        if not book_path.exists():
            return []

        chapters = []
        for file_path in book_path.glob("*.json"):
            try:
                chapter_num = int(file_path.stem)
                chapters.append(chapter_num)
            except ValueError:
                continue
        return sorted(chapters)

    def load_chapter(self, book_name: str, chapter: int) -> List[Dict[str, Any]]:
        """Load all verses for a specific book chapter"""
        cache_key = f"delitzsch_{book_name}_{chapter}"
        if cache_key in self._cache:
            return self._cache[cache_key]

        file_path = f"delitzsch/parsed/{book_name}/{chapter}.json"
        try:
            chapter_data = self.load_json(file_path)
            # Delitzsch structure: [{"chapter": 1, "verses": [...]}]
            verses = chapter_data[0].get("verses", []) if chapter_data else []
            self._cache[cache_key] = verses
            return verses
        except (FileNotFoundError, IndexError, KeyError):
            return []

    def load_verse(self, book_name: str, chapter: int, verse: int) -> Optional[Dict[str, Any]]:
        """Load a specific verse"""
        verses = self.load_chapter(book_name, chapter)
        for v in verses:
            if v.get("verse") == verse:
                return v
        return None

    def get_available_books(self) -> List[str]:
        """Get list of all available Delitzsch books"""
        if not self.delitzsch_path.exists():
            return []

        books = []
        for item in self.delitzsch_path.iterdir():
            if item.is_dir() and not item.name.startswith('.'):
                books.append(item.name)
        return sorted(books)

    def get_books_metadata(self) -> List[Dict[str, Any]]:
        """Get metadata for all available Delitzsch books"""
        books = []
        available_books = self.get_available_books()

        for book_name in available_books:
            chapter_count = len(self.get_book_chapters(book_name))

            book_metadata = {
                'name': book_name,
                'total_chapters': chapter_count,
                'section': 'besorah'  # All Delitzsch books are in Besorah
            }
            books.append(book_metadata)

        return books

    def get_chapters(self, book_name: str) -> List[int]:
        """Get list of available chapters for a book"""
        return self.get_book_chapters(book_name)

    def get_verses(self, book_name: str, chapter: int) -> List[Dict[str, Any]]:
        """Load all verses for a specific book chapter"""
        return self.load_chapter(book_name, chapter)


# Global instance
besorah_loader = BesorahLoader()
