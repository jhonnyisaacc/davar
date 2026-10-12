"""Metadata fixtures exercise extension points without importing licensed text."""
import copy
import json
from pathlib import Path
import pytest
from jsonschema import ValidationError
from scripts.knowledge.validate import Validator
from scripts.knowledge.build import artifacts

FIXTURE = json.loads((Path(__file__).parent / "fixtures/knowledge/v2-publication.json").read_text())

def test_distinct_editions_and_independent_artifact_versions():
    validator = Validator()
    for edition in FIXTURE["editions"]:
        validator.schema("edition", edition)
    assert FIXTURE["editions"][0]["id"] != FIXTURE["editions"][1]["id"]
    for artifact in FIXTURE["artifacts"]:
        validator.schema("artifact", artifact)
    assert FIXTURE["artifacts"][0]["version"] != FIXTURE["artifacts"][1]["version"]

def test_publication_requires_review_and_distribution_permission():
    artifact = copy.deepcopy(FIXTURE["artifacts"][0])
    artifact["publication"] = "published"
    with pytest.raises(ValidationError):
        Validator().schema("artifact", artifact)
    artifact["review"] = "approved"
    artifact["permissions"]["public_distribution"] = True
    Validator().schema("artifact", artifact)

def test_contextual_relation_preserves_provenance_and_rejects_aliases():
    relation = json.loads(artifacts()["records/records.json"])["relations"][0]
    Validator().schema("relation", relation)
    relation["predicate"] = "exact_lexical_alias"
    with pytest.raises(ValidationError):
        Validator().schema("relation", relation)
