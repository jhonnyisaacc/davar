"""Download official STEPBible and UBS sources with recorded revisions."""

from __future__ import annotations

import hashlib
import shutil
import urllib.request
from pathlib import Path

from scripts.greek.sources import ALL_SOURCES, OfficialSource, STEPBIBLE_COMMIT, UBS_ES_URL

ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = ROOT / "data" / "greek" / "source"


def git_blob_sha(data: bytes) -> str:
    return hashlib.sha1(b"blob " + str(len(data)).encode("ascii") + b"\x00" + data).hexdigest()


def existing_if_valid(source: OfficialSource, dest_dir: Path) -> Path | None:
    path = dest_dir / source.filename
    if not path.is_file():
        return None
    digest = git_blob_sha(path.read_bytes())
    if digest != source.blob_sha:
        return None
    return path


def fetch_source(source: OfficialSource, dest_dir: Path, timeout: int = 60) -> Path:
    dest_dir.mkdir(parents=True, exist_ok=True)
    path = dest_dir / source.filename
    print(f"[davar-greek] fetching {source.filename}", flush=True)
    with urllib.request.urlopen(source.url, timeout=timeout) as response:
        data = response.read()
    digest = git_blob_sha(data)
    if digest != source.blob_sha:
        raise ValueError(
            f"{source.filename} blob {digest} does not match recorded {source.blob_sha}"
        )
    path.write_bytes(data)
    print(f"[davar-greek] fetched {source.filename}", flush=True)
    return path


def copy_if_present(source: OfficialSource, search_dirs: list[Path], dest_dir: Path) -> Path | None:
    for directory in search_dirs:
        candidate = directory / source.filename
        if candidate.is_file():
            dest_dir.mkdir(parents=True, exist_ok=True)
            target = dest_dir / source.filename
            shutil.copy2(candidate, target)
            digest = git_blob_sha(target.read_bytes())
            if digest != source.blob_sha:
                raise ValueError(
                    f"{candidate} blob {digest} does not match recorded {source.blob_sha}"
                )
            return target
    return None


def fetch_all(
    dest_dir: Path | None = None,
    local_dirs: list[Path] | None = None,
    include_ubs: bool = False,
    allow_network: bool = True,
) -> dict[str, Path]:
    dest = dest_dir or SOURCE_DIR / STEPBIBLE_COMMIT
    found: dict[str, Path] = {}
    search = local_dirs or []
    for source in ALL_SOURCES:
        copied = copy_if_present(source, search, dest) if search else None
        cached = existing_if_valid(source, dest)
        if copied or cached:
            print(f"[davar-greek] using cached {source.filename}", flush=True)
            found[source.key] = copied or cached
            continue
        if not allow_network:
            raise FileNotFoundError(
                f"Missing cached {source.filename} in {dest}; network fetch is disabled"
            )
        found[source.key] = fetch_source(source, dest)
    if include_ubs:
        dest.mkdir(parents=True, exist_ok=True)
        ubs_path = dest / "UBSGreekNTDic-v1.0-es.JSON"
        if ubs_path.is_file() and ubs_path.stat().st_size > 0:
            print("[davar-greek] using cached UBS Spanish lexicon", flush=True)
        elif not allow_network:
            raise FileNotFoundError(
                f"Missing cached UBS Spanish lexicon in {dest}; network fetch is disabled"
            )
        else:
            print("[davar-greek] fetching UBS Spanish lexicon", flush=True)
            with urllib.request.urlopen(UBS_ES_URL, timeout=60) as response:
                ubs_path.write_bytes(response.read())
            print("[davar-greek] fetched UBS Spanish lexicon", flush=True)
        found["ubs-es"] = ubs_path
    return found
