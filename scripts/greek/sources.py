"""Official STEPBible source locations and recorded revisions for #161/#162."""

from __future__ import annotations

from dataclasses import dataclass

STEPBIBLE_REPO = "https://github.com/STEPBible/STEPBible-Data"
STEPBIBLE_COMMIT = "5de0a47f35f0fc13dfe1430d104e5db8a4285f9c"
RAW_BASE = (
    "https://raw.githubusercontent.com/STEPBible/STEPBible-Data/"
    f"{STEPBIBLE_COMMIT}/"
)


@dataclass(frozen=True)
class OfficialSource:
    key: str
    relative_path: str
    blob_sha: str
    filename: str

    @property
    def url(self) -> str:
        return RAW_BASE + self.relative_path.replace(" ", "%20")


TAGNT_MAT_JHN = OfficialSource(
    key="tagnt-mat-jhn",
    relative_path=(
        "Translators Amalgamated OT+NT/"
        "TAGNT Mat-Jhn - Translators Amalgamated Greek NT - STEPBible.org CC-BY.txt"
    ),
    blob_sha="3348f4ce1d1ca03405e2c3a5fd6a3cf1817fb9d6",
    filename="TAGNT-Mat-Jhn.txt",
)
TAGNT_ACT_REV = OfficialSource(
    key="tagnt-act-rev",
    relative_path=(
        "Translators Amalgamated OT+NT/"
        "TAGNT Act-Rev - Translators Amalgamated Greek NT - STEPBible.org CC-BY.txt"
    ),
    blob_sha="08efc474124d3b243b73c1a681a244290d0ae05c",
    filename="TAGNT-Act-Rev.txt",
)
TBESG = OfficialSource(
    key="tbesg",
    relative_path=(
        "Lexicons/"
        "TBESG - Translators Brief lexicon of Extended Strongs for Greek - "
        "STEPBible.org CC BY.txt"
    ),
    blob_sha="d61029c1f7aaaa629d272aa4bc2ba14678ede0de",
    filename="TBESG.txt",
)

TAGNT_SOURCES = (TAGNT_MAT_JHN, TAGNT_ACT_REV)
ALL_SOURCES = (*TAGNT_SOURCES, TBESG)

UBS_REPO = "https://github.com/ubsicap/ubs-open-license"
UBS_COMMIT = "3a6edd8212df2e1189037ad39687726990c80d56"
UBS_ES_PATH = "dictionaries/greek/JSON/UBSGreekNTDic-v1.0-es.JSON"
UBS_ES_BLOB_SHA = "285c436f3fff645d23d8edff64d21564612a19b1"
UBS_ES_URL = (
    f"https://raw.githubusercontent.com/ubsicap/ubs-open-license/{UBS_COMMIT}/"
    f"{UBS_ES_PATH}"
)
