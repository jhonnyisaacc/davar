"""Schema extensions cannot turn the foundation gate into a payload exception."""
import copy
from scripts.knowledge.compatibility import publication_compatible
from scripts.knowledge.core import encoded


def test_optional_artifact_schema_extension_cannot_change_existing_contract():
    path = "contracts/biblical-knowledge/v1/manifest.schema.json"
    old = {"properties": {"files": {"type": "array"}}, "required": ["files"]}
    new = copy.deepcopy(old)
    new["properties"]["artifacts"] = {"type": "array", "items": {"$ref": "https://davar.bible/contracts/biblical-knowledge/v1/artifact.schema.json"}}
    assert publication_compatible(path, encoded(old), encoded(new))
    new["required"].append("artifacts")
    assert not publication_compatible(path, encoded(old), encoded(new))
    new["required"].remove("artifacts")
    new["properties"]["files"] = {"type": "string"}
    assert not publication_compatible(path, encoded(old), encoded(new))


def test_rehash_exception_rejects_reading_and_source_changes():
    path = "data/knowledge/generated/pilot-v1/bundles/john/1/1.json"
    old = {"input_manifest_digest": "before", "records": {"text": "preserved"}}
    new = copy.deepcopy(old)
    new["input_manifest_digest"] = "after"
    assert publication_compatible(path, encoded(old), encoded(new))
    new["records"]["text"] = "changed"
    assert not publication_compatible(path, encoded(old), encoded(new))
    path = "data/knowledge/generated/pilot-v1/manifest.json"
    old = {"input_manifest_digest": "before", "files": [{"path": "bundle.json", "sha256": "before"}], "inputs": [{"revision": "pinned"}]}
    new = copy.deepcopy(old)
    new["files"][0]["sha256"] = "after"
    assert publication_compatible(path, encoded(old), encoded(new))
    new["inputs"][0]["revision"] = "changed"
    assert not publication_compatible(path, encoded(old), encoded(new))


def test_documentation_exception_is_append_only_and_other_paths_stay_closed():
    path = "contracts/biblical-knowledge/v1/README.md"
    assert publication_compatible(path, b"kept\n", b"kept\nadded\n")
    assert not publication_compatible(path, b"kept\n", b"changed\n")
    assert not publication_compatible("data/knowledge/kept.json", b"{}", b"{}")
