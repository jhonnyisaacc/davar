"""
Grok API assigner module for Delitzsch Strong's numbers.

Handles batch assignment of Strong's numbers to Hebrew words using
xAI's Grok API (grok-4 model).
"""

import json
import time
import logging
import re
from typing import Dict, List, Optional, Any

# Strong's number validation: H followed by 1-5 digits, no H0000
_VALID_STRONG_RE = re.compile(r'^H[1-9]\d{0,4}$')

# Prefix code → Hebrew consonant (for display in prompts)
_PREFIX_CONSONANT = {'Hl': 'ל', 'Hb': 'ב', 'Hk': 'כ', 'Hc': 'ו', 'Hd': 'ה'}


try:
    import asyncio
    import httpx
    from openai import OpenAI, AsyncOpenAI
except ImportError as e:
    raise ImportError(
        "Grok assigner requires 'openai' package. Install with: pip install openai"
    ) from e

from .config import (
    XAI_API_KEY,
    GROK_MODEL,
    GROK_BASE_URL,
    GROK_TIMEOUT,
    MAX_RETRIES,
    RETRY_BACKOFF_BASE,
    RATE_LIMIT_DELAY,
    validate_grok_api_key,
)

# Import utilities from parent module
from scripts.dict.utils import extract_json_array_robust

logger = logging.getLogger(__name__)


class GrokStrongsAssigner:
    """Assigner using xAI Grok API for Strong's numbers."""

    def __init__(self):
        """
        Initialize the assigner with API key.
        """
        if not validate_grok_api_key():
            raise ValueError(
                "XAI_API_KEY not found in environment variables. "
                "Please set it in .env file or as an environment variable."
            )

        # Initialize OpenAI clients with Grok base URL
        self.client = OpenAI(
            api_key=XAI_API_KEY,
            base_url=GROK_BASE_URL,
            timeout=httpx.Timeout(GROK_TIMEOUT),
        )
        self.async_client = AsyncOpenAI(
            api_key=XAI_API_KEY,
            base_url=GROK_BASE_URL,
            timeout=httpx.Timeout(GROK_TIMEOUT),
        )
        self.model_name = GROK_MODEL
        self._last_request_time = 0
        self._mismatch_stats = {
            'total_batches': 0,
            'mismatched_batches': 0,
            'total_padding': 0,
            'total_truncation': 0,
            'mismatch_patterns': {}
        }

    def _rate_limit(self):
        """Enforce rate limiting between API calls."""
        current_time = time.time()
        time_since_last = current_time - self._last_request_time
        if time_since_last < RATE_LIMIT_DELAY:
            sleep_time = RATE_LIMIT_DELAY - time_since_last
            time.sleep(sleep_time)
        self._last_request_time = time.time()

    def _generate_prompt(self, words: List[Dict[str, Any]]) -> str:
        """Generate verse-level assignment prompt. All words in the batch are from the same verse."""
        chapter = words[0].get('chapter', '')
        verse_num = words[0].get('verse_num', '')
        annotated_verse = words[0].get('annotated_verse', '')
        n = len(words)

        lines = [
            f"Verse [{chapter}:{verse_num}] — assign a Strong's number to each word marked <<<word>>> in the Delitzsch Hebrew NT.",
            f"There are exactly {n} target word(s). Return exactly {n} assignments in left-to-right order.",
            "",
            'Format — each assignment is one of:',
            '  {"strong":"H####"} for regular Hebrew words',
            '  {"strong":"H####","name":"Hebrew-transliteration"} for proper names with a Strong\'s number',
            '  {"name":"Hebrew-transliteration"} ONLY for proper names with no Hebrew Strong\'s number',
            "Only words tagged (proper) below get a name field. All others get only {\"strong\":\"H####\"}.",
            "IMPORTANT: If you are not highly confident in a Strong's number, return {\"error\":\"unknown\"} — do NOT guess.",
            "",
            f"Verse: {annotated_verse}",
            "",
            "Target words in order:",
        ]
        for i, word in enumerate(words, 1):
            text = word.get('text', '')
            prefixes = word.get('prefixes', [])
            is_proper = word.get('possible_proper_name', False)
            corpus_strong = word.get('corpus_strong')
            corpus_count = word.get('corpus_count', 0)

            parts = [f"{i}.", text]
            if prefixes:
                consonants = [_PREFIX_CONSONANT.get(p, p) for p in prefixes]
                parts.append(f"pfx:[{','.join(consonants)}]")
            if is_proper:
                parts.append("(proper)")
            if corpus_strong:
                parts.append(f"[corpus hint: {corpus_strong} ×{corpus_count}]")
            lines.append(" ".join(parts))

        lines.append('\nNever use H0000 as a placeholder — return {"error":"unknown"} if uncertain.')
        lines.append('Respond with {"assignments": [...]}')
        return "\n".join(lines)

    def _generate_system_prompt(self) -> str:
        """Generate the system prompt for the Grok API."""
        return (
            "You are a Hebrew biblical lexicographer specializing in the Delitzsch Hebrew New Testament (HNT). "
            "Rules for Strong's assignment:\n"
            "1. Every word gets a Strong's number: {\"strong\":\"H####\"} — 1-5 digits, no leading zeros (e.g. H157, H3117).\n"
            "2. Words tagged (proper) are proper names. Most have Strong's numbers — include both:\n"
            "   {\"strong\":\"H####\",\"name\":\"Hebrew-transliteration\"}\n"
            "   Use Hebrew transliterations, NOT Greek/Latin/English adaptations. Examples:\n"
            "   Yeshua (H3442), Yehudah (H3063), Yaakov (H3290), Mashiach (H4899), Sodom (H5467),\n"
            "   Chanoch (H2585), Qayin (H7014), Moshe (H4872), Miryam (H4813), Eliyahu (H452),\n"
            "   Yochanan (H3110), Shimon (H8095), Kefa (transliteration only — no Hebrew Strong's).\n"
            "3. ONLY assign proper name treatment to words explicitly tagged (proper). All other words get only {\"strong\":\"H####\"}.\n"
            "4. NEVER use H0000 or any placeholder — if truly unknown, return {\"error\":\"unknown\"}\n"
            "5. NEVER put prefix codes (ה ,ו ,ב ,כ) in the strong field — these are stripped prefixes stored separately.\n"
            "6. Return EXACTLY as many items as words given, in the same order."
        )

    def assign_batch(
        self,
        words: List[Dict[str, Any]],
        retry_count: int = 0,
        batch_index: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """
        Assign Strong's numbers or proper names to a batch of Hebrew words.

        Args:
            words: List of word dictionaries with text, verse, prefixes, possible_proper_name
            retry_count: Current retry attempt (for internal use)
            batch_index: Optional batch index for logging

        Returns:
            List of assignment dictionaries in the same order as input
        """
        if not words:
            return []

        self._rate_limit()

        try:
            system_prompt = self._generate_system_prompt()
            user_prompt = self._generate_prompt(words)

            logger.debug(f"Making API call to Grok with model: {self.model_name}")
            logger.debug(f"Batch size: {len(words)} words")

            response = self.client.chat.completions.create(
                model=self.model_name,
                messages=[
                    {
                        "role": "system",
                        "content": system_prompt
                    },
                    {
                        "role": "user",
                        "content": user_prompt
                    }
                ],
                temperature=0.1,  # Low temperature for consistent output
                response_format={"type": "json_object"},
            )

            logger.debug("API call completed successfully")

            # Extract content from chat completions response
            if not hasattr(response, 'choices') or not response.choices:
                logger.error("Response missing choices")
                raise ValueError("Invalid response structure from Grok API")

            choice = response.choices[0]
            if getattr(choice, 'finish_reason', None) == 'length':
                logger.warning(f"Batch {batch_index}: finish_reason=length — response was truncated by token limit.")

            if not hasattr(choice, 'message'):
                logger.error("Choice missing message")
                raise ValueError("Invalid response structure from Grok API")

            message = choice.message
            if not hasattr(message, 'content') or message.content is None:
                logger.error("Message missing content")
                raise ValueError("Invalid response structure from Grok API")

            content = message.content
            logger.debug(f"Extracted content: {repr(content)}")

            # Parse the JSON response
            assignments = self._extract_assignments_from_content(content)

            if not isinstance(assignments, list):
                raise ValueError("Response is not a JSON array")

            # Track batch statistics
            self._mismatch_stats['total_batches'] += 1

            if len(assignments) != len(words):
                self._mismatch_stats['mismatched_batches'] += 1

                # Calculate mismatch details
                expected_count = len(words)
                actual_count = len(assignments)
                mismatch_diff = actual_count - expected_count

                # Track padding/truncation
                if mismatch_diff > 0:
                    self._mismatch_stats['total_truncation'] += mismatch_diff
                elif mismatch_diff < 0:
                    self._mismatch_stats['total_padding'] += abs(mismatch_diff)

                # Track mismatch patterns
                pattern_key = f"{expected_count}->{actual_count}"
                self._mismatch_stats['mismatch_patterns'][pattern_key] = \
                    self._mismatch_stats['mismatch_patterns'].get(pattern_key, 0) + 1

                logger.warning(
                    f"Assignment count mismatch in batch {batch_index or 'unknown'}: "
                    f"expected {expected_count}, got {actual_count}"
                )

            # Ensure we have the same number of assignments as inputs
            while len(assignments) < len(words):
                assignments.append({"error": "missing_assignment"})

            # Retry on format/validation errors (not semantic "unknown")
            retryable = [a for a in assignments[:len(words)] if a.get('error', 'unknown') != 'unknown']
            if retryable and retry_count < MAX_RETRIES:
                logger.warning(
                    f"Batch {batch_index}: {len(retryable)} retryable error(s), retrying "
                    f"(attempt {retry_count + 1}/{MAX_RETRIES})..."
                )
                time.sleep(RETRY_BACKOFF_BASE ** retry_count)
                return self.assign_batch(words, retry_count + 1, batch_index=batch_index)

            return assignments[:len(words)]

        except Exception as e:
            error_str = str(e)
            logger.error(f"Assignment error: {error_str}")

            # Check if it's a quota/rate limit error
            wait_time = None

            if "429" in error_str or "quota" in error_str.lower() or "rate" in error_str.lower():
                wait_time = 60.0
                logger.info("Rate limit detected. Waiting 60 seconds...")

            if retry_count < MAX_RETRIES:
                if wait_time is None:
                    wait_time = RETRY_BACKOFF_BASE ** retry_count
                logger.info(f"Retrying in {wait_time:.1f} seconds... (attempt {retry_count + 1}/{MAX_RETRIES})")
                time.sleep(wait_time)
                return self.assign_batch(
                    words,
                    retry_count + 1,
                    batch_index=batch_index,
                )
            else:
                raise ValueError(
                    f"Assignment failed after {MAX_RETRIES} retries: {e}"
                )

    def _extract_assignments_from_content(self, content: str) -> List[Dict[str, Any]]:
        """Extract and validate assignments from the API response content."""
        # Primary: JSON object with 'assignments' key (from JSON mode)
        try:
            data = json.loads(content)
            if isinstance(data, dict) and "assignments" in data:
                result = data["assignments"]
                if isinstance(result, list):
                    logger.debug(f"Extracted {len(result)} assignments from JSON object")
                    return [self._validate_assignment(a) for a in result]
            if isinstance(data, list):
                logger.debug(f"Extracted {len(data)} assignments from JSON array")
                return [self._validate_assignment(a) for a in data]
        except json.JSONDecodeError:
            pass

        # Middle fallback: recover complete objects from truncated JSON
        recovered = self._recover_partial_array(content)
        if recovered is not None:
            logger.warning(f"Recovered {len(recovered)} assignments from truncated response")
            return [self._validate_assignment(a) for a in recovered]

        # Last resort: robust multi-strategy extraction
        try:
            assignments = extract_json_array_robust(content)
            if isinstance(assignments, list):
                return [self._validate_assignment(a) for a in assignments]
        except Exception:
            pass

        raise ValueError("Response is not a JSON array")

    def _recover_partial_array(self, content: str) -> Optional[List[Dict[str, Any]]]:
        """Walk truncated JSON, recovering all complete {…} objects before the cut-off."""
        start = content.find('[')
        if start == -1:
            # Try to find the assignments array inside a JSON object
            idx = content.find('"assignments"')
            if idx != -1:
                bracket = content.find('[', idx)
                if bracket != -1:
                    start = bracket
        if start == -1:
            return None

        results = []
        i = start + 1
        length = len(content)
        while i < length:
            # Skip whitespace and commas between objects
            while i < length and content[i] in ' \t\n\r,':
                i += 1
            if i >= length or content[i] != '{':
                break
            depth = 0
            obj_start = i
            in_string = False
            escape_next = False
            while i < length:
                ch = content[i]
                if escape_next:
                    escape_next = False
                elif ch == '\\' and in_string:
                    escape_next = True
                elif ch == '"':
                    in_string = not in_string
                elif not in_string:
                    if ch == '{':
                        depth += 1
                    elif ch == '}':
                        depth -= 1
                        if depth == 0:
                            obj_str = content[obj_start:i + 1]
                            try:
                                results.append(json.loads(obj_str))
                            except json.JSONDecodeError:
                                pass
                            i += 1
                            break
                i += 1
            else:
                break  # truncated object — stop here
        return results if results else None

    def _validate_assignment(self, assignment: Any) -> Dict[str, Any]:
        """Reject malformed assignments: invalid Strong's format, H0000, nested objects."""
        if not isinstance(assignment, dict):
            return {"error": "invalid_format"}
        if "strong" in assignment:
            strong = assignment["strong"]
            if not isinstance(strong, str) or not _VALID_STRONG_RE.match(strong):
                # H0000 is the model's way of saying "I don't know" — normalise to unknown
                if isinstance(strong, str) and strong == 'H0000':
                    return {"error": "unknown"}
                return {"error": f"invalid_strong: {strong}"}
        return assignment

    async def _rate_limit_async(self) -> None:
        """Async rate limiting between API calls."""
        await asyncio.sleep(RATE_LIMIT_DELAY)

    async def assign_batch_async(
        self,
        words: List[Dict[str, Any]],
        retry_count: int = 0,
        batch_index: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """Async version of assign_batch for concurrent processing."""
        if not words:
            return []

        await self._rate_limit_async()

        try:
            system_prompt = self._generate_system_prompt()
            user_prompt = self._generate_prompt(words)

            logger.debug(f"Async API call: batch {batch_index}, {len(words)} words")

            response = await self.async_client.chat.completions.create(
                model=self.model_name,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.1,
                response_format={"type": "json_object"},
            )

            if not hasattr(response, 'choices') or not response.choices:
                raise ValueError("Invalid response structure from Grok API")

            choice = response.choices[0]
            if getattr(choice, 'finish_reason', None) == 'length':
                logger.warning(f"Batch {batch_index}: finish_reason=length — response was truncated by token limit.")

            content = choice.message.content
            if content is None:
                raise ValueError("Empty response from Grok API")

            assignments = self._extract_assignments_from_content(content)

            if not isinstance(assignments, list):
                raise ValueError("Response is not a JSON array")

            self._mismatch_stats['total_batches'] += 1
            if len(assignments) != len(words):
                self._mismatch_stats['mismatched_batches'] += 1
                diff = len(assignments) - len(words)
                if diff > 0:
                    self._mismatch_stats['total_truncation'] += diff
                else:
                    self._mismatch_stats['total_padding'] += abs(diff)
                pattern_key = f"{len(words)}->{len(assignments)}"
                self._mismatch_stats['mismatch_patterns'][pattern_key] = \
                    self._mismatch_stats['mismatch_patterns'].get(pattern_key, 0) + 1
                logger.warning(
                    f"Count mismatch in batch {batch_index or 'unknown'}: "
                    f"expected {len(words)}, got {len(assignments)}"
                )

            while len(assignments) < len(words):
                assignments.append({"error": "missing_assignment"})

            # Retry on format/validation errors (not semantic "unknown")
            retryable = [a for a in assignments[:len(words)] if a.get('error', 'unknown') != 'unknown']
            if retryable and retry_count < MAX_RETRIES:
                logger.warning(
                    f"Batch {batch_index}: {len(retryable)} retryable error(s), retrying "
                    f"(attempt {retry_count + 1}/{MAX_RETRIES})..."
                )
                await asyncio.sleep(RETRY_BACKOFF_BASE ** retry_count)
                return await self.assign_batch_async(words, retry_count + 1, batch_index=batch_index)

            return assignments[:len(words)]

        except Exception as e:
            error_str = str(e)
            logger.error(f"Async assignment error: {error_str}")

            wait_time = None
            if "429" in error_str or "quota" in error_str.lower() or "rate" in error_str.lower():
                wait_time = 60.0
                logger.info("Rate limit detected. Waiting 60 seconds...")

            if retry_count < MAX_RETRIES:
                if wait_time is None:
                    wait_time = RETRY_BACKOFF_BASE ** retry_count
                logger.info(f"Retrying in {wait_time:.1f}s... (attempt {retry_count + 1}/{MAX_RETRIES})")
                await asyncio.sleep(wait_time)
                return await self.assign_batch_async(
                    words,
                    retry_count + 1,
                    batch_index=batch_index,
                )
            else:
                raise ValueError(f"Assignment failed after {MAX_RETRIES} retries: {e}")

    def get_mismatch_stats(self) -> Dict[str, Any]:
        """Get mismatch statistics for reporting."""
        return self._mismatch_stats.copy()