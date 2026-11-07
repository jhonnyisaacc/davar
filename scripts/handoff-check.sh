#!/bin/sh
set -eu

dirty=$(git status --porcelain)
if [ -n "$dirty" ]; then
	echo "handoff-check: the working tree has uncommitted changes. Commit or discard them, then rerun:" >&2
	printf '%s\n' "$dirty" >&2
	exit 1
fi

branch=$(git rev-parse --abbrev-ref HEAD)
if [ "$branch" = main ]; then
	echo "handoff-check ok: clean tree on main"
	exit 0
fi

if ! command -v gh >/dev/null 2>&1; then
	echo "handoff-check: gh is not installed, so the pull request check was skipped"
	echo "handoff-check ok: clean tree on $branch"
	exit 0
fi
if ! gh auth status >/dev/null 2>&1; then
	echo "handoff-check: gh is not authenticated, so the pull request check was skipped"
	echo "handoff-check ok: clean tree on $branch"
	exit 0
fi

if url=$(gh pr view "$branch" --json url --jq .url 2>/dev/null); then
	echo "handoff-check ok: $url"
	exit 0
fi
echo "handoff-check: $branch has no pull request. Push it and open one with gh pr create --draft, then rerun." >&2
exit 1
