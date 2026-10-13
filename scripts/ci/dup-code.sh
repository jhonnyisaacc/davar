#!/bin/sh
set -eu
out=$(mktemp -d)
bunx jscpd@4.0.5 --config .github/ci/jscpd.json --output "$out" \
  api web/src mobile shared scripts tools/bani
python3 scripts/ci/dup_count.py "$out/jscpd-report.json" .github/ci/dup-baseline.json
