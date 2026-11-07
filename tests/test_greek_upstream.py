from scripts.greek import upstream
from scripts.greek.sources import ALL_SOURCES, UBS_COMMIT, UBS_ES_BLOB_SHA, UBS_ES_PATH


def _fake_upstream(monkeypatch, ubs_es_blob):
    heads = {
        "STEPBible/STEPBible-Data": ("master", "step-new-head"),
        "ubsicap/ubs-open-license": ("main", "ubs-new-head"),
    }
    recorded_step_blobs = {source.relative_path: source.blob_sha for source in ALL_SOURCES}

    def blob_sha(repository, path, _commit):
        if repository == "ubsicap/ubs-open-license":
            assert path == UBS_ES_PATH
            return ubs_es_blob
        return recorded_step_blobs[path]

    monkeypatch.setattr(upstream, "_repository_head", heads.__getitem__)
    monkeypatch.setattr(upstream, "_blob_sha", blob_sha)


def test_ubs_commit_without_spanish_file_change_is_not_reported(monkeypatch):
    _fake_upstream(monkeypatch, UBS_ES_BLOB_SHA)

    report = upstream.check_upstream()

    assert report["changed"] == []
    assert report["has_changes"] is False
    assert report["repositories"]["ubsicap/ubs-open-license"]["recorded"] == UBS_COMMIT


def test_spanish_file_change_is_reported(monkeypatch):
    _fake_upstream(monkeypatch, "0" * 40)

    report = upstream.check_upstream()

    assert report["changed"] == ["ubs-es"]
    ubs = next(source for source in report["sources"] if source["key"] == "ubs-es")
    assert ubs["recorded_blob_sha"] == UBS_ES_BLOB_SHA
