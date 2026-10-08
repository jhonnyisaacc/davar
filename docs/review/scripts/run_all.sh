#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../.."
python3 docs/review/scripts/inventory.py
python3 docs/review/scripts/hotspots.py
python3 docs/review/scripts/import_graph.py
python3 docs/review/scripts/static_analysis.py
python3 docs/review/scripts/patterns.py
python3 docs/review/scripts/tests_inventory.py
python3 docs/review/scripts/dev_env.py
python3 docs/review/scripts/ci_failures.py
python3 docs/review/scripts/agent_history.py
