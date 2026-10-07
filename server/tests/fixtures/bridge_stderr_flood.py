"""Fake bridge that floods stderr, then answers normally on stdout."""
import json
import sys

for _ in range(4000):
    sys.stderr.write("x" * 80 + "\n")
sys.stderr.flush()
print(json.dumps({"ok": True}))
