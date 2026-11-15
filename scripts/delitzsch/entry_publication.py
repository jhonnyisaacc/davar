"""Publication status for the custom D entries that the Delitzsch text references.

write: set each entry's `publication` from the review decision log.
check: fail when a committed `publication` differs from what write would set, or
when a custom entry repeats a definition order.

Rules, first match wins:
- blocked (pending_manual_review): a needs_manual_review decision names the entry.
- approved (reviewed_definition_decision): every definition that is not an import
  matches an applied create_custom_entry or upsert_custom_definition decision for
  the entry that names its reviewer.
- draft (unreviewed_definition): anything else.
"""
from __future__ import annotations

import argparse
import json
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

from scripts.delitzsch.definition_coverage import LEXICON, ROOT, SPEC, occurrence_counts

STATUSES = tuple(SPEC["statuses"])
DECISIONS = ROOT / "data/delitzsch/review/decisions"
CUSTOM = LEXICON / "custom_definitions.json"
RULE_VERSION = 1
DEFINITION_ACTIONS = {"create_custom_entry", "upsert_custom_definition"}
APPLIED = {"applied", "already_applied"}


@dataclass
class Ledger:
    reviewed: dict[str, dict[tuple[str, str], str]] = field(default_factory=lambda: defaultdict(dict))
    pending: dict[str, str] = field(default_factory=dict)


def text_pair(definition: dict) -> tuple[str, str]:
    return ((definition.get("text_en") or "").strip(), (definition.get("text_es") or "").strip())


def load_ledger(decisions: Path = DECISIONS) -> Ledger:
    ledger = Ledger()
    for path in sorted(decisions.glob("*.jsonl")):
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            decision = json.loads(line)
            key = (decision.get("custom_key") or decision.get("new_strong") or "").strip().upper()
            if not key.startswith("D"):
                continue
            ref = f"{path.name}:{number}"
            if decision["action"] == "needs_manual_review":
                ledger.pending.setdefault(key, ref)
            elif decision["action"] in DEFINITION_ACTIONS and decision.get("status") in APPLIED and decision.get("reviewer"):
                ledger.reviewed[key].setdefault(text_pair(decision.get("definition") or {}), f"{ref} {decision['reviewer']}")
    return ledger


def status(value: str, rule: str, evidence: list[str]) -> dict:
    assert value in STATUSES, value
    return {"status": value, "rule": rule, "rule_version": RULE_VERSION, "evidence": evidence}


def publication(key: str, entry: dict, ledger: Ledger) -> dict:
    if key in ledger.pending:
        return status("blocked", "pending_manual_review", [ledger.pending[key]])
    reviewed = ledger.reviewed.get(key, {})
    own = [definition for definition in entry.get("definitions") or [] if definition.get("review_status") != "imported"]
    refs = [reviewed.get(text_pair(definition)) for definition in own]
    if own and all(refs):
        return status("approved", "reviewed_definition_decision", sorted(set(refs)))
    unmatched = [f"definition order {definition.get('order')} has no reviewed decision" for definition, ref in zip(own, refs) if not ref]
    return status("draft", "unreviewed_definition", unmatched or ["entry has no definitions of its own"])


def referenced_custom_keys(custom: dict, counts) -> list[str]:
    return sorted(key for key in counts if key.startswith("D") and key in custom)


def apply(custom: dict, keys: list[str], ledger: Ledger) -> list[str]:
    changed = []
    for key in keys:
        value = publication(key, custom[key], ledger)
        if custom[key].get("publication") != value:
            custom[key]["publication"] = value
            changed.append(key)
    return changed


def duplicate_orders(custom: dict) -> list[str]:
    errors = []
    for key, entry in sorted(custom.items()):
        orders = [definition.get("order") for definition in entry.get("definitions") or []]
        repeated = sorted({order for order in orders if orders.count(order) > 1}, key=str)
        if repeated:
            errors.append(f"{key} repeats definition orders {repeated}; renumber it with a renumber_custom_definitions decision")
    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", choices=["write", "check"])
    args = parser.parse_args(argv)
    custom = json.loads(CUSTOM.read_text(encoding="utf-8"))
    keys = referenced_custom_keys(custom, occurrence_counts())
    changed = apply(custom, keys, load_ledger())
    if args.command == "check":
        errors = [f"{key} publication is stale; run python -m scripts.delitzsch.entry_publication write" for key in changed]
        errors += duplicate_orders(custom)
        for error in errors:
            print(error)
        return 1 if errors else 0
    if changed:
        CUSTOM.write_text(json.dumps(custom, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    by_status: dict[str, list[str]] = defaultdict(list)
    for key in keys:
        by_status[custom[key]["publication"]["status"]].append(key)
    print(json.dumps({"changed": len(changed), "by_status": dict(sorted(by_status.items()))}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
