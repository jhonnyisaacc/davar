#!/usr/bin/env python3
"""
DOCX to Markdown Converter Module
==================================

Converts DOCX files to normalized Markdown format for TTH2 processing.
Simplified version focused on the TTH2 workflow.

Features:
- Converts DOCX using mammoth library
- Normalizes footnote format
- Handles Hebrew text and special formatting
- Cleans HTML artifacts
- Processes verse markers and structure

Author: Davar Project
"""

import os
import re
import sys
import logging
from pathlib import Path
from typing import Optional, List, Tuple

try:
    import mammoth
    MAMMOTH_AVAILABLE = True
except ImportError:
    MAMMOTH_AVAILABLE = False
    print("Warning: The 'mammoth' library is not installed.")
    print("Some features will be limited. Install it with: pip install mammoth")

logger = logging.getLogger('tth2.docx_to_md')


class TTH2DocxConverter:
    """
    Converts DOCX files to normalized Markdown format for TTH2 processing.
    """

    def __init__(self):
        """Initialize the converter with processing rules."""
        pass

    def normalize_footnotes(self, text: str) -> str:
        """
        Normalize footnotes from HTML format to Markdown format.

        Converts various footnote reference formats to standard [^número] format.
        """
        # Convert footnote references: <a id="footnote-ref-1"></a>[^1] -> [^1]
        text = re.sub(r'<a id="footnote-ref-\d+"></a>\s*', '', text)

        # Convert other HTML anchor references
        text = re.sub(r'<a id="_Hlk\d+"></a>\s*', '', text)

        # Convert footnote references: [\[1\]](#footnote-1) -> [^1]
        text = re.sub(r'\[\\\[(\d+)\\\]\]\(#footnote-\d+\)', r'[^\1]', text)

        # Convert footnote references: [[1]](#footnote-1) -> [^1]
        text = re.sub(r'\[\[(\d+)\]\]\(#footnote-\d+\)', r'[^\1]', text)

        # Clean duplicate footnote markers
        text = re.sub(r'\[\^(\d+)\]\[\[.*?\#footnote-\d+\]', r'[^\1]', text)

        # Convert footnote definitions at the end of document
        def replace_footnote_definition(match):
            num = match.group(1)
            content = match.group(2).strip()

            # Remove back references [↑](#footnote-ref-1)
            content = re.sub(
                r'\s*\[↑\]\s*\(#footnote-ref-\d+\)\s*$', '', content)
            content = re.sub(
                r'\s*\[.*?\]\s*\(#footnote-ref-\d+\)\s*\d*\.?\s*$', '', content)

            # Clean up any remaining HTML
            content = re.sub(r'<[^>]+>', '', content)
            content = re.sub(r'\s+', ' ', content).strip()

            return f'\n[^{num}]: {content}\n'

        # Process footnote definitions
        text = re.sub(
            r'<a id="footnote-(\d+)"[^>]*></a>\s*([^<\n]+)',
            replace_footnote_definition,
            text
        )

        # Clean up footnote definition lines
        lines = text.split('\n')
        cleaned_lines = []
        for line in lines:
            if re.match(r'\[\^\d+\]:', line):
                # Remove any remaining back references at end of footnote lines
                line = re.sub(
                    r'\s*\[.*?\]\(#footnote-ref-\d+\)\s*\d*\.?\s*$', '', line)
            cleaned_lines.append(line)

        return '\n'.join(cleaned_lines)

    def normalize_verse_markers(self, text: str) -> str:
        """
        Normalize verse markers to standard format.
        """
        # Convert __número__ to **número** (standard verse format)
        text = re.sub(r'__\s*(\d+)\s*__', r'**\1**', text)

        # Convert line-leading empty verse markers to **1** only when they
        # appear as standalone markers at the start of a line.
        # This avoids corrupting mid-verse artifacts like "Y__ __...".
        text = re.sub(r'(?m)^__\s*__\s*', r'**1** ', text)

        # Convert any remaining __número__ format
        text = re.sub(r'__(\d+)__', r'**\1**', text)

        return text

    def clean_html_artifacts(self, text: str) -> str:
        """
        Clean HTML artifacts and normalize formatting.
        """
        # Remove any remaining HTML tags
        text = re.sub(r'<[^>]+>', '', text)

        # Normalize whitespace
        text = re.sub(r'[ \t]+', ' ', text)

        # Normalize line breaks (max 3 consecutive newlines)
        text = re.sub(r'\n{4,}', '\n\n\n', text)

        # Clean up lines
        lines = text.split('\n')
        cleaned_lines = []

        for line in lines:
            line = line.rstrip()

            # Skip very long lines that look like base64 images
            if len(line) > 10000 and ('/' in line or '+' in line or 'data:image' in line):
                continue

            # Clean up markdown formatting
            # Convert ***+ to ** (bold)
            line = re.sub(r'\*{3,}', '**', line)

            # Remove unnecessary backslash escapes
            line = re.sub(r'\\([.;:,!?])', r'\1', line)

            # Fix spacing around verse markers
            line = re.sub(
                r'\*\*(\d+)\*\*([A-Za-zÁÉÍÓÚáéíóúñÑ\u0590-\u05FF])', r'**\1** \2', line)

            cleaned_lines.append(line)

        text = '\n'.join(cleaned_lines)

        # Remove leading newlines
        text = text.lstrip('\n')

        return text

    def add_missing_verse_1_markers(self, text: str) -> str:
        """
        Add **1** marker to verse 1 content that follows chapter markers without explicit verse marker.

        In TTH documents, verse 1 often appears without an explicit __1__ marker after the chapter marker.
        This method detects such content and prepends **1** to it.
        """
        lines = text.split('\n')
        result_lines = []
        just_saw_chapter_marker = False
        chapter_marker_line_idx = -1

        for i, line in enumerate(lines):
            stripped = line.strip()

            # Check if this is a chapter marker (single **número** on its own line)
            chapter_match = re.match(r'^\*\*(\d+)\*\*\s*$', stripped)

            if chapter_match:
                result_lines.append(line)
                just_saw_chapter_marker = True
                chapter_marker_line_idx = len(result_lines) - 1
                continue

            # If we just saw a chapter marker and this line has content
            if just_saw_chapter_marker and stripped:
                # Check if line starts with a verse marker
                if not re.match(r'^\*\*\d+\*\*', stripped):
                    # This is verse 1 content without a marker - add **1**
                    line = f"**1** {stripped}"
                just_saw_chapter_marker = False

            # Empty lines don't reset the flag
            if stripped:
                just_saw_chapter_marker = False

            result_lines.append(line)

        return '\n'.join(result_lines)

    def separate_inline_verses(self, text: str) -> str:
        """
        Separate verses that are on the same line into individual lines.
        """
        lines = text.split('\n')
        separated_lines = []

        for line in lines:
            # Skip lines that don't contain verse markers
            if not re.search(r'\*\*\d+\*\*', line):
                separated_lines.append(line)
                continue

            # Count verse markers in line
            verse_count = len(re.findall(r'\*\*(\d+)\*\*', line))
            if verse_count <= 1:
                separated_lines.append(line)
                continue

            # Separate verses into individual lines
            matches = list(re.finditer(r'\*\*(\d+)\*\*', line))
            if len(matches) <= 1:
                separated_lines.append(line)
                continue

            # Split line by verses
            for i, match in enumerate(matches):
                start = match.start()
                if i < len(matches) - 1:
                    end = matches[i + 1].start()
                else:
                    end = len(line)

                verse_text = line[start:end].strip()
                if verse_text:
                    separated_lines.append(verse_text)

        return '\n'.join(separated_lines)

    def convert_docx_to_markdown(self, input_file: str, output_file: Optional[str] = None, verbose: bool = False) -> Tuple[str, List[str]]:
        """
        Convert DOCX file to normalized Markdown format.

        Args:
            input_file: Path to input DOCX file
            output_file: Path to output Markdown file (auto-generated if None)
            verbose: If True, print detailed progress messages

        Returns:
            Tuple of (output_file_path, warning_messages)
        """
        if not MAMMOTH_AVAILABLE:
            raise RuntimeError(
                "Mammoth library is not available. Install it with: pip install mammoth")

        # Validate input file
        if not os.path.exists(input_file):
            raise FileNotFoundError(f"Input file not found: {input_file}")

        # Generate output filename if not provided
        if output_file is None:
            input_path = Path(input_file)
            output_file = str(input_path.with_suffix('.md'))

        try:
            # Convert DOCX to Markdown
            with open(input_file, "rb") as docx_file:
                result = mammoth.convert_to_markdown(docx_file)
                markdown_text = result.value

            # Collect warnings
            warnings = []
            if result.messages:
                warnings = [str(msg) for msg in result.messages]

            # Apply transformations (silently unless verbose)
            markdown_text = self.normalize_footnotes(markdown_text)
            markdown_text = self.normalize_verse_markers(markdown_text)
            markdown_text = self.add_missing_verse_1_markers(markdown_text)
            markdown_text = self.separate_inline_verses(markdown_text)
            markdown_text = self.clean_html_artifacts(markdown_text)

            # Save result
            with open(output_file, 'w', encoding='utf-8') as md_file:
                md_file.write(markdown_text)

            return output_file, warnings

        except Exception as e:
            raise RuntimeError(f"Error during conversion: {e}") from e


def convert_docx(input_file: str, output_file: Optional[str] = None, verbose: bool = False) -> Tuple[str, List[str]]:
    """
    Convenience function to convert a single DOCX file.

    Args:
        input_file: Path to input DOCX file
        output_file: Path to output Markdown file (optional)
        verbose: If True, print detailed progress messages

    Returns:
        Tuple of (output_file_path, warning_messages)
    """
    converter = TTH2DocxConverter()
    return converter.convert_docx_to_markdown(input_file, output_file, verbose)


if __name__ == '__main__':
    # CLI usage
    if len(sys.argv) < 2:
        print("Uso: python docx_to_md.py <archivo_docx> [archivo_salida.md]")
        sys.exit(1)

    input_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else None

    try:
        output_path, warnings = convert_docx(input_file, output_file)

        if warnings:
            print("\nWarnings:")
            for warning in warnings:
                print(f"  - {warning}")

    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
