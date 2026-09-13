"""Map TBESG English and UBS Spanish; leave leftover Spanish and all Hebrew as drafts."""

from __future__ import annotations

from pathlib import Path

from scripts.greek.parse_tagnt import strong_lookup
from scripts.greek.parse_tbesg import TbesgEntry, resolve_tbesg_entries
from scripts.greek.parse_ubs import (
    UbsSense,
    index_senses,
    sense_evidence,
    senses_for_lemma,
)
from scripts.greek.sources import STEPBIBLE_COMMIT, UBS_COMMIT
from scripts.greek.stable_json import write_json

EN_LICENSE = "CC-BY-4.0"
ES_UBS_LICENSE = "CC-BY-SA-4.0"
DRAFT_LICENSE = "davar-draft"


def definition_key(dstrong: str) -> str:
    return dstrong


def english_definition(entry: TbesgEntry) -> dict:
    return {
        "fuller": entry.fuller,
        "license": EN_LICENSE,
        "review_status": "approved",
        "revision": STEPBIBLE_COMMIT,
        "short": entry.short,
        "source": "stepbible-tbesg",
    }


def draft_definition(language: str, reason: str) -> dict:
    return {
        "fuller": None,
        "language": language,
        "license": DRAFT_LICENSE,
        "reason": reason,
        "review_status": "draft",
        "revision": STEPBIBLE_COMMIT,
        "short": None,
        "source": "english-baseline",
        "source_text": None,
    }


def ubs_definition(sense: UbsSense, evidence: dict) -> dict:
    return {
        "evidence": evidence,
        "fuller": sense.definition_long or sense.definition_short,
        "license": ES_UBS_LICENSE,
        "review_status": "imported",
        "revision": UBS_COMMIT,
        "short": sense.glosses[0] if sense.glosses else sense.definition_short,
        "source": "ubs-es",
        "ubs_entry_code": sense.entry_code,
        "ubs_lex_id": sense.lex_id,
        "ubs_lemma": sense.lemma,
    }


def match_ubs(
    entry: TbesgEntry,
    ubs_senses: list[UbsSense],
    index: dict[str, list[UbsSense]] | None = None,
) -> tuple[dict | None, dict | None]:
    """Return (spanish_definition, leftover_record). Strong’s alone is never a match."""
    candidates = senses_for_lemma(ubs_senses, entry.lemma, index=index)
    if not candidates:
        leftover = {
            "dstrong": entry.dstrong,
            "lemma": entry.lemma,
            "reason": "no_lemma_match",
            "strong": entry.dstrong,
        }
        return None, leftover
    if len(candidates) == 1:
        evidence = {
            "kind": "unique_lemma_sense",
            "lex_id": candidates[0].lex_id,
            "lemma": candidates[0].lemma,
        }
        return ubs_definition(candidates[0], evidence), None
    for candidate in candidates:
        evidence = sense_evidence(entry.short, entry.fuller, candidate)
        if evidence is not None:
            return ubs_definition(candidate, evidence), None
    leftover = {
        "candidates": [item.lex_id for item in candidates],
        "dstrong": entry.dstrong,
        "lemma": entry.lemma,
        "reason": "lemma_without_sense_evidence",
        "strong": entry.dstrong,
    }
    return None, leftover


def build_definitions(
    tbesg_entries: list[TbesgEntry],
    displayed_strongs: set[str],
    ubs_senses: list[UbsSense],
) -> dict:
    entries: dict[str, dict] = {}
    leftovers: list[dict] = []
    ubs_index = index_senses(ubs_senses)
    for displayed in sorted(displayed_strongs):
        resolved = resolve_tbesg_entries(displayed, tbesg_entries)
        if not resolved:
            continue
        senses: list[dict] = []
        for item in resolved:
            spanish, leftover = match_ubs(item, ubs_senses, index=ubs_index)
            if leftover is not None:
                leftovers.append({**leftover, "displayed": displayed})
            senses.append(
                {
                    "definitions": {
                        "en": english_definition(item),
                        "es": spanish
                        or draft_definition(
                            "es", leftover["reason"] if leftover else "unmapped"
                        ),
                        "he": draft_definition("he", "hebrew_from_english_baseline"),
                    },
                    "sense_id": item.dstrong,
                    "short_en": item.short,
                }
            )
        key = definition_key(displayed)
        entries[key] = {
            "id": key,
            "lemma": resolved[0].lemma,
            "occurrence_translation": None,
            "senses": senses,
            "strong": displayed,
            "strong_lookup": strong_lookup(displayed),
            "tbesg_dstrongs": [item.dstrong for item in resolved],
        }
    return {
        "entries": entries,
        "leftovers": leftovers,
        "missing_displayed": sorted(displayed_strongs - set(entries)),
        "source": {
            "english": "stepbible-tbesg",
            "hebrew": "english-baseline-draft",
            "spanish_mapped": "ubs-es",
            "spanish_unmapped": "english-baseline-draft",
            "stepbible_commit": STEPBIBLE_COMMIT,
            "ubs_commit": UBS_COMMIT,
        },
    }


def coverage_report(store: dict) -> dict:
    counts = {
        "en": {"approved": 0, "draft": 0, "imported": 0, "missing": 0},
        "es": {"approved": 0, "draft": 0, "imported": 0, "missing": 0},
        "he": {"approved": 0, "draft": 0, "imported": 0, "missing": 0},
    }
    for entry in store["entries"].values():
        for sense in entry["senses"]:
            for language in ("en", "es", "he"):
                definition = sense["definitions"].get(language)
                if not definition:
                    counts[language]["missing"] += 1
                    continue
                status = definition.get("review_status", "missing")
                if status not in counts[language]:
                    counts[language]["draft"] += 1
                else:
                    counts[language][status] += 1
    return {
        "entry_count": len(store["entries"]),
        "languages": counts,
        "leftover_count": len(store["leftovers"]),
        "missing_displayed": store.get("missing_displayed", []),
    }


def write_definitions(store: dict, output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    write_json(output_dir / "definitions.json", store)
    write_json(output_dir / "coverage.json", coverage_report(store))
    leftovers_note = "\n".join(
        f"- `{item['dstrong']}` {item['lemma']}: {item['reason']}"
        for item in store["leftovers"]
    ) or "- none"
    (output_dir / "MODIFICATIONS.md").write_text(
        f"""# Greek definition mappings — {STEPBIBLE_COMMIT}

English short meanings and fuller definitions are TBESG (CC BY 4.0), stored once per dStrong sense. They are not occurrence-specific translations (`occurrence_translation` is always null).

Spanish text is taken from UBSGreekNTDic-v1.0-es.JSON only when the Greek lemma matches and sense evidence exists. Unverified UBS rows are leftovers. Leftover Spanish and all Hebrew entries are `draft` until a reviewer approves them.

UBS adaptations remain CC BY-SA 4.0.

## Unmapped Spanish leftovers

{leftovers_note}
""",
        encoding="utf-8",
    )
    return output_dir
