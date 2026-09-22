"""Characterization pin for the TTH v2 DOCX and Markdown conversion pipeline."""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
TTH2_DIR = REPO_ROOT / "scripts" / "tth_2"
if str(TTH2_DIR) not in sys.path:
    sys.path.insert(0, str(TTH2_DIR))

from docx_to_md import convert_docx
from json_postprocess import get_postprocessor
from md_to_json import convert_book_markdown_to_json

AMOS_MARKDOWN = REPO_ROOT / "data" / "tth_2" / "markdown" / "amos.md"
AMOS_JSON = REPO_ROOT / "data" / "tth_2" / "json" / "amos.json"
SHIR_DOCX = REPO_ROOT / "data" / "tth_2" / "raw" / "shir_hashirim.docx"
SHIR_MARKDOWN = REPO_ROOT / "data" / "tth_2" / "markdown" / "shir_hashirim.md"

AMOS_BOOK_INFO = {
    "book_id": "amos",
    "tth_name": "Amós",
    "hebrew_name": "עמוס",
    "english_name": "Amos",
    "spanish_name": "Amós",
    "section": "neviim",
    "total_chapters": 9,
    "total_verses": 146,
}

AMOS_1_1_TTH = (
    "Palabras de Amós, que era de los criadores de ovejas de Tekoa, que vio "
    "sobre Israel en días de Uziyah, rey de Iehudáh, y en días de Iarobam, "
    "hijo de Ioásh, rey de Israel, dos años antes del terremoto."
)

AMOS_1_2 = {
    "verse": 2,
    "tth": (
        "Y dijo: יהוה desde Tzión rugirá, y desde Yerushaláim dará su voz; "
        "y se lamentaron los pastos de los pastores, y se secó la cima¹ del Carmel²."
    ),
    "footnotes": [
        {
            "marker": "¹",
            "number": "1",
            "word": "cima",
            "explanation": "Lit.: cabeza.",
        },
        {
            "marker": "²",
            "number": "2",
            "word": "Carmel",
            "explanation": "Huerto fértil.",
        },
    ],
    "hebrew_terms": [],
}

AMOS_1_5_TTH = (
    "Y romperé el cerrojo de Damések, y cortaré <em>al</em> habitante del "
    "valle de Avén y <em>al</em> que agarra el cetro de Bet Éden, y será "
    "desterrado el pueblo de Aram a Kir –ha dicho יהוה."
)

# Convert + postprocess currently extracts section titles and drops spaces
# before closing quotes. Those seven verses no longer match committed amos.json.
AMOS_CONVERTER_VERSES = {
    (2, 12): {
        "verse": 12,
        "tth": (
            "Pero dieron de beber vino a los nazareos, y a los profetas "
            "ordenaron, diciendo: “¡No profeticen!”"
        ),
        "footnotes": [],
        "hebrew_terms": [],
    },
    (4, 13): {
        "verse": 13,
        "tth": (
            "Porque, he aquí, el Formador de los montes y el Creador del "
            "viento, el que anuncia al hombre su ungido²⁵, el Hacedor del "
            "amanecer y de las tinieblas²⁶, y el que camina sobre las "
            "alturas de la tierra; יהוה, Elohei Tzebaot, es su Nombre."
        ),
        "footnotes": [
            {
                "marker": "²⁵",
                "number": "25",
                "word": "ungido",
                "explanation": (
                    "Así en la versión gr., en el T.M.: el que anuncia al "
                    "hombre cuál es su pensamiento; probablemente, un error "
                    "de texto."
                ),
            },
            {
                "marker": "²⁶",
                "number": "26",
                "word": "tinieblas",
                "explanation": "O, el que hace tinieblas del amanecer.",
            },
        ],
        "hebrew_terms": [],
        "subtitle": "Llamado a regresar a יהוה",
    },
    (5, 27): {
        "verse": 27,
        "tth": (
            "Y los llevaré al exilio más allá de Damések –ha dicho יהוה, "
            "Elohei Tzebaot es su Nombre."
        ),
        "footnotes": [],
        "hebrew_terms": [],
        "subtitle": "Profecía contra el orgullo de Israel",
    },
    (7, 9): {
        "verse": 9,
        "tth": (
            "Y serán desolados los lugares altos de Isjak, y los santuarios "
            "de Israel serán asolados; y me levantaré sobre la casa de "
            "Iarobam con espada."
        ),
        "footnotes": [],
        "hebrew_terms": [],
        "subtitle": "Amós es acusado por Amatziáh",
    },
    (7, 17): {
        "verse": 17,
        "tth": (
            "Por eso, así ha dicho יהוה: “Tu mujer en la ciudad se "
            "prostituirá, y tus hijos y tus hijas por la espada caerán, y "
            "tu tierra por el cordel será repartida, y tú sobre tierra "
            "impura morirás. E Israel, ciertamente será llevado al exilio "
            "de sobre su tierra”."
        ),
        "footnotes": [],
        "hebrew_terms": [],
        "subtitle": "Los juicios de Elohim",
    },
    (8, 14): {
        "verse": 14,
        "tth": (
            "Los que juran por la culpa de Shomrón, y dicen: “¡Viva tu "
            "poderoso⁵⁷, Dan!”, y “¡Viva el camino de Beersheva!”, caerán "
            "y no se levantarán más."
        ),
        "footnotes": [
            {
                "marker": "⁵⁷",
                "number": "57",
                "word": "poderoso",
                "explanation": "Heb.: Elohim.",
            }
        ],
        "hebrew_terms": [],
    },
    (9, 10): {
        "verse": 10,
        "tth": (
            "Por la espada morirán todos los pecadores de mi pueblo, los "
            "que dicen: “No se acercará ni se anticipará por causa nuestra "
            "el mal”."
        ),
        "footnotes": [],
        "hebrew_terms": [],
        "subtitle": "Restauración de Israel",
    },
}


def test_amos_markdown_converts_to_json_with_literal_verses(tmp_path):
    out = tmp_path / "amos.json"
    convert_book_markdown_to_json("amos", str(AMOS_MARKDOWN), str(out), verbose=False)
    ok, _stats = get_postprocessor(verbose=False).process_json_file(out)
    assert ok is True

    generated = json.loads(out.read_text(encoding="utf-8"))
    committed = json.loads(AMOS_JSON.read_text(encoding="utf-8"))

    assert generated["book_info"] == AMOS_BOOK_INFO
    assert generated["chapters"][0]["verses"][0]["tth"] == AMOS_1_1_TTH
    assert generated["chapters"][0]["verses"][1] == AMOS_1_2
    assert generated["chapters"][0]["verses"][4]["tth"] == AMOS_1_5_TTH

    assert len(generated["chapters"]) == 9
    assert sum(len(chapter["verses"]) for chapter in generated["chapters"]) == 146

    for chapter, committed_chapter in zip(
        generated["chapters"], committed["chapters"], strict=True
    ):
        assert chapter["chapter"] == committed_chapter["chapter"]
        for verse, committed_verse in zip(
            chapter["verses"], committed_chapter["verses"], strict=True
        ):
            key = (chapter["chapter"], verse["verse"])
            if key in AMOS_CONVERTER_VERSES:
                assert verse == AMOS_CONVERTER_VERSES[key]
            else:
                assert verse == committed_verse


@pytest.mark.skipif(
    importlib.util.find_spec("mammoth") is None,
    reason="mammoth is not installed",
)
def test_shir_hashirim_docx_converts_to_committed_markdown(tmp_path):
    out = tmp_path / "shir_hashirim.md"
    convert_docx(str(SHIR_DOCX), str(out), verbose=False)
    assert out.read_bytes() == SHIR_MARKDOWN.read_bytes()
    markdown = out.read_text(encoding="utf-8")
    assert markdown.startswith("__SHIR HASHIRIM \\(CANTARES\\)__שיר השירים")
    assert "La canción de las canciones, la cual es de Shelomóh." in markdown
