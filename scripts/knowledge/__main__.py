"""Run with python -m scripts.knowledge {build,validate,check}."""

import argparse
import tempfile
from pathlib import Path

from .build import build
from .core import OUTPUT, ROOT
from .validate import validate_tree


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["build", "validate", "check"])
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--shaul-root", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--profile", help="Repository-relative JSON build profile")
    args = parser.parse_args()
    root = args.root.resolve()
    if args.command == "validate" and args.profile:
        parser.error("--profile applies only to build and check")
    if args.command == "build":
        if args.output is None:
            parser.error("build requires --output (new or empty directory)")
        build(args.output.absolute(), root, args.shaul_root, args.profile)
    elif args.command == "validate":
        validate_tree(args.output or root / OUTPUT, root)
    else:
        expected = args.output or root / OUTPUT
        validate_tree(expected, root)
        with tempfile.TemporaryDirectory(prefix="davar-knowledge-check-") as temp:
            actual = Path(temp).resolve() / "output"
            build(actual, root, args.shaul_root, args.profile)

            def paths(directory):
                return {
                    p.relative_to(directory).as_posix(): p.read_bytes()
                    for p in directory.rglob("*")
                    if p.is_file()
                }

            if paths(actual) != paths(expected):
                raise ValueError("Committed pilot output is stale")
    print(f"knowledge {args.command}: OK")


if __name__ == "__main__":
    main()
