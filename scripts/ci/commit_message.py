#!/usr/bin/env python3

from __future__ import annotations

import re
import sys
from pathlib import Path

AI_TRAILER = re.compile(
    r"(?im)^[ \t]*co-authored-by:.*(?:"
    r"cursor|copilot|chatgpt|openai|anthropic|claude|gemini|devin|"
    r"codeium|aider|cody|sweep\.ai|grok"
    r").*$"
)


def trailer_lines(message: str) -> list[str]:
    return [line for line in message.splitlines() if AI_TRAILER.search(line)]


def strip_message(message: str) -> str:
    kept = [line for line in message.splitlines(keepends=True) if not AI_TRAILER.search(line)]
    return "".join(kept)


def strip_file(path: Path) -> None:
    path.write_text(strip_message(path.read_text()))


def main(argv: list[str]) -> int:
    check = False
    args = argv[1:]
    if args and args[0] == "--check":
        check = True
        args = args[1:]
    if len(args) != 1:
        print("usage: commit_message.py [--check] MESSAGE_FILE", file=sys.stderr)
        return 2
    path = Path(args[0])
    message = path.read_text()
    found = trailer_lines(message)
    if check:
        if found:
            print("AI co-author trailer:", file=sys.stderr)
            for line in found:
                print(line, file=sys.stderr)
            return 1
        return 0
    if found:
        strip_file(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
