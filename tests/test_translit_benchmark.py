import json
from pathlib import Path

from scripts.translit.benchmark import score_cases


def test_benchmark_is_reproducible_and_reports_metrics():
    path = Path("data/translit/benchmark.json")
    report = score_cases(json.loads(path.read_text(encoding="utf-8")))
    assert report["total"] == 6
    assert report["exact_rate"] == 1.0
    assert report["normalized_rate"] == 1.0


def test_benchmark_detects_regression():
    cases = [{"id": "case", "hebrew": "שַׁבָּת", "expected_en": "wrong", "expected_es": "wrong"}]
    report = score_cases(cases)
    assert report["exact_rate"] == 0.0
    assert report["cases"][0]["exact"] is False
