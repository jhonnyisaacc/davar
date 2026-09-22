"""Map official TAGNT book codes to Davar Besorah book IDs."""

from __future__ import annotations

from scripts.books import besorah_ids, tagnt_to_davar

# TAGNT uses UBS-style abbreviations from the STEPBible-Data README.
# Davar Besorah IDs are the registry ids in data/knowledge/registries/books.json.
TAGNT_TO_DAVAR: dict[str, str] = tagnt_to_davar()

DAVAR_TO_TAGNT: dict[str, str] = {value: key for key, value in TAGNT_TO_DAVAR.items()}

BESORAH_BOOK_COUNT = 27


def davar_book_id(tagnt_book: str) -> str:
    try:
        return TAGNT_TO_DAVAR[tagnt_book]
    except KeyError as exc:
        raise KeyError(f"Unknown TAGNT book code: {tagnt_book}") from exc


def tagnt_book_code(davar_book_id_value: str) -> str:
    try:
        return DAVAR_TO_TAGNT[davar_book_id_value]
    except KeyError as exc:
        raise KeyError(f"Unknown Davar Besorah book id: {davar_book_id_value}") from exc


def davar_besorah_ids_from_metadata() -> list[str]:
    """Besorah book ids in registry order."""
    return besorah_ids()


# TAGNT verse identities with rows but no SBL edition token at
# STEPBible-Data ae39711d7843b2902d54993e432de9c12d6a4b9a. Do not fill these
# from Hebrew Besorah or from NA28.
TAGNT_SBL_ABSENT_VERSES: tuple[str, ...] = (
    "Mat.17.21",
    "Mat.18.11",
    "Mat.23.14",
    "Mrk.7.16",
    "Mrk.9.44",
    "Mrk.9.46",
    "Mrk.11.26",
    "Mrk.15.28",
    "Mrk.16.9",
    "Mrk.16.10",
    "Mrk.16.11",
    "Mrk.16.12",
    "Mrk.16.13",
    "Mrk.16.14",
    "Mrk.16.15",
    "Mrk.16.16",
    "Mrk.16.18",
    "Mrk.16.19",
    "Mrk.16.20",
    "Luk.17.36",
    "Luk.23.17",
    "Jhn.5.4",
    "Jhn.7.53{8.1}",
    "Jhn.8.1",
    "Jhn.8.2",
    "Jhn.8.3",
    "Jhn.8.4",
    "Jhn.8.5",
    "Jhn.8.6",
    "Jhn.8.7",
    "Jhn.8.8",
    "Jhn.8.9",
    "Jhn.8.10",
    "Jhn.8.11",
    "Act.8.37",
    "Act.15.34",
    "Act.24.7",
    "Act.28.29",
    "Rom.16.25{14.24}",
    "Rom.16.26{14.25}",
    "Rom.16.27{14.26}",
)
