import json

import pytest

from scripts.knowledge import adapters


def entry(status=None):
    value = {"lemma": "פיליפוס"}
    if status is not None:
        value["publication"] = {"status": status}
    return value


def selected(entries, codes):
    blobs = {"custom": json.dumps(entries).encode()}
    records = adapters.lexical(blobs, [{"input_id": "custom", "id_namespace": "davar-custom", "codes": codes}])
    return [record["content"]["source_entry_id"] for record in records]


def test_pilot_reads_only_published_custom_entries():
    entries = {"D1": entry("approved"), "D2": entry("draft"), "D3": entry("blocked"), "D4": entry()}
    assert selected(entries, ["D1", "D2", "D3", "D4"]) == ["D1", "D4"]


def test_pilot_rejects_an_unknown_publication_status():
    with pytest.raises(ValueError, match="D1 has an invalid publication status"):
        selected({"D1": entry("reviewed")}, ["D1"])
