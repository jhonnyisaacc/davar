"""Official STEPBible source locations and recorded revisions for #161/#162."""

from __future__ import annotations

from dataclasses import dataclass

STEPBIBLE_REPO = "https://github.com/STEPBible/STEPBible-Data"
STEPBIBLE_COMMIT = "ae39711d7843b2902d54993e432de9c12d6a4b9a"
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
    blob_sha="705c1bc1cf752e013efcef99b8d9a3b7853bf843",
    filename="TAGNT-Mat-Jhn.txt",
)
TAGNT_ACT_REV = OfficialSource(
    key="tagnt-act-rev",
    relative_path=(
        "Translators Amalgamated OT+NT/"
        "TAGNT Act-Rev - Translators Amalgamated Greek NT - STEPBible.org CC-BY.txt"
    ),
    blob_sha="4bbea2c14681b01eb889d5a2d1dc0856858a32de",
    filename="TAGNT-Act-Rev.txt",
)
TBESG = OfficialSource(
    key="tbesg",
    relative_path=(
        "Lexicons/"
        "TBESG - Translators Brief lexicon of Extended Strongs for Greek - "
        "STEPBible.org CC BY.txt"
    ),
    blob_sha="efe271a1dbb73fa01f8fa6e0f164c6687757a9ae",
    filename="TBESG.txt",
)

TAGNT_SOURCES = (TAGNT_MAT_JHN, TAGNT_ACT_REV)
ALL_SOURCES = (*TAGNT_SOURCES, TBESG)

UBS_REPO = "https://github.com/ubsicap/ubs-open-license"
UBS_COMMIT = "3a6edd8212df2e1189037ad39687726990c80d56"
UBS_ES_PATH = "dictionaries/greek/JSON/UBSGreekNTDic-v1.0-es.JSON"
UBS_ES_URL = (
    f"https://raw.githubusercontent.com/ubsicap/ubs-open-license/{UBS_COMMIT}/"
    f"{UBS_ES_PATH}"
)
