"""Declarative build selection; no executable extensions or network discovery."""

from .core import contained, read_json
from .validate import Validator

DEFAULT_PROFILE = "data/knowledge/profiles/pilot-v1.json"


def load_profile(root, path=None):
    profile = read_json(contained(root, path or DEFAULT_PROFILE))
    Validator(root).schema("profile", profile)
    for selected in (
        profile["input_manifest"],
        profile["reference_mappings"],
        *profile["authored"].values(),
    ):
        contained(root, selected)
    return profile


def validate_selections(profile, manifest, registries):
    inputs = {item["id"]: item for item in manifest["inputs"]}
    editions = {e["id"] for e in registries["editions"]}
    books = {b["id"] for b in registries["books"]}
    for group in ("scripture", "lexical", "shaul"):
        for spec in profile[group]:
            if spec["input_id"] not in inputs:
                raise ValueError("Unknown selected input: " + spec["input_id"])
            if (group == "shaul") != (inputs[spec["input_id"]]["owner"] == "shaul"):
                raise ValueError("Adapter and source owner disagree")
    for spec in profile["scripture"]:
        if spec["edition_id"] not in editions or spec["book_id"] not in books:
            raise ValueError("Unknown selected edition or book")
    seen = set()
    for entry in profile["coverage"]:
        ref = entry["reference"]
        if ref["kind"] != "verse":
            raise ValueError("Bundle coverage requires a verse reference")
        key = (ref["book_id"], ref["chapter"], ref["verse"])
        if list(key) not in manifest["pilots"] or entry["edition_id"] not in editions:
            raise ValueError("Coverage outside requested bundles or editions")
        key += (entry["edition_id"],)
        if key in seen:
            raise ValueError("Duplicate coverage declaration")
        seen.add(key)
    if len(seen) != len(manifest["pilots"]) * len(editions):
        raise ValueError(
            "Declare coverage for each requested bundle and registered edition"
        )
