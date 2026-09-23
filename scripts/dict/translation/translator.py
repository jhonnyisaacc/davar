"""
Grok API translator module.

Handles batch translation of English definitions to target languages using
xAI's Grok API (grok-3-mini model).
"""

import json
import time
import logging
import re
from typing import Any, Dict, List, Optional


try:
    import httpx
    from openai import OpenAI
except ImportError as e:
    raise ImportError(
        "Grok translator requires 'openai' package. Install with: pip install openai"
    ) from e

from .config import (
    XAI_API_KEY,
    GROK_MODEL,
    GROK_BASE_URL,
    GROK_TIMEOUT,
    MAX_RETRIES,
    RETRY_BACKOFF_BASE,
    RATE_LIMIT_DELAY,
    get_language_name,
    validate_grok_api_key,
)

# Import utilities from parent module
from ..utils import extract_json_array_robust

logger = logging.getLogger(__name__)


class GrokTranslator:
    """Translator using xAI Grok API."""

    def __init__(self):
        """
        Initialize the translator with API key.
        """
        if not validate_grok_api_key():
            raise ValueError(
                "XAI_API_KEY not found in environment variables. "
                "Please set it in .env file or as an environment variable."
            )

        # Initialize OpenAI client with Grok base URL
        self.client = OpenAI(
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
    
    def _generate_prompt(self, texts: List[str], target_lang: str) -> str:
        """
        Generate translation prompt for batch translation.

        Args:
            texts: List of English definition texts to translate
            target_lang: Target language code (e.g., 'es', 'pt')

        Returns:
            Formatted prompt string
        """
        lang_name = get_language_name(target_lang) or target_lang

        prompt = f"""Translate these Hebrew dictionary definitions from English to {lang_name}.
Maintain technical accuracy and preserve biblical terminology.

Return ONLY a valid JSON array with the translations in the same order as the input.
Do not include any explanations, comments, or additional text - just the JSON array.

Input definitions:
"""
        for i, text in enumerate(texts, 1):
            prompt += f"{i}. {text}\n"

        prompt += "\nReturn the translations as a JSON array:"

        return prompt

    def get_mismatch_stats(self) -> Dict[str, int]:
        """
        Get mismatch statistics for reporting.

        Returns:
            Dictionary with mismatch statistics
        """
        return self._mismatch_stats.copy()

    def translate_batch(
        self,
        texts: List[str],
        target_lang: str,
        retry_count: int = 0,
        keys: Optional[List[str]] = None,
        batch_index: Optional[int] = None
    ) -> List[str]:
        """
        Translate a batch of English texts to target language.

        Args:
            texts: List of English definition texts to translate
            target_lang: Target language code (e.g., 'es', 'pt')
            retry_count: Current retry attempt (for internal use)
            keys: Optional list of keys (not used for Grok, kept for compatibility)

        Returns:
            List of translated texts in the same order as input

        Raises:
            ValueError: If translation fails after max retries
        """
        if not texts:
            return []

        # Grok doesn't have a separate batch API like Gemini
        # Process synchronously
        return self._translate_batch_sync(
            texts,
            target_lang,
            retry_count,
            batch_index=batch_index,
        )

    def _translate_batch_sync(
        self,
        texts: List[str],
        target_lang: str,
        retry_count: int = 0,
        batch_index: Optional[int] = None,
    ) -> List[str]:
        """
        Synchronous batch translation using Grok API.

        Args:
            texts: List of English definition texts to translate
            target_lang: Target language code (e.g., 'es', 'pt')
            retry_count: Current retry attempt
            batch_index: Optional batch index for logging

        Returns:
            List of translated texts in the same order as input
        """
        if not texts:
            return []

        self._rate_limit()
        
        response_text = None
        
        try:
            prompt = self._generate_prompt(texts, target_lang)
            
            # Grok API uses /v1/responses endpoint with input array format
            logger.debug(f"Making API call to Grok with model: {self.model_name}")
            logger.debug(f"Prompt length: {len(prompt)} characters")

            response = self.client.responses.create(
                model=self.model_name,
                input=[
                    {
                        "role": "system",
                        "content": "You are a helpful translator specializing in biblical Hebrew dictionary definitions."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
            )

            logger.debug(f"API call completed successfully")

            # Debug the response structure
            logger.debug(f"Response object: {response}")
            logger.debug(f"Response dir: {[attr for attr in dir(response) if not attr.startswith('_')]}")

            output_items: Any = getattr(response, "output", None)
            response_text = getattr(response, "output_text", None)

            # Fall back to traversing output items if output_text isn't available.
            if not isinstance(response_text, str) or not response_text.strip():
                fragments: List[str] = []
                if isinstance(output_items, list):
                    for output_item in output_items:
                        content_items = getattr(output_item, "content", None)
                        if isinstance(content_items, list):
                            for content_item in content_items:
                                text_candidate = getattr(content_item, "text", None)
                                if isinstance(text_candidate, str) and text_candidate.strip():
                                    fragments.append(text_candidate)

                        direct_text = getattr(output_item, "text", None)
                        if isinstance(direct_text, str) and direct_text.strip():
                            fragments.append(direct_text)

                if fragments:
                    response_text = "\n".join(fragments)

            if not isinstance(response_text, str) or not response_text.strip():
                logger.error("Could not extract content from Grok API response: %s", response)
                raise ValueError("Could not extract content from Grok API response")

            response_text = response_text.strip()
            logger.debug("Extracted response text: %r", response_text[:500])

            # Use robust JSON extraction from utils module
            translations = extract_json_array_robust(response_text)
            logger.debug(
                "Successfully extracted JSON array: %s items",
                len(translations) if isinstance(translations, list) else "not a list",
            )

            if not isinstance(translations, list):
                raise ValueError("Response is not a JSON array")
            
            # Track batch statistics
            self._mismatch_stats['total_batches'] += 1

            if len(translations) != len(texts):
                self._mismatch_stats['mismatched_batches'] += 1

                # Calculate mismatch details
                expected_count = len(texts)
                actual_count = len(translations)
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

                # Enhanced logging with batch details
                log_msg = f"Translation count mismatch in batch {batch_index or 'unknown'}: expected {expected_count}, got {actual_count}"

                if batch_index is not None:
                    log_msg += f" (batch {batch_index})"

                # Log sample texts for debugging (first 3)
                sample_count = min(3, len(texts), len(translations))
                if sample_count > 0:
                    log_msg += f"\nSample translations (first {sample_count}):"
                    for i in range(sample_count):
                        original = texts[i][:50] + "..." if len(texts[i]) > 50 else texts[i]
                        translated = translations[i][:50] + "..." if i < len(translations) and len(translations[i]) > 50 else translations[i] if i < len(translations) else "[MISSING]"
                        log_msg += f"\n  {i+1}. '{original}' -> '{translated}'"

                # Log action taken
                if mismatch_diff > 0:
                    log_msg += f"\nAction: Truncated {mismatch_diff} extra translations"
                elif mismatch_diff < 0:
                    log_msg += f"\nAction: Padded with {abs(mismatch_diff)} empty strings"

                logger.warning(log_msg)
            
            # Ensure we have the same number of translations as inputs
            # Pad with empty strings if needed
            while len(translations) < len(texts):
                translations.append("")
            
            return translations[:len(texts)]
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse JSON response: {e}")
            if response_text:
                logger.debug(f"Response text: {response_text[:500]}")
            
            if retry_count < MAX_RETRIES:
                wait_time = RETRY_BACKOFF_BASE ** retry_count
                logger.info(f"Retrying in {wait_time} seconds... (attempt {retry_count + 1}/{MAX_RETRIES})")
                time.sleep(wait_time)
                return self.translate_batch(
                    texts,
                    target_lang,
                    retry_count + 1,
                    batch_index=batch_index,
                )
            else:
                raise ValueError(
                    f"Failed to parse translation response after {MAX_RETRIES} retries: {e}"
                )
        
        except Exception as e:
            error_str = str(e)
            logger.error(f"Translation error: {error_str}")
            
            # Check if it's a quota/rate limit error (429)
            wait_time = None
            
            # Try to extract retry_delay from error message
            if "429" in error_str or "quota" in error_str.lower() or "rate" in error_str.lower():
                # Look for retry delay in error message
                retry_match = re.search(r'retry.*?(\d+(?:\.\d+)?)', error_str, re.IGNORECASE)
                if retry_match:
                    wait_time = float(retry_match.group(1))
                    logger.info(f"Rate limit detected. Waiting {wait_time:.1f} seconds as suggested by API...")
                else:
                    # Default wait time for rate limits
                    wait_time = 60.0
                    logger.info(f"Rate limit detected. Waiting {wait_time:.1f} seconds...")
            
            if retry_count < MAX_RETRIES:
                if wait_time is None:
                    wait_time = RETRY_BACKOFF_BASE ** retry_count
                logger.info(f"Retrying in {wait_time:.1f} seconds... (attempt {retry_count + 1}/{MAX_RETRIES})")
                time.sleep(wait_time)
                return self._translate_batch_sync(
                    texts,
                    target_lang,
                    retry_count + 1,
                    batch_index=batch_index,
                )
            else:
                raise ValueError(
                    f"Translation failed after {MAX_RETRIES} retries: {e}"
                )

