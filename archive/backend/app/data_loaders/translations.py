"""
Translation data loader
Loads TTH (Spanish), TS2009 (English), and BES (Spanish fallback) translations
"""

import logging
from typing import Dict, List, Any, Optional
from pathlib import Path
from .base import DataLoader

logger = logging.getLogger(__name__)

TTH_BOOK_MAPPING = {
    # TORAH
    "Genesis": "bereshit",
    "Exodus": "shemot",
    "Leviticus": "vaikra",
    "Numbers": "bamidbar",
    "Deuteronomy": "devarim",
    # NEVIIM (Former Prophets)
    "Joshua": "iehoshua",
    "Judges": "shoftim",
    "Samuel1": "shemuel_alef",
    "Samuel2": "shemuel_bet",
    "Kings1": "melajim_alef",
    "Kings2": "melajim_bet",
    # NEVIIM (Latter Prophets)
    "Isaiah": "ieshaiahu",
    "Jeremiah": "irmeiahu",
    "Ezekiel": "iejezkel",
    # NEVIIM (The Twelve)
    "Hosea": "hoshea",
    "Joel": "ioel",
    "Amos": "amos",
    "Jonah": "ionah",
    "Micah": "micah",
    "Nahum": "najum",
    "Habakkuk": "jabakuk",
    "Zephaniah": "tzefaniah",
    "Haggai": "jagai",
    "Zechariah": "zejariah",
    "Malachi": "malaji",
    # KETUVIM (partial in tth)
    "Psalms": "tehilim",
    "Proverbs": "mishlei",
    # BESORAH (tth format)
    "Matthew": "matityahu",
    "Mark": "markos",
    "Luke": "lukas",
    "John": "iojanan",
    "Acts": "maasei_hashlijim",
    "Romans": "romanos",
    "Revelation": "sodot",
}

TS2009_BOOK_MAPPING = {
    # TORAH
    "Genesis": "bereshit",
    "Exodus": "shemoth",
    "Leviticus": "wayyiqra",
    "Numbers": "bemidbar",
    "Deuteronomy": "debarim",
    # NEVIIM (Former Prophets)
    "Joshua": "yehoshua",
    "Judges": "shophetim",
    "Samuel1": "samuel_1",
    "Samuel2": "samuel_2",
    "Kings1": "kings_1",
    "Kings2": "kings_2",
    # NEVIIM (Latter Prophets)
    "Isaiah": "yeshayahu",
    "Jeremiah": "yirmeyahu",
    "Ezekiel": "yehezqel",
    # NEVIIM (The Twelve)
    "Hosea": "hosea",
    "Joel": "yoel",
    "Amos": "amos",
    "Obadiah": "obadyah",
    "Jonah": "yonah",
    "Micah": "micah",
    "Nahum": "nahum",
    "Habakkuk": "habakkuk",
    "Zephaniah": "zephaniah",
    "Haggai": "haggai",
    "Zechariah": "zechariah",
    "Malachi": "malachi",
    # KETUVIM
    "Psalms": "tehillim",
    "Proverbs": "mishlei",
    "Job": "iyob",
    "SongOfSolomon": "shir_hashirim",
    "Ruth": "ruth",
    "Lamentations": "ekah",
    "Ecclesiastes": "qoheleth",
    "Esther": "ester",
    "Daniel": "daniel",
    "Ezra": "ezra",
    "Nehemiah": "nehemyah",
    "Chronicles1": "chronicles_1",
    "Chronicles2": "chronicles_2",
    # BESORAH (New Testament)
    "Matthew": "mattithyahu",
    "Mark": "marqos",
    "Luke": "lugqas",
    "John": "yohanan",
    "Acts": "maasei",
    "Romans": "romiyim",
    "Corinthians1": "corinthians_1",
    "Corinthians2": "corinthians_2",
    "Galatians": "galatiyim",
    "Ephesians": "ephsiyim",
    "Philippians": "pilipiyim",
    "Colossians": "qolasim",
    "Thessalonians1": "thessalonians_1",
    "Thessalonians2": "thessalonians_2",
    "Timothy1": "timothy_1",
    "Timothy2": "timothy_2",
    "Titus": "titos",
    "Philemon": "pileymon",
    "Hebrews": "ibrim",
    "James": "yaaqob",
    "Peter1": "peter_1",
    "Peter2": "peter_2",
    "John1": "john_1",
    "John2": "john_2",
    "John3": "john_3",
    "Jude": "yehudah",
    "Revelation": "hazon",
}

BES_BOOK_MAPPING = {
    # TORAH
    "Genesis": "genesis",
    "Exodus": "exodus", 
    "Leviticus": "leviticus",
    "Numbers": "numbers",
    "Deuteronomy": "deuteronomy",
    # NEVIIM (Former Prophets)
    "Joshua": "joshua",
    "Judges": "judges",
    "Samuel1": "samuel1",
    "Samuel2": "samuel2",
    "Kings1": "kings1",
    "Kings2": "kings2",
    # NEVIIM (Latter Prophets)
    "Isaiah": "isaiah",
    "Jeremiah": "jeremiah",
    "Ezekiel": "ezekiel",
    # NEVIIM (The Twelve)
    "Hosea": "hosea",
    "Joel": "joel",
    "Amos": "amos",
    "Obadiah": "obadiah",
    "Jonah": "jonah",
    "Micah": "micah",
    "Nahum": "nahum",
    "Habakkuk": "habakkuk",
    "Zephaniah": "zephaniah",
    "Haggai": "haggai",
    "Zechariah": "zechariah",
    "Malachi": "malachi",
    # KETUVIM
    "Psalms": "psalms",
    "Proverbs": "proverbs",
    "Job": "job",
    "SongOfSolomon": "songofsolomon",
    "Ruth": "ruth",
    "Lamentations": "lamentations",
    "Ecclesiastes": "ecclesiastes",
    "Esther": "esther",
    "Daniel": "daniel",
    "Ezra": "ezra",
    "Nehemiah": "nehemiah",
    "Chronicles1": "chronicles1",
    "Chronicles2": "chronicles2",
    # BESORAH (New Testament)
    "Matthew": "matthew",
    "Mark": "mark",
    "Luke": "luke",
    "John": "john",
    "Acts": "acts",
    "Romans": "romans",
    "Corinthians1": "corinthians1",
    "Corinthians2": "corinthians2",
    "Galatians": "galatians",
    "Ephesians": "ephesians",
    "Philippians": "philippians",
    "Colossians": "colossians",
    "Thessalonians1": "thessalonians1",
    "Thessalonians2": "thessalonians2",
    "Timothy1": "timothy1",
    "Timothy2": "timothy2",
    "Titus": "titus",
    "Philemon": "philemon",
    "Hebrews": "hebrews",
    "James": "james",
    "Peter1": "peter1",
    "Peter2": "peter2",
    "John1": "john1",
    "John2": "john2",
    "John3": "john3",
    "Jude": "jude",
    "Revelation": "revelation",
}


class TranslationLoader(DataLoader):
    """Loader for translation data (TTH Spanish, TS2009 English, BES Spanish fallback)"""

    def __init__(self, data_path: Optional[str] = None):
        super().__init__(data_path)
        self.tth_path = self.data_path / "tth" / "json"
        self.ts2009_path = self.data_path / "ts2009"
        self.bes_path = self.data_path / "bes" / "json"

    def load_tth_verse(self, book_name: str, chapter: int, verse: int, language: str = "es") -> Optional[dict]:
        """Load TTH translation for a specific verse"""
        # TTH (tth) uses transliterated book names, map from English
        tth_book_name = self._english_to_tth_book_name(book_name)
        if not tth_book_name:
            return None

        cache_key = f"tth_{tth_book_name}_{chapter}_{verse}_{language}"
        if cache_key in self._cache:
            return self._cache[cache_key]

        # Load entire book JSON (tth format)
        file_path = f"tth/json/{tth_book_name}.json"
        try:
            book_data = self.load_json(file_path)
            if "chapters" not in book_data:
                return None

            # Find the requested chapter and verse
            for chapter_data in book_data["chapters"]:
                if chapter_data.get("chapter") == chapter:
                    for verse_data in chapter_data.get("verses", []):
                        if verse_data.get("verse") == verse:
                            translation = verse_data.get("tth", "")
                            footnotes = verse_data.get("footnotes", [])
                            result = {
                                "translation": translation,
                                "footnotes": footnotes
                            }
                            self._cache[cache_key] = result
                            return result
        except FileNotFoundError:
            logger.warning(f"TTH translation file not found for {book_name} (mapped to: {tth_book_name})")
        except KeyError as e:
            logger.warning(f"TTH translation structure error for {book_name} chapter {chapter} verse {verse}: {e}")

        self._cache[cache_key] = None
        return None

    def load_ts2009_verse(self, book_name: str, chapter: int, verse: int) -> Optional[dict]:
        """Load TS2009 English translation for a specific verse"""
        # TS2009 uses Hebrew book names
        hebrew_book_name = self._english_to_hebrew_book_name(book_name)
        if not hebrew_book_name:
            return None

        # Cache key for the entire book data
        book_cache_key = f"ts2009_book_{hebrew_book_name}"
        if book_cache_key not in self._cache:
            # Load and cache the entire book
            try:
                book_data = self.load_json(f"ts2009/{hebrew_book_name}.json")
                # Build an index: {chapter: {verse: {translation, footnotes}}}
                book_index = {}
                if "chapters" in book_data:
                    for chapter_data in book_data["chapters"]:
                        chap_num = chapter_data.get("number")
                        if chap_num not in book_index:
                            book_index[chap_num] = {}
                        for verse_data in chapter_data.get("verses", []):
                            verse_num = verse_data.get("number")
                            book_index[chap_num][verse_num] = {
                                "translation": verse_data.get("text", ""),
                                "footnotes": verse_data.get("footnotes", [])
                            }
                self._cache[book_cache_key] = book_index
            except FileNotFoundError:
                logger.warning(f"TS2009 translation file not found for {book_name} (mapped to: {hebrew_book_name}.json)")
                self._cache[book_cache_key] = None
            except KeyError as e:
                logger.warning(f"TS2009 translation structure error for {book_name}: {e}")
                self._cache[book_cache_key] = None

        book_index = self._cache[book_cache_key]
        if book_index is None:
            return None

        # Now lookup the specific verse
        cache_key = f"ts2009_{hebrew_book_name}_{chapter}_{verse}"
        if cache_key in self._cache:
            return self._cache[cache_key]

        result = book_index.get(chapter, {}).get(verse)
        self._cache[cache_key] = result
        return result

    def load_bes_verse(self, book_name: str, chapter: int, verse: int) -> Optional[str]:
        """Load BES (Biblia en Español Sencillo) translation for a specific verse"""
        bes_book_name = self._english_to_bes_book_name(book_name)
        if not bes_book_name:
            return None

        # Cache key for the entire book data
        book_cache_key = f"bes_book_{bes_book_name}"
        if book_cache_key not in self._cache:
            # Load and cache the entire book
            try:
                book_data = self.load_json(f"bes/json/{bes_book_name}.json")
                # Build an index: {chapter: {verse: text}}
                book_index = {}
                if "chapters" in book_data:
                    for chapter_data in book_data["chapters"]:
                        chap_num = chapter_data.get("chapter")
                        if chap_num not in book_index:
                            book_index[chap_num] = {}
                        for verse_data in chapter_data.get("verses", []):
                            verse_num = verse_data.get("verse")
                            text = verse_data.get("bes", "")
                            book_index[chap_num][verse_num] = text
                self._cache[book_cache_key] = book_index
            except FileNotFoundError:
                logger.warning(f"BES translation file not found for {book_name} (mapped to: {bes_book_name})")
                self._cache[book_cache_key] = None
            except KeyError as e:
                logger.warning(f"BES translation structure error for {book_name}: {e}")
                self._cache[book_cache_key] = None

        book_index = self._cache[book_cache_key]
        if book_index is None:
            return None

        # Now lookup the specific verse
        cache_key = f"bes_{bes_book_name}_{chapter}_{verse}"
        if cache_key in self._cache:
            return self._cache[cache_key]

        translation = book_index.get(chapter, {}).get(verse)
        self._cache[cache_key] = translation
        return translation

    def get_translation(self, book_name: str, chapter: int, verse: int, language: str) -> Optional[dict]:
        """Get translation for a verse in specified language"""
        if language.lower() == "es":
            # Try TTH first
            tth_result = self.load_tth_verse(book_name, chapter, verse, language)
            if tth_result and tth_result.get("translation"):
                return {
                    "translation": tth_result["translation"],
                    "footnotes": tth_result.get("footnotes", []),
                    "source": "tth"
                }
            
            # Fall back to BES if TTH is not available
            bes_translation = self.load_bes_verse(book_name, chapter, verse)
            if bes_translation:
                return {
                    "translation": bes_translation,
                    "footnotes": [],  # BES doesn't have footnotes
                    "source": "bes"
                }
            
            return None
        elif language.lower() == "en":
            result = self.load_ts2009_verse(book_name, chapter, verse)
            if result:
                return {
                    "translation": result["translation"],
                    "footnotes": result.get("footnotes", []),
                    "source": "ts2009"
                }
            return None
        return None

    def _english_to_hebrew_book_name(self, english_name: str) -> Optional[str]:
        """Map English book names to Hebrew names used in translation files"""
        return TS2009_BOOK_MAPPING.get(english_name)

    def _english_to_tth_book_name(self, english_name: str) -> Optional[str]:
        """Map English book names to TTH (tth) JSON filenames"""
        return TTH_BOOK_MAPPING.get(english_name)

    def _english_to_bes_book_name(self, english_name: str) -> Optional[str]:
        """Map English book names to BES JSON filenames"""
        return BES_BOOK_MAPPING.get(english_name)


# Global instance
translation_loader = TranslationLoader()
