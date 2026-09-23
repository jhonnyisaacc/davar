#!/usr/bin/env python3
"""
Parse Dead Sea Scrolls differences from deadseainsights repository
Extract differences between DSS and Masoretic text into structured JSON

This script now uses the modular parser package for better maintainability.
For direct usage, see individual modules in the dss package.
"""


from .main import main

if __name__ == '__main__':
    main()
