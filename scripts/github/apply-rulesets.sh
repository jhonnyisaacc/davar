#!/usr/bin/env bash
set -euo pipefail

OWNER="${1:-jhonnyisaacc}"
REPO="${2:-davar}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RULESET_DIR="$ROOT_DIR/.github/rulesets"

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI is required."
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required."
  exit 1
fi

echo "Applying rulesets to $OWNER/$REPO"

existing_ids="$(gh api "repos/$OWNER/$REPO/rulesets" | jq -r '.[] | select(.name == "main" or .name == "pr") | .id')"

if [[ -n "$existing_ids" ]]; then
  echo "Deleting existing managed rulesets..."
  while IFS= read -r id; do
    [[ -z "$id" ]] && continue
    gh api -X DELETE "repos/$OWNER/$REPO/rulesets/$id" >/dev/null
    echo "Deleted ruleset ID: $id"
  done <<< "$existing_ids"
fi

for file in "$RULESET_DIR"/main.json "$RULESET_DIR"/pr-baseline.json; do
  echo "Creating $(basename "$file")"
  gh api -X POST "repos/$OWNER/$REPO/rulesets" --input "$file" >/dev/null
  echo "Created $(basename "$file")"
done

echo "Done. Current rulesets:"
gh api "repos/$OWNER/$REPO/rulesets" | jq -r '.[] | "- " + .name + " (id=" + (.id|tostring) + ")"'
