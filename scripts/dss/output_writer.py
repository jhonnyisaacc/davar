#!/usr/bin/env python3
"""
Output file writing utilities
"""

import json
from datetime import datetime
from pathlib import Path
from typing import Dict


from .config import OUTPUT_DIR, SOURCE_URL, LICENSE


class OutputWriter:
    """Handles writing output files and metadata."""
    
    def __init__(self, output_dir: Path = OUTPUT_DIR):
        """
        Initialize output writer.
        
        Args:
            output_dir: Directory to write output files
        """
        self.output_dir = output_dir
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        # Create books subdirectory
        self.books_dir = self.output_dir / "books"
        self.books_dir.mkdir(parents=True, exist_ok=True)
    
    def write_differences(self, all_books: Dict) -> list:
        """
        Write individual JSON files for each book.
        
        Args:
            all_books: Dictionary of all processed books
            
        Returns:
            List of paths to written files
        """
        print(f"\n{'='*60}")
        print(f"Writing book files to {self.books_dir}")
        
        written_files = []
        
        for book_key, book_data in all_books.items():
            output_file = self.books_dir / f"{book_key}.json"
            
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(book_data, f, ensure_ascii=False, indent=2)
            
            written_files.append(output_file)
            print(f"  - {output_file.name}")
        
        print(f"Wrote {len(written_files)} book files")
        return written_files
    
    def write_metadata(self, stats: Dict) -> Path:
        """
        Write the metadata JSON file.
        
        Args:format': 'Individual JSON files per book in books/ subdirectory',
            'statistics': stats
        }
        
        metadata_file = self.output_dir / "metadata.json"
        print(f"\n to written file
        """
        metadata = {
            'source': SOURCE_URL,
            'license': LICENSE,
            'extraction_date': datetime.now().isoformat(),
            'statistics': stats
        }
        
        metadata_file = self.output_dir / "metadata.json"
        print(f"Writing metadata to {metadata_file}")
        
        with open(metadata_file, 'w', encoding='utf-8') as f:
            json.dump(metadata, f, ensure_ascii=False, indent=2)
        
        return metadata_file
    
    def print_summary(self, stats: Dict):
        """
        Print a summary of the processing results.
        
        Args:
            stats: Statistics dictionary
        """
        print(f"\n{'='*60}")
        print("SUMMARY")
        print(f"{'='*60}")
        print(f"Books processed: {stats['total_books']}")
        print(f"Total differences: {stats['total_differences']}")
        print(f"\nBooks included:")
        for book in sorted(stats['books_processed']):
            print(f"  - {book}")
        print(f"\n{'='*60}")
        print("Done!")
