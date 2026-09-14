import pytest

from scripts.greek.fetch import fetch_all
from scripts.greek.sources import OfficialSource


def test_fetch_all_reuses_valid_cache_without_network(tmp_path, monkeypatch):
    source = OfficialSource(
        key="sample",
        relative_path="sample.txt",
        blob_sha="dead",
        filename="sample.txt",
    )
    dest = tmp_path / "src"
    dest.mkdir()
    path = dest / source.filename
    path.write_bytes(b"hello")
    monkeypatch.setattr("scripts.greek.fetch.ALL_SOURCES", (source,))
    monkeypatch.setattr("scripts.greek.fetch.git_blob_sha", lambda _data: "dead")

    def boom(*_args, **_kwargs):
        raise AssertionError("should not download cached sources")

    monkeypatch.setattr("scripts.greek.fetch.fetch_source", boom)
    found = fetch_all(dest_dir=dest, allow_network=False)
    assert found["sample"] == path


def test_fetch_all_does_not_download_when_network_is_disabled(tmp_path, monkeypatch):
    source = OfficialSource(
        key="sample",
        relative_path="sample.txt",
        blob_sha="dead",
        filename="sample.txt",
    )
    monkeypatch.setattr("scripts.greek.fetch.ALL_SOURCES", (source,))

    def boom(*_args, **_kwargs):
        raise AssertionError("network fetch is disabled")

    monkeypatch.setattr("scripts.greek.fetch.fetch_source", boom)
    with pytest.raises(FileNotFoundError, match="network fetch is disabled"):
        fetch_all(dest_dir=tmp_path, allow_network=False)
