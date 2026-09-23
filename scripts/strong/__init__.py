"""Compatibility layer for migrated Delitzsch tooling.

Delitzsch processing moved to ``scripts/delitzsch``.
This package remains as a shim to preserve existing imports.
"""


from scripts.delitzsch import *  # noqa: F401,F403

__version__ = "1.0.0"
__author__ = "Davar Project"
