#!/usr/bin/env bash
# Resolve PreviewApiTarget for Cloudflare PR builds.
# Prints one HTTPS origin (no trailing slash) to stdout.
# Always prefers STAGING_API_URL (Railway staging). PUBLIC_API_URL is fallback.
# Usage: preview-api-url.sh
set -euo pipefail

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

echo "Missing STAGING_API_URL (preferred) or PUBLIC_API_URL" >&2
exit 1
