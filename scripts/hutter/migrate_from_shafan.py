from __future__ import annotations

import argparse
import json
import os
import shutil
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

from ..paths import ROOT


REPO_ROOT = ROOT
DEFAULT_SOURCE_ROOT = ROOT.parent / "shafan"
DEFAULT_DEST_ROOT = REPO_ROOT / "data" / "hutter" / "staging"
EXCLUDED_NAMES = {".DS_Store", "__pycache__"}


@dataclass(frozen=True)
class Mapping:
    source_rel: str
    destination_rel: str


@dataclass
class MappingResult:
    source_rel: str
    destination_rel: str
    files_copied: int
    directories_created: int
    bytes_copied: int


MAPPINGS = [
    Mapping("data/images", "data/images"),
    Mapping("data/review", "data/review"),
    Mapping("data/source", "data/source"),
    Mapping("data/temp", "data/temp"),
    Mapping("output", "output"),
    Mapping("scripts/hebrew_images", "scripts/hebrew_images"),
    Mapping("scripts/images", "scripts/images"),
    Mapping("scripts/pdf", "scripts/pdf"),
    Mapping("scripts/review", "scripts/review"),
    Mapping("scripts/text", "scripts/text"),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Copy Hutter-related files from a local Shafan checkout into Davar staging.",
    )
    parser.add_argument(
        "--source-root",
        type=Path,
        default=DEFAULT_SOURCE_ROOT,
        help=f"Root Shafan directory (default: {DEFAULT_SOURCE_ROOT})",
    )
    parser.add_argument(
        "--dest-root",
        type=Path,
        default=DEFAULT_DEST_ROOT,
        help=f"Destination staging directory (default: {DEFAULT_DEST_ROOT})",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate and print the plan without copying files.",
    )
    return parser.parse_args()


def ensure_source_exists(source_root: Path) -> None:
    missing = [mapping.source_rel for mapping in MAPPINGS if not (
        source_root / mapping.source_rel).exists()]
    if missing:
        missing_text = "\n".join(f"- {path}" for path in missing)
        raise FileNotFoundError(
            f"Missing required Shafan paths:\n{missing_text}")


def copy_mapping(source_root: Path, dest_root: Path, mapping: Mapping, dry_run: bool) -> MappingResult:
    source_dir = source_root / mapping.source_rel
    destination_dir = dest_root / mapping.destination_rel
    files_copied = 0
    directories_created = 0
    bytes_copied = 0

    if not dry_run and not destination_dir.exists():
        destination_dir.mkdir(parents=True, exist_ok=True)
        directories_created += 1

    for current_root, dirs, files in os.walk(source_dir):
        dirs[:] = [directory for directory in dirs if directory not in EXCLUDED_NAMES]
        relative_root = Path(current_root).relative_to(source_dir)
        target_root = destination_dir / relative_root

        if not dry_run and not target_root.exists():
            target_root.mkdir(parents=True, exist_ok=True)
            directories_created += 1

        for file_name in files:
            if file_name in EXCLUDED_NAMES:
                continue

            source_file = Path(current_root) / file_name
            target_file = target_root / file_name
            file_size = source_file.stat().st_size

            if not dry_run:
                shutil.copy2(source_file, target_file)

            files_copied += 1
            bytes_copied += file_size

    return MappingResult(
        source_rel=mapping.source_rel,
        destination_rel=mapping.destination_rel,
        files_copied=files_copied,
        directories_created=directories_created,
        bytes_copied=bytes_copied,
    )


def write_manifest(dest_root: Path, source_root: Path, dry_run: bool, results: list[MappingResult]) -> Path:
    manifest_path = dest_root / "migration_manifest.json"
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_root": str(source_root),
        "destination_root": str(dest_root),
        "dry_run": dry_run,
        "excluded_names": sorted(EXCLUDED_NAMES),
        "mappings": [asdict(result) for result in results],
        "totals": {
            "files_copied": sum(result.files_copied for result in results),
            "directories_created": sum(result.directories_created for result in results),
            "bytes_copied": sum(result.bytes_copied for result in results),
        },
    }

    if not dry_run:
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(json.dumps(
            payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")

    return manifest_path


def format_bytes(num_bytes: int) -> str:
    units = ["B", "KB", "MB", "GB", "TB"]
    size = float(num_bytes)
    for unit in units:
        if size < 1024 or unit == units[-1]:
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{num_bytes} B"


def main() -> int:
    args = parse_args()
    source_root = args.source_root.expanduser().resolve()
    dest_root = args.dest_root.expanduser().resolve()

    ensure_source_exists(source_root)

    results = [copy_mapping(source_root, dest_root,
                            mapping, args.dry_run) for mapping in MAPPINGS]
    manifest_path = write_manifest(
        dest_root, source_root, args.dry_run, results)

    total_files = sum(result.files_copied for result in results)
    total_directories = sum(result.directories_created for result in results)
    total_bytes = sum(result.bytes_copied for result in results)

    mode = "Dry run" if args.dry_run else "Migration"
    print(f"{mode} completed")
    print(f"Source root: {source_root}")
    print(f"Destination root: {dest_root}")
    print(f"Files: {total_files}")
    print(f"Directories created: {total_directories}")
    print(f"Bytes: {format_bytes(total_bytes)}")
    print(f"Manifest: {manifest_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
