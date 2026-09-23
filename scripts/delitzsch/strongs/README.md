# Delitzsch Strong's Number Assignment

A Python CLI tool for assigning Strong's numbers to Hebrew words in the Delitzsch Hebrew New Testament translation using xAI's Grok API.

## Overview

This tool processes the Delitzsch Hebrew New Testament translation to assign Strong's concordance numbers to Hebrew words that currently have null values. It uses xAI's Grok API (grok-4-1-fast-reasoning model) to intelligently analyze Hebrew morphology, prefixes, and verse context to provide accurate Strong's number assignments.

### Key Features

- **Batch Processing**: Efficiently processes words in configurable batches (default: 200 words per API call)
- **Intelligent Assignment**: Uses AI to analyze Hebrew morphology, prefixes, and context
- **Proper Name Handling**: Distinguishes between regular Hebrew words and proper names
- **Robust Error Handling**: Includes retry logic, rate limiting, and comprehensive error recovery
- **JSON Output**: Generates structured JSON files per book with assignment results
- **Dry Run Mode**: Scan and count words without making API calls
- **Progress Tracking**: Detailed logging and progress reporting

## Requirements

- Python 3.8+
- xAI API key with access to Grok models
- Required Python packages:
  - `openai` (for Grok API integration)
  - `httpx` (HTTP client)
  - `python-dotenv` (environment variable loading)

## Installation

1. **Install Dependencies**:
   ```bash
   pip install openai python-dotenv httpx
   ```

2. **Set up API Key**:
   Create a `.env` file in the project root:
   ```
   XAI_API_KEY=xai-your-api-key-here
   ```
   Get your API key from [xAI Console](https://console.x.ai/team/default/api-keys)

3. **Verify Installation**:
   ```bash
   python -c "from scripts.delitzsch.strongs.config import validate_grok_api_key; print('API Key Valid:', validate_grok_api_key())"
   ```

## Usage

### Basic Usage

```bash
# Process all books
python -m scripts.delitzsch.strongs

# Process specific book
python -m scripts.delitzsch.strongs --book matthew

# Dry run to count words without API calls
python -m scripts.delitzsch.strongs --dry-run

# Process with custom batch size
python -m scripts.delitzsch.strongs --book jude --batch-size 50
```

### Command Line Options

- `--book BOOK`: Process specific book (e.g., matthew, john, acts)
- `--batch-size SIZE`: Number of words per API call (default: 200)
- `--dry-run`: Scan and count words without making API calls
- `--force`: Re-process books even if output files exist
- `--verbose, -v`: Enable detailed logging

### Available Books

The tool supports all 27 books of the New Testament:
- Gospels: matthew, mark, luke, john
- History: acts
- Epistles: romans, corinthians1, corinthians2, galatians, ephesians, philippians, colossians, thessalonians1, thessalonians2, timothy1, timothy2, titus, philemon, hebrews, james, peter1, peter2, john1, john2, john3, jude
- Prophecy: revelation

## Output Format

The tool generates JSON files in `data/delitzsch/parsed/strongs/` with the following structure:

```json
{
  "book": "jude",
  "total_null_words": 80,
  "total_assigned": 75,
  "total_failed": 5,
  "chapters": [
    {
      "chapter": 1,
      "assignments": [
        {
          "verse": "יְהוּדָה עֶבֶד יֵשׁוּעַ הַ/מָּשִׁיחַ וַ/אֲחִי יַעֲקֹב",
          "word_index": 0,
          "text": "וַאֲהוּבִים",
          "prefixes": ["Hc"],
          "type": "strong",
          "strong": "H157"
        }
      ]
    }
  ]
}
```

### Assignment Types

- **strong**: Regular Hebrew words with Strong's numbers (format: "H1234")
- **proper_name**: Proper names with English and Spanish translations
- **failed**: Words that couldn't be assigned (includes error details)

## Configuration

Key settings in `config.py`:

- `DEFAULT_BATCH_SIZE`: 200 words per API call (balances cost and efficiency)
- `MAX_RETRIES`: 3 retry attempts on API failures
- `RATE_LIMIT_DELAY`: 1 second between API calls
- `GROK_MODEL`: "grok-4-1-fast-reasoning" (fast reasoning model)
- `GROK_TIMEOUT`: 3600 seconds (1 hour for complex reasoning)

## Architecture

### Core Components

- **`main.py`**: CLI entry point with argument parsing
- **`processor.py`**: Orchestrates book processing and batch management
- **`assigner.py`**: Handles Grok API calls and response parsing
- **`config.py`**: Configuration and API key management

### Data Flow

1. **Scanning**: `processor.scan_book()` identifies words needing assignment
2. **Batching**: Words grouped into batches for efficient API usage
3. **Assignment**: `assigner.assign_batch()` calls Grok API for each batch
4. **Processing**: Results parsed and validated
5. **Output**: Structured JSON files saved to disk

## Error Handling

The tool includes comprehensive error handling:

- **API Failures**: Automatic retry with exponential backoff
- **Rate Limiting**: Built-in rate limiting and quota detection
- **Response Parsing**: Robust JSON extraction from AI responses
- **Validation**: Assignment validation and error reporting
- **Recovery**: Graceful handling of partial failures

## Performance

- **Batch Processing**: 200 words per API call maximizes efficiency
- **Rate Limiting**: 1-second delays between calls prevent quota issues
- **Progress Tracking**: Real-time progress reporting and statistics
- **Memory Efficient**: Processes one book at a time to minimize memory usage

## Troubleshooting

### Common Issues

1. **API Key Not Found**:
   ```bash
   # Ensure .env file exists with correct key
   echo "XAI_API_KEY=xai-your-key" > .env
   ```

2. **API Call Hanging**:
   - Check network connectivity
   - Verify API key validity
   - Try with smaller batch sizes

3. **Import Errors**:
   ```bash
   # Install missing dependencies
   pip install openai httpx python-dotenv
   ```

4. **Output File Exists**:
   ```bash
   # Use --force to overwrite existing files
   python -m scripts.delitzsch.strongs --book matthew --force
   ```

### Debug Mode

Enable verbose logging for detailed troubleshooting:

```bash
python -m scripts.delitzsch.strongs --book jude --verbose
```

## Development

### Testing

Run the test script to verify API connectivity:

```bash
python scripts/delitzsch/strongs/test_api.py
```

### Code Structure

```
scripts/delitzsch/strongs/
├── __init__.py          # Module exports
├── __main__.py          # Module entry point
├── main.py              # CLI interface
├── processor.py         # Book processing logic
├── assigner.py          # Grok API integration
├── config.py            # Configuration and constants
└── test_api.py          # API testing utilities
```

## Contributing

1. Follow the existing code patterns and error handling
2. Add comprehensive logging for debugging
3. Include docstrings for all public functions
4. Test with small batches before full runs
5. Update this README for any new features

## License

This project is part of the Davar Hebrew Bible Study App. See project root for license information.