"""OpenRouter request builder, SSE parser, and injectable transports."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from email.message import Message
from pathlib import Path
from typing import Any, Callable, Iterable, Mapping, Protocol

DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_MODEL = "google/gemini-2.5-flash"
DEFAULT_PROVIDER_SORT = "latency"
DEFAULT_TIMEOUT = 180
BUDGET_HTTP_CODES = frozenset({402, 429})
FATAL_HTTP_CODES = frozenset({401, 403})
HTTP_RETRIES = 3
REFERER = "https://github.com/jhonnyisaacc/davar"
TITLE = "Davar translations"

TRANSLATION_JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "t": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "f": {"type": "string"},
                    "i": {"type": "string"},
                    "s": {"type": "string"},
                },
                "required": ["i", "s"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["t"],
    "additionalProperties": False,
}


class MissingApiKeyError(RuntimeError):
    """Raised when a live OpenRouter call is attempted without a key."""


@dataclass(frozen=True)
class CompletionResult:
    text: str
    usage: dict[str, int]


class Transport(Protocol):
    def complete(
        self,
        body: dict[str, Any],
        headers: dict[str, str],
    ) -> CompletionResult: ...


def supports_structured_output(model: str) -> bool:
    return not model.endswith(":free")


def build_request_body(
    messages: list[dict[str, str]],
    model: str,
    *,
    provider_sort: str = DEFAULT_PROVIDER_SORT,
    session_id: str | None = None,
    stream: bool = True,
    structured: bool | None = None,
    json_schema: dict[str, Any] | None = None,
    response_healing: bool = False,
    reasoning_effort: str | None = None,
    temperature: float = 0,
    max_tokens: int | None = None,
) -> dict[str, Any]:
    use_structured = (
        supports_structured_output(model) if structured is None else structured
    )
    provider: dict[str, Any] = {"sort": provider_sort or DEFAULT_PROVIDER_SORT}
    payload: dict[str, Any] = {
        "messages": messages,
        "model": model,
        "provider": provider,
        "stream": stream,
        "temperature": temperature,
    }
    if session_id:
        payload["session_id"] = session_id
    if max_tokens:
        payload["max_tokens"] = max_tokens
    if reasoning_effort:
        payload["reasoning"] = {"effort": reasoning_effort, "exclude": True}
    if use_structured:
        payload["response_format"] = {
            "json_schema": {
                "name": "translations",
                "schema": json_schema or TRANSLATION_JSON_SCHEMA,
                "strict": True,
            },
            "type": "json_schema",
        }
        provider["require_parameters"] = True
        if response_healing:
            payload["plugins"] = [{"id": "response-healing"}]
    return payload


def request_headers(
    api_key: str,
    *,
    session_id: str | None = None,
    title: str = TITLE,
) -> dict[str, str]:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": REFERER,
        "X-Title": title,
    }
    if session_id:
        headers["x-session-id"] = session_id
    return headers


def message_text(payload: dict[str, Any]) -> str:
    choices = payload.get("choices") or []
    if not choices:
        raise RuntimeError("OpenRouter returned no choices")
    choice = choices[0]
    error = choice.get("error")
    if error:
        raise RuntimeError(
            f"OpenRouter choice error {error.get('code')}: {error.get('message')}"
        )
    message = choice.get("message") or {}
    delta = choice.get("delta") or {}
    content = message.get("content") or delta.get("content")
    if isinstance(content, list):
        content = "".join(
            part.get("text") or ""
            for part in content
            if isinstance(part, dict)
        )
    if isinstance(content, str) and content.strip():
        return content
    reasoning = message.get("reasoning") or delta.get("reasoning")
    if isinstance(reasoning, str) and reasoning.strip():
        return reasoning
    raise RuntimeError("OpenRouter returned empty content")


def _usage_from(payload: Mapping[str, Any]) -> dict[str, int]:
    usage = payload.get("usage") or {}
    cached = (usage.get("prompt_tokens_details") or {}).get("cached_tokens")
    result = {
        "completion_tokens": int(usage.get("completion_tokens") or 0),
        "prompt_tokens": int(usage.get("prompt_tokens") or 0),
    }
    if cached is not None:
        result["cached_tokens"] = int(cached)
    return result


def parse_sse(chunks: Iterable[str]) -> CompletionResult:
    parts: list[str] = []
    usage = {"completion_tokens": 0, "prompt_tokens": 0}
    last_payload: dict[str, Any] | None = None
    for raw in chunks:
        line = raw.strip()
        if not line or line.startswith(":"):
            continue
        if not line.startswith("data:"):
            continue
        data = line[5:].strip()
        if data == "[DONE]":
            break
        payload = json.loads(data)
        last_payload = payload
        usage_chunk = _usage_from(payload)
        if any(usage_chunk.values()):
            usage.update(usage_chunk)
        choices = payload.get("choices") or []
        if not choices:
            continue
        choice = choices[0]
        if choice.get("error"):
            raise RuntimeError(
                f"OpenRouter choice error {choice['error'].get('code')}: "
                f"{choice['error'].get('message')}"
            )
        delta = choice.get("delta") or {}
        message = choice.get("message") or {}
        piece = delta.get("content") or message.get("content") or ""
        if isinstance(piece, list):
            piece = "".join(
                part.get("text") or ""
                for part in piece
                if isinstance(part, dict)
            )
        if isinstance(piece, str) and piece:
            parts.append(piece)
    text = "".join(parts)
    if not text and last_payload:
        text = message_text(last_payload)
    if not text.strip():
        raise RuntimeError("OpenRouter returned empty content")
    return CompletionResult(text=text, usage=usage)


def retry_after_seconds(
    headers: Mapping[str, str] | Message | None,
    attempt: int,
    detail: str = "",
) -> float:
    raw = None
    if headers is not None:
        getter = headers.get if hasattr(headers, "get") else None
        if getter:
            raw = getter("Retry-After") or getter("retry-after")
    if not raw and detail:
        try:
            payload = json.loads(detail)
            nested = (
                (payload.get("error") or {}).get("metadata") or {}
            ).get("headers") or {}
            raw = nested.get("Retry-After") or nested.get("retry-after")
        except json.JSONDecodeError:
            raw = None
    if raw:
        try:
            return min(120.0, max(1.0, float(raw)))
        except ValueError:
            pass
    return float(min(8, 2**attempt))


def is_budget_error(error: Exception) -> bool:
    text = str(error)
    return any(f"HTTP {code}" in text for code in BUDGET_HTTP_CODES)


def is_fatal_error(error: Exception) -> bool:
    text = str(error)
    return any(f"HTTP {code}" in text for code in FATAL_HTTP_CODES)


def load_env_files(*paths: Path) -> None:
    for path in paths:
        if not path.is_file():
            continue
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip("'").strip('"')
            if key and key not in os.environ:
                os.environ[key] = value


def read_api_key() -> str:
    root = Path(__file__).resolve().parents[2]
    load_env_files(root / ".env", root / ".env.local")
    return (os.environ.get("OPENROUTER_API_KEY") or "").strip()


class FakeTransport:
    """Deterministic offline transport. Never opens a socket."""

    def __init__(
        self,
        handler: Callable[[dict[str, Any]], CompletionResult] | None = None,
        *,
        stream: bool = True,
    ) -> None:
        self.handler = handler
        self.stream = stream
        self.calls: list[dict[str, Any]] = []

    def complete(
        self,
        body: dict[str, Any],
        headers: dict[str, str],
    ) -> CompletionResult:
        self.calls.append(body)
        if self.handler:
            return self.handler(body)
        return default_fake_result(body, stream=self.stream)


def default_fake_result(
    body: dict[str, Any],
    *,
    stream: bool = True,
) -> CompletionResult:
    messages = body.get("messages") or []
    user = next(
        (item["content"] for item in reversed(messages) if item.get("role") == "user"),
        "",
    )
    payload_text = user.split("\n", 1)[-1] if user else "[]"
    try:
        rows = json.loads(payload_text)
    except json.JSONDecodeError:
        rows = []
    if isinstance(rows, dict):
        rows = rows.get("t") or []
    translated = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        item = {"i": str(row.get("i", "")), "s": f"[fake] {row.get('s', '')}"}
        if row.get("f"):
            item["f"] = f"[fake] {row['f']}"
        translated.append(item)
    text = json.dumps({"t": translated}, ensure_ascii=False)
    if not stream:
        return CompletionResult(
            text=text,
            usage={"completion_tokens": len(text) // 4, "prompt_tokens": 8},
        )
    mid = max(1, len(text) // 2)
    chunks = [
        f"data: {json.dumps({'choices': [{'delta': {'content': text[:mid]}}]})}\n",
        f"data: {json.dumps({'choices': [{'delta': {'content': text[mid:]}}], 'usage': {'completion_tokens': len(text) // 4, 'prompt_tokens': 8}})}\n",
        "data: [DONE]\n",
    ]
    return parse_sse(chunks)


class LiveTransport:
    """httpx transport. Refuses to run without an API key."""

    def __init__(
        self,
        *,
        api_key: str | None = None,
        base_url: str = DEFAULT_BASE_URL,
        timeout: int = DEFAULT_TIMEOUT,
        title: str = TITLE,
    ) -> None:
        key = (api_key if api_key is not None else read_api_key()).strip()
        if not key:
            raise MissingApiKeyError(
                "OPENROUTER_API_KEY is missing. Live OpenRouter calls are "
                "disabled until credits are available. Use --dry-run or --fake."
            )
        self.api_key = key
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.title = title
        self._client: Any = None

    def _http(self) -> Any:
        if self._client is None:
            try:
                import httpx
            except ImportError as error:
                raise RuntimeError(
                    "httpx is required for live OpenRouter calls. "
                    "Install it with the project requirements."
                ) from error
            self._client = httpx.Client(
                timeout=self.timeout,
                limits=httpx.Limits(
                    max_connections=20,
                    max_keepalive_connections=10,
                ),
            )
        return self._client

    def complete(
        self,
        body: dict[str, Any],
        headers: dict[str, str],
    ) -> CompletionResult:
        merged = {**request_headers(self.api_key, title=self.title), **headers}
        url = f"{self.base_url}/chat/completions"
        last_error: Exception | None = None
        for attempt in range(HTTP_RETRIES):
            try:
                if body.get("stream"):
                    return self._stream(url, body, merged)
                response = self._http().post(url, json=body, headers=merged)
                if response.status_code in FATAL_HTTP_CODES:
                    raise RuntimeError(
                        f"OpenRouter HTTP {response.status_code}: {response.text[:500]}"
                    )
                if response.status_code in BUDGET_HTTP_CODES:
                    wait = retry_after_seconds(
                        response.headers, attempt, response.text
                    )
                    last_error = RuntimeError(
                        f"OpenRouter HTTP {response.status_code}: {response.text[:500]}"
                    )
                    if attempt + 1 < HTTP_RETRIES:
                        import time

                        time.sleep(wait)
                        continue
                    raise last_error
                if response.status_code >= 400:
                    raise RuntimeError(
                        f"OpenRouter HTTP {response.status_code}: {response.text[:500]}"
                    )
                payload = response.json()
                return CompletionResult(
                    text=message_text(payload),
                    usage=_usage_from(payload),
                )
            except MissingApiKeyError:
                raise
        raise last_error or RuntimeError("OpenRouter request failed")

    def _stream(
        self,
        url: str,
        body: dict[str, Any],
        headers: dict[str, str],
    ) -> CompletionResult:
        with self._http().stream("POST", url, json=body, headers=headers) as response:
            if response.status_code >= 400:
                detail = response.read().decode("utf-8", errors="replace")
                raise RuntimeError(
                    f"OpenRouter HTTP {response.status_code}: {detail[:500]}"
                )
            return parse_sse(response.iter_lines())

    def close(self) -> None:
        if self._client is not None:
            self._client.close()
            self._client = None


def complete(
    messages: list[dict[str, str]],
    *,
    model: str,
    transport: Transport,
    provider_sort: str = DEFAULT_PROVIDER_SORT,
    session_id: str | None = None,
    stream: bool = True,
    structured: bool | None = None,
    json_schema: dict[str, Any] | None = None,
    response_healing: bool = False,
    reasoning_effort: str | None = None,
    extra_headers: dict[str, str] | None = None,
    max_tokens: int | None = None,
) -> CompletionResult:
    body = build_request_body(
        messages,
        model,
        provider_sort=provider_sort,
        session_id=session_id,
        stream=stream,
        structured=structured,
        json_schema=json_schema,
        response_healing=response_healing,
        reasoning_effort=reasoning_effort,
        max_tokens=max_tokens,
    )
    return transport.complete(body, extra_headers or {})
