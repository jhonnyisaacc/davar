#!/usr/bin/env python3
"""Regression tests for the committed TCY dictionary import."""

import json
import tempfile
import unittest
from pathlib import Path

from import_tcysite import (
    build_greek_key_index,
    canonical_greek_key,
    clean_html,
    fallback_id,
    source_manifest,
    write_source_manifest,
    strong_core,
    import_data,
)


ROOT = Path(__file__).resolve().parents[2]
CUSTOM_PATH = ROOT / "data/dict/lexicon/custom_definitions.json"
REPORT_PATH = ROOT / "data/dict/reports/tcysite_import.json"
MANIFEST_PATH = ROOT / "data/dict/raw/tcysite/source_manifest.json"


class TcysiteImportTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.custom = json.loads(CUSTOM_PATH.read_text(encoding="utf-8"))
        cls.report = json.loads(REPORT_PATH.read_text(encoding="utf-8"))

    def test_source_rows_and_imported_records_are_complete(self):
        self.assertEqual(self.report["counts"]["eric_rows"], 3919)
        self.assertEqual(self.report["counts"]["greek_index_rows"], 5524)
        self.assertEqual(self.report["counts"]["greek_master_rows"], 5461)
        self.assertGreater(self.report["counts"]["definitions_added"], 18000)

    def test_source_manifest_has_record_counts(self):
        manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        self.assertEqual(manifest["schema_version"], 2)
        self.assertTrue(manifest["files"])
        self.assertTrue(
            all(
                all(field in item for field in ("sha256", "bytes", "record_count"))
                and isinstance(item["record_count"], int)
                for item in manifest["files"]
            )
        )
        counts_by_path = {item["path"]: item["record_count"] for item in manifest["files"]}
        self.assertEqual(
            sum(value for path, value in counts_by_path.items() if path.startswith("eric/")),
            self.report["counts"]["eric_rows"],
        )
        self.assertEqual(
            counts_by_path["greek/strongs-greek-chavez.index.min.json"],
            self.report["counts"]["greek_index_rows"],
        )
        self.assertEqual(
            counts_by_path["greek/masterdiccionario.json"],
            self.report["counts"]["greek_master_rows"],
        )
        self.assertEqual(
            next(item["record_count"] for item in manifest["files"] if item["path"] == "greek/masterdiccionario.json"),
            5461,
        )

    def test_unchanged_import_is_byte_identical(self):
        tracked = (MANIFEST_PATH, REPORT_PATH, CUSTOM_PATH)
        import_data(MANIFEST_PATH.parent)
        first = {path: path.read_bytes() for path in tracked}
        import_data(MANIFEST_PATH.parent)
        second = {path: path.read_bytes() for path in tracked}
        self.assertEqual(first, second)

    def test_unchanged_source_manifest_preserves_retrieval_time(self):
        with tempfile.TemporaryDirectory() as directory:
            source_root = Path(directory)
            (source_root / "eric").mkdir()
            (source_root / "eric" / "sample.json").write_text("[]\n", encoding="utf-8")
            initial = source_manifest(source_root, retrieved_at="2026-01-01T00:00:00+00:00")
            (source_root / "source_manifest.json").write_text(
                json.dumps(initial), encoding="utf-8"
            )

            rewritten = write_source_manifest(source_root)

            self.assertEqual(rewritten["retrieved_at"], initial["retrieved_at"])
            self.assertEqual(rewritten["files"], initial["files"])

    def test_duplicate_terms_are_not_collapsed(self):
        elohim = self.custom["H430"]["definitions"]
        imported = [item for item in elohim if item.get("source") == "tcysite-eric"]
        self.assertGreater(len(imported), 1)
        self.assertEqual(len({item["source_file"] + ":" + item["source_row"] for item in imported}), len(imported))

    def test_existing_authored_definitions_precede_tcy_definitions(self):
        definitions = self.custom["H430"]["definitions"]
        self.assertEqual(definitions[0]["source"], "custom")
        self.assertEqual(definitions[5]["source"], "tcysite-eric")

    def test_greek_matthew_word_is_canonical_and_provenanced(self):
        entry = self.custom["G0976"]
        self.assertEqual(entry["canonical_strong"], "G0976")
        self.assertEqual(entry["term_language"], "greek")
        self.assertTrue(any(item["source_row"] == "G976" for item in entry["definitions"]))

    def test_fallback_ids_are_stable_and_in_reserved_range(self):
        used = {"D0284"}
        first = fallback_id("eric:test:1", used)
        used = {"D0284"}
        second = fallback_id("eric:test:1", used)
        self.assertEqual(first, second)
        self.assertRegex(first, r"^D[1-8][0-9]{6}$")

    def test_site_markup_is_reduced_without_losing_text(self):
        self.assertIn("Libro", clean_html("<b>Libro</b><p/>registro"))
        self.assertNotIn("<b>", clean_html("<b>Libro</b>"))
        self.assertEqual(strong_core("G0976"), (976, ""))
        self.assertEqual(
            canonical_greek_key("G976", build_greek_key_index({"G0976"})),
            "G0976",
        )


if __name__ == "__main__":
    unittest.main()
