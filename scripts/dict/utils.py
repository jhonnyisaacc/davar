"""
Common utilities for dict processing scripts.

Provides shared functionality for JSON I/O, validation, path handling,
and batch processing to eliminate code duplication across scripts.
"""

import json
import logging
import re
from pathlib import Path
from typing import Dict, List, Optional, Any, Callable, TypeVar, Iterator
from functools import wraps
import time

logger = logging.getLogger(__name__)

T = TypeVar('T')


# ============================================================================
# JSON I/O OPERATIONS
# ============================================================================

def load_json(file_path: Path, encoding: str = 'utf-8') -> Dict:
    """
    Load JSON file with proper error handling.
    
    Args:
        file_path: Path to JSON file
        encoding: File encoding (default: utf-8)
        
    Returns:
        Parsed JSON data as dictionary
        
    Raises:
        FileNotFoundError: If file doesn't exist
        json.JSONDecodeError: If file contains invalid JSON
    """
    if not file_path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")
    
    try:
        with open(file_path, 'r', encoding=encoding) as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON in {file_path}: {e}")
        raise


def save_json(
    data: Dict,
    file_path: Path,
    encoding: str = 'utf-8',
    indent: int = 2,
    ensure_ascii: bool = False
) -> None:
    """
    Save data to JSON file with pretty formatting.
    
    Args:
        data: Data to save
        file_path: Output file path
        encoding: File encoding (default: utf-8)
        indent: Indentation spaces (default: 2)
        ensure_ascii: Whether to escape non-ASCII chars (default: False)
    """
    file_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(file_path, 'w', encoding=encoding) as f:
        json.dump(data, f, ensure_ascii=ensure_ascii, indent=indent)
    
    logger.debug(f"Saved JSON to {file_path}")


def save_json_minified(
    data: Dict,
    file_path: Path,
    encoding: str = 'utf-8',
    ensure_ascii: bool = False
) -> None:
    """
    Save data to JSON file in minified format (no whitespace).
    
    Args:
        data: Data to save
        file_path: Output file path
        encoding: File encoding (default: utf-8)
        ensure_ascii: Whether to escape non-ASCII chars (default: False)
    """
    file_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(file_path, 'w', encoding=encoding) as f:
        json.dump(data, f, ensure_ascii=ensure_ascii, separators=(',', ':'))
    
    logger.debug(f"Saved minified JSON to {file_path}")


# ============================================================================
# JSON EXTRACTION (for LLM responses)
# ============================================================================

def extract_json_array_robust(text: str) -> List:
    """
    Extract JSON array from text using robust multi-strategy approach.
    
    Essential for dealing with LLM responses that may wrap JSON in markdown,
    include explanatory text, or have nested structures. Tries multiple
    strategies in order of reliability.
    
    Strategies:
    1. Direct JSON parsing (cleanest response)
    2. Extract from markdown code blocks
    3. Bracket-matching algorithm (largest valid array)
    4. Regex patterns (fallback)
    
    Args:
        text: Text that may contain a JSON array
        
    Returns:
        List of extracted items
        
    Raises:
        json.JSONDecodeError: If no valid JSON array can be found
    """
    # Strategy 1: Try direct JSON parsing
    try:
        result = json.loads(text)
        if isinstance(result, list):
            logger.debug("Successfully parsed JSON directly")
            return result
    except json.JSONDecodeError:
        pass
    
    # Strategy 2: Extract from markdown code blocks
    markdown_patterns = [
        r'```json\s*(\[.*?\])\s*```',  # ```json [content] ```
        r'```\s*(\[.*?\])\s*```',      # ``` [content] ```
    ]
    
    for pattern in markdown_patterns:
        matches = re.findall(pattern, text, re.DOTALL)
        for match in matches:
            try:
                result = json.loads(match)
                if isinstance(result, list):
                    logger.debug("Successfully extracted JSON from markdown code block")
                    return result
            except json.JSONDecodeError:
                continue
    
    # Strategy 3: Find the largest valid JSON array using bracket matching
    try:
        result = find_largest_json_array(text)
        if result:
            logger.debug("Successfully extracted JSON using bracket matching")
            return result
    except Exception as e:
        logger.debug(f"Bracket matching failed: {e}")
    
    # Strategy 4: Fallback to improved regex patterns
    regex_patterns = [
        r'\[([^\[\]]*(?:\[[^\[\]]*\][^\[\]]*)*)\]',  # Improved nested bracket regex
        r'\[([^\]]*)\]',                               # Simple bracket regex as fallback
    ]
    
    for pattern in regex_patterns:
        matches = re.findall(pattern, text, re.DOTALL)
        for match in matches:
            try:
                # Ensure the match is properly formatted
                if not match.strip().startswith('['):
                    match = f'[{match}]'
                result = json.loads(match)
                if isinstance(result, list):
                    logger.debug("Successfully extracted JSON using improved regex")
                    return result
            except json.JSONDecodeError:
                continue
    
    # If all strategies fail, raise an error
    logger.error(f"Could not extract valid JSON array from text: {repr(text[:200])}...")
    raise json.JSONDecodeError("No valid JSON array found", text, 0)


def find_largest_json_array(text: str) -> Optional[List]:
    """
    Find the largest valid JSON array in text using bracket matching.
    
    Scans text for all potential JSON arrays (balanced brackets) and
    returns the one with the most elements.
    
    Args:
        text: Text to search for JSON arrays
        
    Returns:
        The largest valid JSON array found, or None if none found
    """
    candidates = []
    
    # Find all potential array starts
    for i, char in enumerate(text):
        if char == '[':
            # Try to find the matching closing bracket
            bracket_count = 1
            end_pos = i + 1
            
            while end_pos < len(text) and bracket_count > 0:
                if text[end_pos] == '[':
                    bracket_count += 1
                elif text[end_pos] == ']':
                    bracket_count -= 1
                end_pos += 1
            
            if bracket_count == 0:  # Found matching brackets
                array_text = text[i:end_pos]
                try:
                    result = json.loads(array_text)
                    if isinstance(result, list):
                        candidates.append(result)
                except json.JSONDecodeError:
                    continue
    
    # Return the largest array found
    if candidates:
        return max(candidates, key=len)
    
    return None


# ============================================================================
# VALIDATION FUNCTIONS
# ============================================================================

def validate_strong_number(strong_num: str) -> bool:
    """
    Validate Strong's number format.
    
    Args:
        strong_num: Strong's number to validate (e.g., 'H1', 'H1234')
        
    Returns:
        True if valid format, False otherwise
    """
    pattern = r'^H\d+$'
    return bool(re.match(pattern, strong_num))


def validate_file_exists(file_path: Path, file_type: str = "file") -> None:
    """
    Validate that a file or directory exists.
    
    Args:
        file_path: Path to validate
        file_type: Type description for error message (default: "file")
        
    Raises:
        FileNotFoundError: If path doesn't exist
    """
    if not file_path.exists():
        raise FileNotFoundError(f"{file_type.capitalize()} not found: {file_path}")


def validate_translation_field(
    definition: Dict,
    language_code: str,
    allow_empty: bool = False
) -> bool:
    """
    Validate that a definition has a valid translation for the given language.
    
    Args:
        definition: Definition dictionary to check
        language_code: Target language code (e.g., 'es', 'pt')
        allow_empty: Whether to allow empty strings (default: False)
        
    Returns:
        True if translation exists and is valid, False otherwise
    """
    field_name = f"text_{language_code}"
    translation = definition.get(field_name)
    
    if not isinstance(translation, str):
        return False
    
    if not allow_empty and not translation.strip():
        return False
    
    return True


def validate_lexicon_entry(entry: Dict, is_root: bool = False) -> List[str]:
    """
    Validate lexicon entry structure and return list of errors.
    
    Args:
        entry: Lexicon entry dictionary to validate
        is_root: Whether this is a root entry (affects validation rules)
        
    Returns:
        List of error messages (empty if valid)
    """
    errors = []
    
    # Required fields
    required_fields = ['strong_number', 'lemma', 'definitions', 'occurrences', 'sources']
    for field in required_fields:
        if field not in entry:
            errors.append(f"Missing required field: {field}")
    
    # Validate is_root matches expectation
    if 'is_root' in entry:
        if is_root and not entry['is_root']:
            errors.append("Entry marked is_root=False but in roots directory")
        elif not is_root and entry['is_root']:
            errors.append("Entry marked is_root=True but not in roots directory")
    
    # Validate definitions structure
    if 'definitions' in entry:
        definitions = entry['definitions']
        if not isinstance(definitions, list):
            errors.append("definitions must be a list")
        else:
            for idx, defn in enumerate(definitions):
                if not isinstance(defn, dict):
                    errors.append(f"Definition {idx} is not a dictionary")
                elif 'text_en' not in defn and 'text' not in defn:
                    errors.append(f"Definition {idx} missing text_en or text field")
    
    return errors


# ============================================================================
# PATH UTILITIES
# ============================================================================

def ensure_dir(dir_path: Path) -> Path:
    """
    Ensure directory exists, creating it if necessary.
    
    Args:
        dir_path: Directory path to ensure
        
    Returns:
        The directory path (for chaining)
    """
    dir_path.mkdir(parents=True, exist_ok=True)
    return dir_path


def get_project_root(start_path: Optional[Path] = None) -> Path:
    """
    Get the project root directory by searching for mise.toml marker.
    
    Args:
        start_path: Starting path for search (default: this file's directory)
        
    Returns:
        Project root path
        
    Raises:
        RuntimeError: If project root cannot be found
    """
    if start_path is None:
        start_path = Path(__file__).parent
    
    current = start_path.resolve()
    
    # Search up the directory tree for mise.toml
    while current != current.parent:
        if (current / 'mise.toml').exists():
            return current
        current = current.parent
    
    raise RuntimeError("Could not find project root (no mise.toml found)")


# ============================================================================
# BATCH PROCESSING UTILITIES
# ============================================================================

def chunk_list(items: List[T], chunk_size: int) -> Iterator[List[T]]:
    """
    Split a list into chunks of specified size.
    
    Args:
        items: List to split
        chunk_size: Maximum size of each chunk
        
    Yields:
        Chunks of the original list
    """
    for i in range(0, len(items), chunk_size):
        yield items[i:i + chunk_size]


def batch_processor(
    batch_size: int,
    progress_callback: Optional[Callable[[int, int], None]] = None
):
    """
    Decorator for batch processing functions.
    
    Wraps a function to process items in batches, with optional
    progress tracking and error handling.
    
    Args:
        batch_size: Number of items per batch
        progress_callback: Optional callback(current, total) for progress updates
        
    Example:
        @batch_processor(batch_size=50)
        def process_items(items: List[str]) -> List[str]:
            # Process up to 50 items at once
            return [item.upper() for item in items]
    """
    def decorator(func: Callable[[List[T]], List[Any]]) -> Callable[[List[T]], List[Any]]:
        @wraps(func)
        def wrapper(items: List[T]) -> List[Any]:
            results = []
            total_items = len(items)
            
            for batch_idx, batch in enumerate(chunk_list(items, batch_size)):
                try:
                    batch_results = func(batch)
                    results.extend(batch_results)
                    
                    if progress_callback:
                        current = min((batch_idx + 1) * batch_size, total_items)
                        progress_callback(current, total_items)
                
                except Exception as e:
                    logger.error(f"Error processing batch {batch_idx + 1}: {e}")
                    # Continue with next batch instead of failing completely
                    results.extend([None] * len(batch))
            
            return results
        
        return wrapper
    return decorator


# ============================================================================
# ERROR HANDLING & LOGGING
# ============================================================================

class ProgressTracker:
    """
    Simple progress tracker for long-running operations.
    
    Displays progress with percentage, items processed, and optional ETA.
    """
    
    def __init__(self, total: int, description: str = "Processing"):
        self.total = total
        self.current = 0
        self.description = description
        self.start_time = time.time()
    
    def update(self, increment: int = 1) -> None:
        """Update progress by increment."""
        self.current += increment
        self._display()
    
    def _display(self) -> None:
        """Display current progress."""
        if self.total == 0:
            return
        
        percentage = (self.current / self.total) * 100
        elapsed = time.time() - self.start_time
        
        # Calculate ETA
        if self.current > 0:
            rate = self.current / elapsed
            remaining = (self.total - self.current) / rate
            eta_str = f", ETA: {remaining:.0f}s"
        else:
            eta_str = ""
        
        logger.info(
            f"{self.description}: {self.current}/{self.total} "
            f"({percentage:.1f}%{eta_str})"
        )
    
    def complete(self) -> None:
        """Mark as complete and display final stats."""
        elapsed = time.time() - self.start_time
        rate = self.total / elapsed if elapsed > 0 else 0
        logger.info(
            f"{self.description} complete: {self.total} items "
            f"in {elapsed:.1f}s ({rate:.1f} items/sec)"
        )


def create_backup(file_path: Path, backup_dir: Optional[Path] = None) -> Path:
    """
    Create a timestamped backup of a file.
    
    Args:
        file_path: File to back up
        backup_dir: Directory for backup (default: file_path.parent / 'temp')
        
    Returns:
        Path to backup file
    """
    if not file_path.exists():
        raise FileNotFoundError(f"Cannot backup non-existent file: {file_path}")
    
    if backup_dir is None:
        backup_dir = file_path.parent / 'temp'
    
    ensure_dir(backup_dir)
    
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    backup_name = f"{file_path.stem}_backup_{timestamp}{file_path.suffix}"
    backup_path = backup_dir / backup_name
    
    # Copy file
    import shutil
    shutil.copy2(file_path, backup_path)
    
    logger.info(f"Created backup: {backup_path}")
    return backup_path


# ============================================================================
# STATISTICS & REPORTING
# ============================================================================

class StatisticsCollector:
    """
    Collect and report statistics for processing operations.
    """
    
    def __init__(self):
        self.stats: Dict[str, Any] = {}
        self.start_time = time.time()
    
    def record(self, key: str, value: Any) -> None:
        """Record a statistic."""
        self.stats[key] = value
    
    def increment(self, key: str, amount: int = 1) -> None:
        """Increment a counter statistic."""
        self.stats[key] = self.stats.get(key, 0) + amount
    
    def get_elapsed_time(self) -> float:
        """Get elapsed time in seconds."""
        return time.time() - self.start_time
    
    def get_summary(self) -> Dict[str, Any]:
        """Get summary of all statistics."""
        return {
            **self.stats,
            'elapsed_time_seconds': self.get_elapsed_time()
        }
    
    def print_summary(self, title: str = "Statistics") -> None:
        """Print formatted summary."""
        print(f"\n{'='*60}")
        print(title)
        print('='*60)
        
        for key, value in self.stats.items():
            # Format key nicely
            display_key = key.replace('_', ' ').title()
            print(f"{display_key}: {value}")
        
        print(f"Elapsed Time: {self.get_elapsed_time():.1f}s")
        print('='*60)


# ============================================================================
# SHARED DATA LOADERS
# ============================================================================

def load_strongs_data() -> Dict:
    """
    Load Strong's dictionary data.
    
    Returns:
        Dictionary of Strong's entries keyed by Strong's number
    """
    from .config import Config
    config = Config()
    
    if config.STRONGS_FILE.exists():
        return load_json(config.STRONGS_FILE)
    return {}


def load_strong_refs() -> Dict:
    """
    Load Strong's references data.
    
    Returns:
        Dictionary of Strong's references keyed by Strong's number
    """
    from .config import Config
    config = Config()
    
    if config.STRONG_REFS_FILE.exists():
        with open(config.STRONG_REFS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}


def load_bdb_xml():
    """
    Load BDB XML file.
    
    Returns:
        XML root element or None if file not found/unparseable
    """
    from .config import Config
    config = Config()
    
    if not config.BDB_XML.exists():
        return None
    
    try:
        import xml.etree.ElementTree as ET
        tree = ET.parse(config.BDB_XML)
        return tree.getroot()
    except Exception:
        return None
