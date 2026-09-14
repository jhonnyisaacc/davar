"""CLI for the Greek Besorah TAGNT/TBESG importer.

Repeatable commands:

    python -m scripts.greek fetch [--local DIR]
    python -m scripts.greek import --source-dir DIR --output-dir DIR
    python -m scripts.greek define --import-dir DIR --ubs FILE --output-dir DIR
    python -m scripts.greek check --import-dir DIR
"""

from __future__ import annotations

import argparse
from pathlib import Path

from scripts.greek.definitions import build_definitions, coverage_report, write_definitions
from scripts.greek.fetch import SOURCE_DIR, fetch_all
from scripts.greek.translate import (
    DEFAULT_DEFINITIONS_DIR,
    apply_translation_cache,
    default_cache_path,
    load_cache,
    load_settings,
    run_translation,
)
from scripts.greek.importer import (
    DEFAULT_OUTPUT,
    bundle_bytes,
    build_bundle,
    default_source_paths,
    write_bundle,
)
from scripts.greek.parse_tbesg import parse_tbesg_file
from scripts.greek.parse_ubs import parse_ubs_file
from scripts.greek.publish import (
    DEFAULT_PUBLIC_DIR,
    DEFAULT_SOURCE_DIR,
    build_and_publish_preview,
    validate_release_tree,
)
from scripts.greek.sources import STEPBIBLE_COMMIT
from scripts.greek.stable_json import read_json
from scripts.greek.release_gate import validate_public_enablement
from scripts.greek.upstream import (
    check_upstream,
    write_github_output,
    write_upstream_report,
)


def cmd_fetch(args: argparse.Namespace) -> int:
    local = [Path(args.local)] if args.local else None
    found = fetch_all(
        dest_dir=Path(args.dest) if args.dest else SOURCE_DIR / STEPBIBLE_COMMIT,
        local_dirs=local,
        include_ubs=args.ubs,
    )
    for key, path in found.items():
        print(f"{key}\t{path}")
    return 0


def cmd_import(args: argparse.Namespace) -> int:
    source_dir = Path(args.source_dir)
    tagnt, tbesg = default_source_paths(source_dir)
    output = Path(args.output_dir)
    bundle = build_bundle(
        [path.read_text(encoding="utf-8") for path in tagnt],
        tbesg.read_text(encoding="utf-8"),
    )
    write_bundle(bundle, output)
    first = bundle_bytes(bundle)
    second = bundle_bytes(
        build_bundle(
            [path.read_text(encoding="utf-8") for path in tagnt],
            tbesg.read_text(encoding="utf-8"),
        )
    )
    if first != second:
        raise SystemExit("Importer output was not byte-stable across two rebuilds")
    print(output)
    return 0


def cmd_define(args: argparse.Namespace) -> int:
    import_dir = Path(args.import_dir)
    occurrences = read_json(import_dir / "occurrences.json")
    tbesg_text = Path(args.tbesg).read_text(encoding="utf-8") if args.tbesg else None
    if tbesg_text is None:
        lexicon = read_json(import_dir / "lexicon.json")
        from scripts.greek.parse_tbesg import TbesgEntry

        entries = [
            TbesgEntry(
                estrong=item["estrong"],
                dstrong=item["strong"],
                related=item["related"],
                lemma=item["lemma"],
                translit_en=item["translit_en"],
                morph=item["morph"],
                short=item["short"],
                fuller_html=item["fuller_html"],
                fuller=item["fuller"],
            )
            for item in lexicon.values()
        ]
    else:
        entries = parse_tbesg_file(tbesg_text)
    ubs = parse_ubs_file(Path(args.ubs).read_text(encoding="utf-8"))
    store = build_definitions(entries, set(occurrences), ubs)
    apply_translation_cache(store, load_cache(default_cache_path()))
    output = Path(args.output_dir)
    write_definitions(store, output)
    report = coverage_report(store)
    print(output)
    print(report)
    return 0


def cmd_check(args: argparse.Namespace) -> int:
    import_dir = Path(args.import_dir)
    source = read_json(import_dir / "source.json")
    coverage = read_json(import_dir / "coverage.json")
    occurrences = read_json(import_dir / "occurrences.json")
    if source["reading_edition"] != "sblgnt":
        raise SystemExit("reading edition must be sblgnt")
    if coverage["book_count"] != coverage["expected_book_count"]:
        raise SystemExit("imported book count does not match the 27-book Besorah")
    for strong, bucket in occurrences.items():
        if not strong.startswith("G") or bucket["namespace"] != "G":
            raise SystemExit(f"non-Greek Strong namespace: {strong}")
        if bucket["count"] != len(bucket["references"]):
            raise SystemExit(f"occurrence mismatch: {strong}")
    print("ok")
    return 0


def cmd_publish_preview(args: argparse.Namespace) -> int:
    output = build_and_publish_preview(
        source_dir=Path(args.source_dir),
        public_data_dir=Path(args.public_data_dir),
        force=args.force,
        allow_fetch=not args.no_fetch,
    )
    print(output)
    return 0


def cmd_validate_release(args: argparse.Namespace) -> int:
    public_data_dir = Path(args.public_data_dir)
    manifest = read_json(public_data_dir / "greek" / "manifest.json")
    release_dir = (
        public_data_dir
        / "greek"
        / "releases"
        / manifest["edition"]
        / manifest["revision"]
    )
    validate_release_tree(release_dir, manifest)
    print(release_dir)
    return 0


def cmd_upstream(args: argparse.Namespace) -> int:
    report = check_upstream()
    write_upstream_report(
        report,
        Path(args.output),
        Path(args.markdown_output) if args.markdown_output else None,
    )
    if args.github_output:
        write_github_output(report, Path(args.github_output))
    print(Path(args.output))
    return 2 if args.fail_on_change and report["has_changes"] else 0


def cmd_translate(args: argparse.Namespace) -> int:
    targets = tuple(
        language
        for language, enabled in (("es", args.es), ("he", args.he))
        if enabled
    ) or ("es", "he")
    definitions_dir = Path(args.definitions_dir)
    store_path = definitions_dir / "definitions.json"
    if not store_path.is_file():
        raise SystemExit(
            f"Missing {store_path}. Run `python -m scripts.greek define` first."
        )
    store = read_json(store_path)
    settings = (
        None
        if args.dry_run or args.script_only
        else load_settings(model=args.model, concurrency=args.concurrency)
    )
    result = run_translation(
        store,
        targets,
        Path(args.cache) if args.cache else default_cache_path(),
        settings=settings,
        dry_run=args.dry_run,
        script_only=args.script_only,
        force=args.force,
        limit=args.limit,
    )
    if not args.dry_run:
        write_definitions(result["store"], definitions_dir)
    report = coverage_report(result["store"])
    print(definitions_dir)
    print(report)
    return 0


def cmd_public_gate(args: argparse.Namespace) -> int:
    result = validate_public_enablement(
        Path(args.public_data_dir),
        Path(args.approvals),
        Path(args.qa_report),
    )
    print(result)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m scripts.greek")
    sub = parser.add_subparsers(dest="command", required=True)

    fetch = sub.add_parser("fetch", help="Download recorded official TAGNT/TBESG revisions")
    fetch.add_argument("--dest")
    fetch.add_argument("--local", help="Copy from a local directory of official filenames")
    fetch.add_argument("--ubs", action="store_true")
    fetch.set_defaults(func=cmd_fetch)

    importer = sub.add_parser("import", help="Build SBLGNT text, lexicon, and occurrences")
    importer.add_argument("--source-dir", required=True)
    importer.add_argument("--output-dir", default=str(DEFAULT_OUTPUT))
    importer.set_defaults(func=cmd_import)

    define = sub.add_parser("define", help="Map TBESG/UBS definitions without runtime AI")
    define.add_argument("--import-dir", required=True)
    define.add_argument("--ubs", required=True)
    define.add_argument("--tbesg")
    define.add_argument("--output-dir", required=True)
    define.set_defaults(func=cmd_define)

    translate = sub.add_parser(
        "translate",
        help="Fill leftover Spanish and all Hebrew drafts via OpenRouter",
    )
    translate.add_argument(
        "--definitions-dir",
        default=str(DEFAULT_DEFINITIONS_DIR),
    )
    translate.add_argument("--cache", help="Content-addressed translation cache")
    translate.add_argument("--es", action="store_true", help="Missing Spanish only")
    translate.add_argument("--he", action="store_true", help="Missing Hebrew only")
    translate.add_argument("--model", help="Override OPENROUTER_MODEL")
    translate.add_argument("--concurrency", type=int, help="Parallel OpenRouter requests")
    translate.add_argument("--limit", type=int, help="Translate at most N rows")
    translate.add_argument(
        "--force",
        action="store_true",
        help="Retranslate even if the cache already has a row",
    )
    translate.add_argument(
        "--dry-run",
        action="store_true",
        help="Count unique rows and batches without calling OpenRouter",
    )
    translate.add_argument(
        "--script-only",
        action="store_true",
        help="Apply verse-ref and abbreviation maps without calling OpenRouter",
    )
    translate.set_defaults(func=cmd_translate)

    check = sub.add_parser("check", help="Validate a built import directory")
    check.add_argument("--import-dir", required=True)
    check.set_defaults(func=cmd_check)

    preview = sub.add_parser(
        "publish-preview",
        help="Build a complete revision-namespaced web/mobile preview bundle",
    )
    preview.add_argument("--source-dir", default=str(DEFAULT_SOURCE_DIR))
    preview.add_argument("--public-data-dir", default=str(DEFAULT_PUBLIC_DIR))
    preview.add_argument(
        "--force",
        action="store_true",
        help="Rebuild even when the recorded revision is already published",
    )
    preview.add_argument(
        "--no-fetch",
        action="store_true",
        help="Reuse cached sources or an existing preview; never download",
    )
    preview.set_defaults(func=cmd_publish_preview)

    release = sub.add_parser(
        "validate-release",
        help="Validate every file in an already published Greek release",
    )
    release.add_argument("--public-data-dir", default=str(DEFAULT_PUBLIC_DIR))
    release.set_defaults(func=cmd_validate_release)

    upstream = sub.add_parser(
        "upstream",
        help="Compare recorded Greek source revisions with upstream",
    )
    upstream.add_argument("--output", default="greek-upstream-report.json")
    upstream.add_argument("--markdown-output")
    upstream.add_argument("--github-output")
    upstream.add_argument("--fail-on-change", action="store_true")
    upstream.set_defaults(func=cmd_upstream)

    public_gate = sub.add_parser(
        "public-gate",
        help="Require approved definitions, human review, and completed QA",
    )
    public_gate.add_argument("--public-data-dir", default=str(DEFAULT_PUBLIC_DIR))
    public_gate.add_argument("--approvals", required=True)
    public_gate.add_argument("--qa-report", required=True)
    public_gate.set_defaults(func=cmd_public_gate)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
