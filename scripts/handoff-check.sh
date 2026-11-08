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

pr=$(gh pr view "$branch" --json state,url,headRefOid --jq '[.state, .url, .headRefOid] | @tsv' 2>/dev/null || true)
state=$(printf '%s' "$pr" | cut -f1)
url=$(printf '%s' "$pr" | cut -f2)
remote_head=$(printf '%s' "$pr" | cut -f3)
if [ "$state" != OPEN ]; then
	echo "handoff-check: $branch has no open pull request${url:+ ($url is $state)}. Push it and open one with gh pr create --draft, then rerun." >&2
	exit 1
fi
local_head=$(git rev-parse HEAD)
if [ "$local_head" != "$remote_head" ]; then
	echo "handoff-check: $url is at ${remote_head}, but $branch is at ${local_head}. Push your commits, then rerun." >&2
	exit 1
fi
echo "handoff-check ok: $url"
