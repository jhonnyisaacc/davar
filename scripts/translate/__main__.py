"""CLI for Davar batch translation. Offline unless --live is passed."""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

from scripts.translate.adapters import ADAPTERS
from scripts.translate.cache import empty_cache, load_cache, save_cache
from scripts.translate.client import (
    DEFAULT_BASE_URL,
    DEFAULT_MODEL,
    DEFAULT_PROVIDER_SORT,
    FakeTransport,
    LiveTransport,
    MissingApiKeyError,
    read_api_key,
)
from scripts.translate.engine import (
    DEFAULT_BATCH_CHARS,
    DEFAULT_CONCURRENCY,
    DEFAULT_MAX_ITEMS,
    estimate_jobs,
    run_jobs,
)

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CACHE = ROOT / "data" / "translate" / "cache.json"


def parse_languages(raw: str) -> tuple[str, ...]:
    languages = tuple(
        part.strip().lower()
        for part in raw.split(",")
        if part.strip()
    )
    if not languages:
        raise SystemExit("--to needs at least one language code")
    return languages


def build_adapter(source: str, input_paths: list[Path] | None):
    adapter_cls = ADAPTERS[source]
    if source == "locales":
        if input_paths:
            return adapter_cls(locales_dir=input_paths[0])
        return adapter_cls()
    if source == "greek":
        if input_paths:
            return adapter_cls(definitions_dir=input_paths[0])
        return adapter_cls()
    if input_paths:
        return adapter_cls(paths=input_paths)
    return adapter_cls()


def progress(label: str, completed: int, total: int, cached: int) -> None:
    print(
        f"[davar-translate] {label} {completed}/{total} ({cached} cached)",
        flush=True,
    )


def cmd_run(args: argparse.Namespace) -> int:
    targets = parse_languages(args.to)
    cache_path = Path(args.cache) if args.cache else DEFAULT_CACHE
    adapter = build_adapter(args.source, [Path(p) for p in args.input] or None)
    cache = load_cache(cache_path) if cache_path.is_file() else empty_cache()
    jobs = adapter.collect(targets, cache, force=args.force)
    if args.limit is not None:
        jobs = jobs[: args.limit]
    stats = estimate_jobs(jobs)
    print(
        f"[davar-translate] {args.source} → {','.join(targets)}: "
        f"{stats['rows']} rows ({stats['unique']} unique, "
        f"{stats['batches']} batches, ~{stats['chars']} chars)",
        flush=True,
    )
    if args.mode == "batch":
        print(
            "OpenRouter Batch API mode is stubbed until credits are available. "
            "Use --dry-run or --fake, then --mode batch later.",
            file=sys.stderr,
        )
        return 2
    if args.dry_run:
        return 0
    if not args.fake and not args.live:
        raise SystemExit("Pass --dry-run, --fake, or --live (live needs credits).")

    transport = FakeTransport() if args.fake else None
    if transport is None:
        try:
            transport = LiveTransport(
                api_key=read_api_key(),
                base_url=args.base_url,
                title=f"Davar {args.source} translations",
            )
        except MissingApiKeyError as error:
            raise SystemExit(str(error)) from error

    session_id = args.session_id or f"davar-translate-{args.source}-{'-'.join(targets)}"
    result = run_jobs(
        jobs,
        cache,
        cache_path,
        transport=transport,
        model=args.model,
        concurrency=args.concurrency,
        batch_chars=args.batch_chars,
        max_items=args.max_items,
        extra_instruction=getattr(adapter, "extra_instruction", ""),
        provider_sort=args.provider_sort,
        session_id=session_id,
        stream=not args.no_stream,
        response_healing=False,
        reasoning_effort=None,
        progress=progress,
    )
    save_cache(cache_path, result["cache"])
    applied = 0
    if args.apply:
        applied = adapter.apply(result["cache"], targets, write=True)
    print(
        f"[davar-translate] done deferred={result['stats'].get('deferred', 0)} "
        f"applied={applied}",
        flush=True,
    )
    if hasattr(transport, "close"):
        transport.close()
    return 0


def cmd_bench(args: argparse.Namespace) -> int:
    if not args.fake and not args.live:
        print(
            "Live OpenRouter bench is deferred until credits are available. "
            "Re-run with --fake now, or --live later.",
            file=sys.stderr,
        )
        return 2
    if args.live and not args.fake:
        print(
            "Live bench is implemented but not run in this pass. "
            "Use --fake, or pass --live when you have credits.",
            file=sys.stderr,
        )
        return 2

    adapter = build_adapter(args.source, [Path(p) for p in args.input] or None)
    jobs = adapter.collect(parse_languages(args.to), empty_cache())[: args.limit]
    transport = FakeTransport()
    started = time.perf_counter()
    first_token = None

    original_complete = transport.complete

    def timed_complete(body, headers):
        nonlocal first_token
        result = original_complete(body, headers)
        if first_token is None:
            first_token = time.perf_counter() - started
        return result

    transport.complete = timed_complete  # type: ignore[method-assign]
    cache_path = Path(args.cache) if args.cache else ROOT / "data" / "translate" / "bench-cache.json"
    result = run_jobs(
        jobs,
        empty_cache(),
        cache_path,
        transport=transport,
        model=args.model,
        concurrency=args.concurrency,
        max_items=args.max_items,
        progress=progress,
    )
    elapsed = time.perf_counter() - started
    filled = len(result["cache"].get("items") or {})
    items_per_sec = filled / elapsed if elapsed else 0
    print(
        f"[davar-translate] bench fake rows={len(jobs)} filled={filled} "
        f"ttft={first_token or 0:.4f}s elapsed={elapsed:.4f}s "
        f"items_per_sec={items_per_sec:.2f}",
        flush=True,
    )
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m scripts.translate")
    sub = parser.add_subparsers(dest="command", required=True)

    run = sub.add_parser("run", help="Collect and optionally translate a source")
    run.add_argument("--source", required=True, choices=sorted(ADAPTERS))
    run.add_argument("--to", required=True, help="Comma-separated language codes")
    run.add_argument("--input", action="append", default=[], help="Override source path")
    run.add_argument("--cache")
    run.add_argument("--limit", type=int)
    run.add_argument("--force", action="store_true")
    run.add_argument("--dry-run", action="store_true")
    run.add_argument("--fake", action="store_true", help="Use the offline fake transport")
    run.add_argument(
        "--live",
        action="store_true",
        help="Call OpenRouter (requires credits and OPENROUTER_API_KEY)",
    )
    run.add_argument("--apply", action="store_true", help="Write translations back to source files")
    run.add_argument("--model", default=DEFAULT_MODEL)
    run.add_argument("--base-url", default=DEFAULT_BASE_URL)
    run.add_argument("--concurrency", type=int, default=DEFAULT_CONCURRENCY)
    run.add_argument("--batch-chars", type=int, default=DEFAULT_BATCH_CHARS)
    run.add_argument("--max-items", type=int, default=DEFAULT_MAX_ITEMS)
    run.add_argument("--provider-sort", default=DEFAULT_PROVIDER_SORT)
    run.add_argument("--session-id")
    run.add_argument("--no-stream", action="store_true")
    run.add_argument(
        "--mode",
        choices=("sync", "batch"),
        default="sync",
        help="sync streams completions; batch is reserved for the OpenRouter Batch API",
    )
    run.set_defaults(func=cmd_run)

    bench = sub.add_parser("bench", help="Measure TTFT / items per second")
    bench.add_argument("--source", default="locales")
    bench.add_argument("--to", default="pt")
    bench.add_argument("--input", action="append", default=[])
    bench.add_argument("--cache")
    bench.add_argument("--limit", type=int, default=20)
    bench.add_argument("--fake", action="store_true")
    bench.add_argument("--live", action="store_true")
    bench.add_argument("--model", default=DEFAULT_MODEL)
    bench.add_argument("--concurrency", type=int, default=DEFAULT_CONCURRENCY)
    bench.add_argument("--max-items", type=int, default=DEFAULT_MAX_ITEMS)
    bench.set_defaults(func=cmd_bench)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
