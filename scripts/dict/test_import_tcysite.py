#!/usr/bin/env python3
"""Regression tests for the committed TCY dictionary import."""

import json
import unittest
from pathlib import Path

from import_tcysite import (
    build_greek_key_index,
    canonical_greek_key,
    clean_html,
    fallback_id,
    strong_core,
)


ROOT = Path(__file__).resolve().parents[2]
CUSTOM_PATH = ROOT / "data/dict/lexicon/custom_definitions.json"
REPORT_PATH = ROOT / "data/dict/reports/tcysite_import.json"


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
