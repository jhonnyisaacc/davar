"""
Processor module for Delitzsch Strong's assignment.

Handles loading, processing, and updating Delitzsch parsed JSON files
with Strong's number assignments.
"""

import asyncio
import json
import logging
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple


from scripts.dict.utils import load_json, save_json, ProgressTracker, create_backup
from .pronominal_lookup import lookup_pronominal, is_pronominal_form


logger = logging.getLogger(__name__)

# Prefix code → Hebrew consonant (for display in prompts)
_PREFIX_CONSONANT = {'Hl': 'ל', 'Hb': 'ב', 'Hk': 'כ', 'Hc': 'ו', 'Hd': 'ה'}


class StrongsProcessor:
    """Processes Delitzsch parsed JSON files for Strong's assignment."""

    def __init__(self):
        """Initialize the processor."""
        from .config import validate_grok_api_key, PARSED_DIR

        if not validate_grok_api_key():
            raise ValueError("XAI_API_KEY not set. Please check .env file.")

        # Initialize Grok assigner
        from .assigner import GrokStrongsAssigner
        self.assigner = GrokStrongsAssigner()

        # Build corpus index for auto-assignment and hints
        from .corpus_lookup import CorpusLookup
        self.corpus = CorpusLookup()
        self.corpus.build(PARSED_DIR)

    @staticmethod
    def _strip_prefixes(strong: Optional[str]) -> Optional[str]:
        """Strip prefix codes from a Strong's value like 'Hl/Hk/H3442' -> 'H3442'."""
        if not strong:
            return None
        parts = strong.split('/')
        for part in reversed(parts):
            if part and part[0] == 'H' and len(part) > 1 and part[1:2].isdigit():
                return part
        return strong

    def scan_book(self, book_name: str) -> List[Dict[str, Any]]:
        """
        Scan a book for verses containing words that need Strong's assignment.

        Args:
            book_name: Name of the book (e.g., 'matthew')

        Returns:
            List of verse-group dicts, each with verse metadata and null words.
        """
        from .config import PARSED_DIR

        book_dir = PARSED_DIR / book_name
        if not book_dir.exists():
            raise FileNotFoundError(f"Book directory not found: {book_dir}")

        verse_groups = []
        total_null = 0

        chapter_files = sorted(book_dir.glob("*.json"))
        for chapter_file in chapter_files:
            try:
                chapter_data = load_json(chapter_file)
                chapter_num = int(chapter_file.stem)

                for verse_data in chapter_data[0]['verses']:
                    verse_num = verse_data['verse']
                    verse_words = verse_data['words']

                    null_indices = [i for i, w in enumerate(
                        verse_words) if w.get('strong') is None]
                    if not null_indices:
                        continue

                    # Build annotated verse: known words get [H####], unknown get <<<word[prefixes]>>>
                    annotated_parts: List[str] = []
                    for i, w in enumerate(verse_words):
                        w_text = w.get('text', '')
                        if i in null_indices:
                            raw_pfx = w.get('prefixes', []) or []
                            pfx_list: List[str] = [
                                p for p in raw_pfx if isinstance(p, str)]
                            if pfx_list:
                                consonants: List[str] = [
                                    _PREFIX_CONSONANT.get(p, p) for p in pfx_list]
                                pfx_str = f"[pfx:{','.join(consonants)}]"
                            else:
                                pfx_str = ''
                            annotated_parts.append(f"<<<{w_text}{pfx_str}>>>")
                        else:
                            clean = self._strip_prefixes(w.get('strong'))
                            if clean:
                                annotated_parts.append(f"{w_text}[{clean}]")
                            else:
                                annotated_parts.append(w_text)
                    annotated_verse = ' '.join(annotated_parts)

                    null_words = []
                    pronominal_auto_assigned = 0
                    for i in null_indices:
                        w = verse_words[i]
                        prefixes = w.get('prefixes', [])

                        # First check if this is a pronominal form (preposition + suffix)
                        # Note: lookup_pronominal now returns None since Hebrew pronominal forms
                        # don't have separate Strong's numbers - let API handle them correctly
                        pronominal_strong = lookup_pronominal(
                            w['text'], prefixes)
                        if pronominal_strong is not None:
                            # Only auto-assign if we have a valid Strong's number
                            null_words.append({
                                'book': book_name,
                                'chapter': chapter_num,
                                'verse_num': verse_num,
                                'word_index': i,
                                'text': w['text'],
                                'prefixes': prefixes,
                                'possible_proper_name': w.get('possible_proper_name', False),
                                'annotated_verse': annotated_verse,
                                'corpus_strong': pronominal_strong,  # Use pronominal strong
                                'corpus_count': 999,                  # High count to mark as reliable
                                'corpus_auto': True,                  # Always auto-assign
                                'pronominal_form': True,              # Mark as pronominal
                            })
                            pronominal_auto_assigned += 1
                            continue

                        corpus_strong, corpus_count, is_auto = self.corpus.lookup(
                            w['text'], prefixes
                        )
                        null_words.append({
                            'book': book_name,
                            'chapter': chapter_num,
                            'verse_num': verse_num,
                            'word_index': i,
                            'text': w['text'],
                            'prefixes': prefixes,
                            'possible_proper_name': w.get('possible_proper_name', False),
                            'annotated_verse': annotated_verse,
                            'corpus_strong': corpus_strong,       # best candidate or None
                            'corpus_count': corpus_count,         # how many times seen
                            'corpus_auto': is_auto,               # True → skip API
                        })

                    if pronominal_auto_assigned > 0:
                        logger.debug(
                            f"Auto-assigned {pronominal_auto_assigned} pronominal forms in {book_name} {chapter_num}:{verse_num}")

                    verse_groups.append({
                        'chapter': chapter_num,
                        'verse_num': verse_num,
                        'verse_key': f"{chapter_num}:{verse_num}",
                        'annotated_verse': annotated_verse,
                        'null_words': null_words,
                    })
                    total_null += len(null_indices)

            except Exception as e:
                logger.error(f"Error scanning {chapter_file}: {e}")
                continue

        logger.info(
            f"Found {total_null} words across {len(verse_groups)} verses needing assignment in {book_name}")
        return verse_groups

    def _checkpoint_path(self, book_name: str) -> Path:
        """Get checkpoint file path for a book."""
        from .config import OUTPUT_DIR
        return OUTPUT_DIR / f"{book_name}.checkpoint.json"

    def _load_checkpoint(self, book_name: str) -> Dict[str, List]:
        """Load checkpoint data, returning {verse_key: assignments} or {}."""
        cp_path = self._checkpoint_path(book_name)
        if not cp_path.exists():
            return {}
        try:
            data = load_json(cp_path)
            return {str(k): v for k, v in data.items()}
        except Exception as e:
            logger.warning(f"Could not load checkpoint for {book_name}: {e}")
            return {}

    def _save_checkpoint(self, book_name: str, results: Dict[str, List]) -> None:
        """Persist checkpoint data after each completed verse."""
        from .config import OUTPUT_DIR
        cp_path = self._checkpoint_path(book_name)
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        try:
            save_json(results, cp_path)
            logger.debug(
                f"Checkpoint saved for {book_name} ({len(results)} verses)")
        except Exception as e:
            logger.warning(f"Could not save checkpoint for {book_name}: {e}")

    def _clear_checkpoint(self, book_name: str) -> None:
        """Delete checkpoint file after successful completion."""
        cp_path = self._checkpoint_path(book_name)
        if cp_path.exists():
            cp_path.unlink()
            logger.debug(f"Cleared checkpoint for {book_name}")

    async def _run_verses_async(
        self,
        book_name: str,
        verse_groups: List[Dict[str, Any]]
    ) -> Dict[str, List]:
        """Run all verse-level API calls concurrently (MAX_CONCURRENT limit) with checkpoint support."""
        from .config import MAX_CONCURRENT

        results = self._load_checkpoint(book_name)

        # Handle pronominal forms that don't need API calls
        for vg in verse_groups:
            verse_key = vg['verse_key']
            if verse_key in results:
                continue

            # Check if all words in this verse are pronominal forms
            all_pronominal = all(
                word_info.get('pronominal_form') or word_info.get(
                    'corpus_auto')
                for word_info in vg['null_words']
            )

            if all_pronominal and vg['null_words']:
                # Auto-assign all pronominal forms without API call
                assignments = []
                for word_info in vg['null_words']:
                    if word_info.get('pronominal_form'):
                        assignments.append(
                            {'strong': word_info['corpus_strong']})
                    elif word_info.get('corpus_auto') and word_info.get('corpus_strong'):
                        assignments.append(
                            {'strong': word_info['corpus_strong']})
                    else:
                        assignments.append({'error': 'unknown'})
                results[verse_key] = assignments
                self._save_checkpoint(book_name, results)
                logger.debug(
                    f"Auto-assigned verse {verse_key} with {len(assignments)} pronominal/corpus forms")

        pending = [vg for vg in verse_groups if vg['verse_key'] not in results]

        if not pending:
            logger.info(
                "All verses already completed (loaded from checkpoint or auto-assigned)")
            return results

        if results:
            logger.info(
                f"Resuming: {len(results)} verses done, {len(pending)} remaining")

        semaphore = asyncio.Semaphore(MAX_CONCURRENT)
        total = len(verse_groups)

        async def run_one(vg: Dict[str, Any]) -> tuple:
            async with semaphore:
                verse_key = vg['verse_key']
                null_words = vg['null_words']
                logger.info(
                    f"Processing verse {verse_key} ({len(null_words)} words)")
                assignments = await self.assigner.assign_batch_async(
                    null_words, batch_index=verse_key
                )
                return verse_key, assignments

        tasks = [run_one(vg) for vg in pending]
        for coro in asyncio.as_completed(tasks):
            try:
                verse_key, assignments = await coro
                results[verse_key] = assignments
                self._save_checkpoint(book_name, results)
            except Exception as e:
                logger.error(
                    f"A verse failed and will be marked as failed in output: {e}")

        return results

    def process_book(
        self,
        book_name: str,
        dry_run: bool = False,
        force: bool = False
    ) -> Dict[str, int]:
        """
        Process a book, assigning Strong's numbers to all null-strong words.

        Args:
            book_name: Name of the book to process
            dry_run: If True, only scan and count without API calls
            force: If True, re-process even if output exists

        Returns:
            Dictionary with processing statistics
        """
        from .config import OUTPUT_DIR

        output_file = OUTPUT_DIR / f"{book_name}.json"

        # Check if output already exists
        if output_file.exists() and not force and not dry_run:
            logger.info(
                f"Output file already exists for {book_name}. Use --force to re-process.")
            return {'skipped': True}

        # Scan for verses needing assignment
        verse_groups = self.scan_book(book_name)
        total_null = sum(len(vg['null_words']) for vg in verse_groups)

        stats = {
            'book': book_name,
            'total_null_words': total_null,
            'total_assigned': 0,
            'total_failed': 0,
            'chapters': []
        }

        if dry_run:
            logger.info(
                f"DRY RUN: Would process {total_null} words across {len(verse_groups)} verses in {book_name}")
            return stats

        if not verse_groups:
            logger.info(f"No words need assignment in {book_name}")
            return stats

        from .config import MAX_CONCURRENT
        logger.info(
            f"Running {len(verse_groups)} verses (up to {MAX_CONCURRENT} concurrent)")

        verse_results = asyncio.run(
            self._run_verses_async(book_name, verse_groups))

        # Assemble output grouped by chapter
        chapter_assignments: Dict[int, List] = {}
        total_assigned = 0
        total_failed = 0

        for vg in verse_groups:
            verse_key = vg['verse_key']
            null_words = vg['null_words']

            asgn = verse_results.get(verse_key)
            if asgn is None:
                logger.error(
                    f"Verse {verse_key} failed; marking {len(null_words)} words as failed")
                asgn = []
            asgn_iter = iter(asgn)

            for word_info in null_words:
                assignment: Dict = next(
                    asgn_iter, {'error': 'missing_assignment'})

                chapter = word_info['chapter']
                chapter_assignments.setdefault(chapter, [])

                if 'strong' in assignment:
                    assignment_type = 'strong'
                    total_assigned += 1
                elif 'name' in assignment or 'name_en' in assignment:
                    assignment_type = 'proper_name'
                    total_assigned += 1
                else:
                    assignment_type = 'failed'
                    total_failed += 1

                chapter_assignments[chapter].append({
                    'word_index': word_info['word_index'],
                    'text': word_info['text'],
                    'prefixes': word_info['prefixes'],
                    'type': assignment_type,
                    **assignment
                })

        # Build final output structure
        output_data = {
            'book': book_name,
            'total_null_words': total_null,
            'total_assigned': total_assigned,
            'total_failed': total_failed,
            'chapters': []
        }

        for chapter_num in sorted(chapter_assignments.keys()):
            output_data['chapters'].append({
                'chapter': chapter_num,
                'assignments': chapter_assignments[chapter_num]
            })

        # Update stats
        stats['total_assigned'] = total_assigned
        stats['total_failed'] = total_failed
        stats['chapters'] = output_data['chapters']

        # Save output
        if not dry_run:
            OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

            # Create backup if file exists
            if output_file.exists():
                create_backup(output_file)

            save_json(output_data, output_file)
            logger.info(f"Saved assignments to {output_file}")
            self._clear_checkpoint(book_name)

        return stats

    def get_mismatch_stats(self) -> Dict[str, Any]:
        """Get mismatch statistics from the assigner."""
        return self.assigner.get_mismatch_stats()
