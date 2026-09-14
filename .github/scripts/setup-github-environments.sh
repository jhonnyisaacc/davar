#!/usr/bin/env bash

set -euo pipefail

OWNER="jhonnyisaacc"
REPO="davar"
FULL_REPO="${OWNER}/${REPO}"

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI is required. Install it first: https://cli.github.com/"
  exit 1
fi

echo "Checking GitHub auth..."
gh auth status >/dev/null

echo "Verifying repository access: ${FULL_REPO}"
gh repo view "${FULL_REPO}" --json nameWithOwner >/dev/null

echo "Creating/updating environments..."
gh api -X PUT "repos/${OWNER}/${REPO}/environments/development" >/dev/null

gh api -X PUT "repos/${OWNER}/${REPO}/environments/production" --input - <<'JSON' >/dev/null
{
  "deployment_branch_policy": {
    "protected_branches": true,
    "custom_branch_policies": false
  }
}
JSON

gh api -X PUT "repos/${OWNER}/${REPO}/environments/mobile-preview" >/dev/null

gh api -X PUT "repos/${OWNER}/${REPO}/environments/mobile-production" --input - <<'JSON' >/dev/null
{
  "deployment_branch_policy": {
    "protected_branches": true,
    "custom_branch_policies": false
  }
}
JSON

if [[ -n "${MOBILE_REVIEWER_ID:-}" ]]; then
  echo "Applying mobile-production reviewer gate (MOBILE_REVIEWER_ID=${MOBILE_REVIEWER_ID})..."
  gh api -X PUT "repos/${OWNER}/${REPO}/environments/mobile-production" --input - <<JSON >/dev/null
{
  "reviewers": [
    { "type": "User", "id": ${MOBILE_REVIEWER_ID} }
  ],
  "deployment_branch_policy": {
    "protected_branches": true,
    "custom_branch_policies": false
  }
}
JSON
fi

if [[ -n "${EXPO_TOKEN:-}" ]]; then
  echo "Setting EXPO_TOKEN in mobile-preview and mobile-production..."
  gh secret set EXPO_TOKEN --repo "${FULL_REPO}" --env mobile-preview --body "${EXPO_TOKEN}"
  gh secret set EXPO_TOKEN --repo "${FULL_REPO}" --env mobile-production --body "${EXPO_TOKEN}"
else
  echo "EXPO_TOKEN is not set in your shell. Skipping secret creation."
fi

echo "Setting production WEB_PRODUCTION_URL variable..."
gh variable set WEB_PRODUCTION_URL --repo "${FULL_REPO}" --env production --body "https://davar.bible"

echo "Environment creation complete. Current environments:"
gh api "repos/${OWNER}/${REPO}/environments" --jq '.environments[].name'
