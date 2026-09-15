"""Reusable batch translation engine. Offline by default; OpenRouter is injected."""

from scripts.translate.cache import (
    CACHE_SCHEMA,
    empty_cache,
    load_cache,
    save_cache,
    source_hash,
)
from scripts.translate.client import (
    CompletionResult,
    FakeTransport,
    LiveTransport,
    MissingApiKeyError,
    build_request_body,
    is_budget_error,
    message_text,
    parse_sse,
    retry_after_seconds,
    supports_structured_output,
)
from scripts.translate.engine import (
    DEFAULT_BATCH_CHARS,
    DEFAULT_CONCURRENCY,
    DEFAULT_MAX_ITEMS,
    TranslateJob,
    estimate_jobs,
    pack_batches,
    parse_translations,
    run_jobs,
    unique_jobs,
)

__all__ = [
    "CACHE_SCHEMA",
    "CompletionResult",
    "DEFAULT_BATCH_CHARS",
    "DEFAULT_CONCURRENCY",
    "DEFAULT_MAX_ITEMS",
    "FakeTransport",
    "LiveTransport",
    "MissingApiKeyError",
    "TranslateJob",
    "build_request_body",
    "empty_cache",
    "estimate_jobs",
    "is_budget_error",
    "load_cache",
    "message_text",
    "pack_batches",
    "parse_sse",
    "parse_translations",
    "retry_after_seconds",
    "run_jobs",
    "save_cache",
    "source_hash",
    "supports_structured_output",
    "unique_jobs",
]
