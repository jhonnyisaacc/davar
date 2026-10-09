"""The knowledge-foundation workflow guards the additive boundary, so its own
edits must not narrow CI coverage: trigger paths may only grow and existing
check commands may only gain arguments."""

import textwrap

from scripts.knowledge.compatibility import workflow_change_additive


BEFORE = textwrap.dedent(
    """\
    name: Knowledge foundation
    on:
      pull_request:
        branches: [main]
        paths:
          - 'contracts/biblical-knowledge/**'
          - 'scripts/knowledge/**'
      push:
        branches: [main]
        paths:
          - 'contracts/biblical-knowledge/**'
    jobs:
      foundation:
        runs-on: ubuntu-latest
        steps:
          - run: python -m pytest -q tests/test_knowledge_*.py
          - run: python -m scripts.knowledge check
    """
)


def vary(before=BEFORE, old=None, new=None):
    doc = before if old is None else before.replace(old, new)
    return doc.encode()


def test_identical_workflow_is_additive():
    assert workflow_change_additive(BEFORE.encode(), BEFORE.encode()) is True


def test_added_trigger_paths_and_test_file_are_additive():
    after = vary(
        old="'scripts/knowledge/**'",
        new="'scripts/knowledge/**'\n      - 'scripts/commentary/**'",
    ).decode().replace(
        "python -m pytest -q tests/test_knowledge_*.py",
        "python -m pytest -q tests/test_knowledge_*.py tests/test_commentary_corpus.py",
    )
    assert workflow_change_additive(BEFORE.encode(), after.encode()) is True


def test_added_check_step_is_additive():
    after = BEFORE.replace(
        "- run: python -m scripts.knowledge check",
        "- run: python -m scripts.knowledge check\n      - run: python -m scripts.knowledge lint",
    )
    assert workflow_change_additive(BEFORE.encode(), after.encode()) is True


def test_removed_trigger_path_is_rejected():
    after = BEFORE.replace("      - 'scripts/knowledge/**'\n", "")
    assert workflow_change_additive(BEFORE.encode(), after.encode()) is False


def test_dropped_test_file_is_rejected():
    after = BEFORE.replace(
        "python -m pytest -q tests/test_knowledge_*.py",
        "python -m pytest -q tests/test_commentary_corpus.py",
    )
    assert workflow_change_additive(BEFORE.encode(), after.encode()) is False


def test_changed_runner_or_toolchain_is_rejected():
    assert (
        workflow_change_additive(
            BEFORE.encode(),
            BEFORE.replace("ubuntu-latest", "macos-latest").encode(),
        )
        is False
    )
    assert (
        workflow_change_additive(
            BEFORE.encode(),
            BEFORE.replace(
                "python -m scripts.knowledge check",
                "python -m scripts.knowledge verify",
            ).encode(),
        )
        is False
    )


def test_unparseable_workflow_fails_closed():
    assert workflow_change_additive(b"not: [valid", BEFORE.encode()) is False
    assert workflow_change_additive(BEFORE.encode(), b"just a string") is False
