#!/usr/bin/env bash
# Resolve PreviewApiTarget for Cloudflare PR builds.
# Prints one HTTPS origin (no trailing slash) to stdout.
# Usage: preview-api-url.sh --base <sha> --head <sha> [--pr <n>]
set -euo pipefail

base=""
head_sha=""
pr=""

while [[ $# -gt 0 ]]; do
	case "$1" in
	--base)
		base="${2:-}"
		shift 2
		;;
	--head)
		head_sha="${2:-}"
		shift 2
		;;
	--pr)
		pr="${2:-}"
		shift 2
		;;
	*)
		echo "unknown argument: $1" >&2
		exit 2
		;;
	esac
done

if [[ -z "$base" || -z "$head_sha" ]]; then
	echo "usage: preview-api-url.sh --base <sha> --head <sha> [--pr <n>]" >&2
	exit 2
fi

normalize() {
	local url="$1"
	url="${url%%/}"
	case "$url" in
	https://* | http://*) ;;
	*)
		echo "refusing non-http(s) API URL: $url" >&2
		exit 1
		;;
	esac
	printf '%s\n' "$url"
}

# Same path set as .github/workflows/api-ci.yml (and Railway focused watchPatterns).
touches_api=0
if git diff --name-only "$base"..."$head_sha" | grep -qE \
	'^api/|^shared/product[^/]*\.ts$|^contracts/biblical-knowledge/|^data/knowledge/registries/'; then
	touches_api=1
fi

if [[ "$touches_api" -eq 1 ]]; then
	if [[ -z "$pr" ]]; then
		echo "PR number required when the diff touches the API path set" >&2
		exit 1
	fi
	if [[ -z "${GITHUB_REPOSITORY:-}" || -z "${GH_TOKEN:-}${GITHUB_TOKEN:-}" ]]; then
		echo "GITHUB_REPOSITORY and GH_TOKEN (or GITHUB_TOKEN) required to read Railway PR comments" >&2
		exit 1
	fi
	token="${GH_TOKEN:-$GITHUB_TOKEN}"
	# Railway bot posts the PR environment URL on the issue comments thread.
	# Poll until a *.up.railway.app URL appears or we time out.
	deadline=$((SECONDS + 600))
	while ((SECONDS < deadline)); do
		body="$(
			curl -fsS \
				-H "Authorization: Bearer ${token}" \
				-H "Accept: application/vnd.github+json" \
				"https://api.github.com/repos/${GITHUB_REPOSITORY}/issues/${pr}/comments?per_page=100"
		)"
		url="$(
			printf '%s' "$body" | python3 -c '
import json, re, sys
comments = json.load(sys.stdin)
pat = re.compile(r"https://[A-Za-z0-9.-]+\.up\.railway\.app")
for comment in comments:
    user = (comment.get("user") or {})
    login = (user.get("login") or "").lower()
    if "railway" not in login:
        continue
    for match in pat.finditer(comment.get("body") or ""):
        print(match.group(0))
        raise SystemExit(0)
'
		)" || true
		if [[ -n "${url:-}" ]]; then
			echo "preview-api-url: railway-pr ${url}" >&2
			normalize "$url"
			exit 0
		fi
		echo "preview-api-url: waiting for Railway PR environment URL on PR #${pr}" >&2
		sleep 15
	done
	echo "timed out waiting for Railway PR environment URL on PR #${pr}" >&2
	echo "Enable PR Environments + Focused PR Environments in Railway, or check the Railway bot comment." >&2
	exit 1
fi

staging="${STAGING_API_URL:-}"
fallback="${PUBLIC_API_URL:-}"
if [[ -n "$staging" ]]; then
	echo "preview-api-url: railway-staging ${staging}" >&2
	normalize "$staging"
	exit 0
fi
if [[ -n "$fallback" ]]; then
	echo "preview-api-url: fallback PUBLIC_API_URL ${fallback}" >&2
	normalize "$fallback"
	exit 0
fi

echo "Missing STAGING_API_URL (preferred) or PUBLIC_API_URL for non-api PRs" >&2
exit 1
