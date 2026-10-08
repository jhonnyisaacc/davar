#!/usr/bin/env python3
import json
import os
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SKIP_DIRS = {
    ".git", "node_modules", "vendor", "dist", "coverage", "tmp", "log",
    ".expo", "ios", "android", "data", "public",
}
CODE_EXT = {".py", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".rb"}
JS_EXT = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]
PY_EXT = [".py"]
RB_EXT = [".rb"]
FROM_RE = re.compile(r"""(?:from|import)\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)|import\(\s*['"]([^'"]+)['"]\s*\)""")
PY_RE = re.compile(r"^\s*(?:from\s+(\.+)?([\w.]*)\s+import|import\s+(\.+)?([\w.]+))")
RB_RE = re.compile(r"""require_relative\s+['"]([^'"]+)['"]""")


def rel(path):
    return path.relative_to(ROOT).as_posix()


def walk():
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and d != "research"]
        for name in filenames:
            path = Path(dirpath) / name
            text = rel(path)
            if path.suffix.lower() in CODE_EXT and "research" not in text and not text.startswith("docs/review/"):
                yield path


def resolve_file(base, exts):
    if base.is_file():
        return base
    for ext in exts:
        candidate = Path(str(base) + ext)
        if candidate.is_file():
            return candidate
        index = base / f"index{ext}"
        if index.is_file():
            return index
        init = base / f"__init__{ext}"
        if init.is_file():
            return init
    if base.is_dir() and any(base.glob("*")):
        return base
    return None


def area(path):
    parts = Path(path).parts
    return parts[0] if parts else "(root)"


def alias_base(spec, source):
    source_area = area(rel(source))
    if spec.startswith("@davar/shared/"):
        return ROOT / "shared" / spec[len("@davar/shared/"):]
    if spec.startswith("@/"):
        rest = spec[2:]
        if source_area == "web":
            return ROOT / "web" / "src" / rest
        if source_area == "mobile":
            return ROOT / "mobile" / rest
    return None


def resolve_js(source, spec):
    if spec.startswith("."):
        base = (source.parent / spec).resolve()
    else:
        base = alias_base(spec, source)
        if base is None:
            return None
    for ext in (".js", ".jsx", ".mjs", ".cjs"):
        if base.name.endswith(ext):
            stem = base.with_suffix("")
            for alt in (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"):
                candidate = stem.with_suffix(alt)
                if candidate.is_file():
                    return candidate
            index = resolve_file(stem, JS_EXT)
            if index is not None:
                return index
    return resolve_file(base, JS_EXT)


def resolve_py(source, dots, module):
    if dots:
        base = source.parent
        for _ in range(len(dots) - 1):
            base = base.parent
        if module:
            base = base.joinpath(*module.split("."))
        return resolve_file(base, PY_EXT)
    if not module:
        return None
    if module.split(".")[0] not in {"scripts", "tools", "tests", "api", "server"}:
        return None
    return resolve_file(ROOT.joinpath(*module.split(".")), PY_EXT)


def resolve_rb(source, spec):
    return resolve_file((source.parent / spec).resolve(), RB_EXT)


def edges_for(path):
    text = path.read_text(errors="replace")
    found = []
    if path.suffix.lower() in {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"}:
        for match in FROM_RE.finditer(text):
            spec = next(group for group in match.groups() if group)
            if spec.startswith(".") or spec.startswith("@/") or spec.startswith("@davar/"):
                target = resolve_js(path, spec)
                found.append((spec, target))
    elif path.suffix.lower() == ".py":
        for line in text.splitlines():
            match = PY_RE.match(line)
            if not match:
                continue
            if match.group(1) is not None or match.group(2):
                dots = match.group(1) or ""
                module = match.group(2) or ""
            else:
                dots = match.group(3) or ""
                module = match.group(4) or ""
            if not dots and module.split(".")[0] not in {"scripts", "tools", "tests", "api", "server"}:
                continue
            target = resolve_py(path, dots, module)
            found.append((dots + module, target))
    elif path.suffix.lower() == ".rb":
        for spec in RB_RE.findall(text):
            found.append((spec, resolve_rb(path, spec)))
    return found


def cycles(graph, limit):
    seen = set()
    found = []
    for start in list(graph):
        if start in seen or len(found) >= limit:
            continue
        stack = [(start, iter(graph.get(start, ())))]
        on = {start}
        trail = [start]
        seen.add(start)
        while stack and len(found) < limit:
            node, children = stack[-1]
            try:
                nxt = next(children)
            except StopIteration:
                stack.pop()
                trail.pop()
                on.remove(node)
                continue
            if nxt not in seen:
                seen.add(nxt)
                on.add(nxt)
                trail.append(nxt)
                stack.append((nxt, iter(graph.get(nxt, ()))))
            elif nxt in on:
                index = trail.index(nxt)
                found.append(trail[index:] + [nxt])
    return found


def main():
    graph = defaultdict(set)
    unresolved = []
    cross = []
    nodes = set()
    allowed = {
        ("web", "shared"), ("mobile", "shared"), ("server", "shared"),
        ("scripts", "shared"), ("scripts", "tools"), ("tests", "scripts"),
        ("tests", "tools"), ("web", "web"), ("mobile", "mobile"),
        ("server", "server"), ("shared", "shared"), ("scripts", "scripts"),
        ("tools", "tools"), ("tests", "tests"), ("api", "api"),
        ("contracts", "contracts"),
    }
    for path in walk():
        source = rel(path)
        nodes.add(source)
        for spec, target in edges_for(path):
            if target is None:
                if spec.startswith(".") or spec.startswith("@/") or spec.startswith("@davar/"):
                    unresolved.append({"from": source, "spec": spec})
                continue
            try:
                target_rel = rel(target)
            except ValueError:
                continue
            graph[source].add(target_rel)
            if Path(target_rel).suffix.lower() in {".json", ".jsonc", ".css"}:
                continue
            pair = (area(source), area(target_rel))
            if pair[0] != pair[1] and pair not in allowed:
                cross.append({"from": source, "to": target_rel, "areas": list(pair)})
    simple = {key: sorted(value) for key, value in graph.items() if value}
    edge_count = sum(len(value) for value in simple.values())
    found_cycles = cycles(simple, 40)
    by_len = defaultdict(int)
    for cycle in found_cycles:
        by_len[len(cycle) - 1] += 1
    report = {
        "nodes_scanned": len(nodes),
        "nodes_with_internal_edges": len(simple),
        "internal_edges": edge_count,
        "unresolved_relative_or_alias": unresolved[:80],
        "unresolved_count": len(unresolved),
        "cross_area_edges_outside_allowlist": cross[:80],
        "cross_area_count": len(cross),
        "allowlist": sorted(f"{a}->{b}" for a, b in allowed),
        "cycle_sample_limit": 40,
        "cycles_found_up_to_limit": len(found_cycles),
        "cycle_length_counts_in_sample": dict(by_len),
        "cycles": found_cycles,
    }
    out = Path(__file__).resolve().parents[1] / "evidence" / "import_graph.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2) + "\n")
    print(out)


if __name__ == "__main__":
    main()
