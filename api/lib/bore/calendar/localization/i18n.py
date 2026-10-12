from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from calendar.models.enums import Locale
from calendar.paths import LOCALES_DIR

SUPPORTED_LOCALES = tuple(item.value for item in Locale)


class Localization:
    def __init__(self, locales: dict[str, dict]):
        self.locales = locales

    def lookup(self, locale: str, *keys: str) -> str:
        current: object = self.locales.get(locale) or self.locales[Locale.EN.value]
        for key in keys:
            if not isinstance(current, dict) or key not in current:
                current = self.locales[Locale.EN.value]
                for fallback_key in keys:
                    current = current[fallback_key]  # type: ignore[index]
                break
            current = current[key]
        return str(current)

    def month_name(self, locale: str, month_id: str | None) -> str:
        if not month_id:
            return self.lookup(locale, "ui", "month_confirmed")
        return self.lookup(locale, "months", month_id)

    def event_name(self, locale: str, event_id: str) -> str:
        return self.lookup(locale, "events", event_id)

    def bundle(self) -> dict[str, dict]:
        return self.locales


def load_localization(locales_dir: Path | None = None) -> Localization:
    directory = locales_dir or LOCALES_DIR
    locales: dict[str, dict] = {}
    for locale in SUPPORTED_LOCALES:
        path = directory / f"{locale}.yml"
        locales[locale] = _load_simple_yaml(path)
    return Localization(locales)


@lru_cache(maxsize=16)
def _load_simple_yaml(path: Path) -> dict:
    tree: dict = {}
    stack: list[tuple[int, dict]] = [(-1, tree)]
    for raw in path.read_text(encoding="utf-8").splitlines():
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        indent = len(raw) - len(raw.lstrip(" "))
        key, _, value = raw.lstrip(" ").partition(":")
        while stack and indent <= stack[-1][0]:
            stack.pop()
        parent = stack[-1][1]
        key = key.strip()
        value = value.strip()
        if value:
            parent[key] = _unquote(value)
        else:
            child: dict = {}
            parent[key] = child
            stack.append((indent, child))
    return tree


def _unquote(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
        return value[1:-1]
    return value
