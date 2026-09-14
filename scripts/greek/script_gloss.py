"""Script-localize TBESG citations and scholarly marks so the API sees prose only."""

from __future__ import annotations

import re
from dataclasses import dataclass

PLACEHOLDER = "«{index}»"
_PLACEHOLDER_RE = re.compile(r"«(\d+)»")
_LATIN_WORD = re.compile(r"[A-Za-z]{3,}")
_GREEK_CHAR = r"[\u0370-\u03FF\u1F00-\u1FFF\u0300-\u036F]"
_GREEK = re.compile(rf"{_GREEK_CHAR}+(?:\s*{_GREEK_CHAR}+)*")
_GREEK_SEARCH = re.compile(_GREEK_CHAR)
_HEBREW = re.compile(r"[\u0590-\u05FF]+(?:[\s\u05BE]*[\u0590-\u05FF]+)*")
_DAGGER = re.compile(r"[†*]")
_AS = re.compile(r"\(\s*AS\s*\)")
_BOOK = r"(?:(?:[123]|I{1,3})\s?)?[A-Z][a-z]{1,3}"
_REF = r"\d+(?:\s*\(\d+\))?(?::\d+(?:\s*[-–]\s*\d+)?)?"
_CITATION = re.compile(
    rf"(?:(?<=\()|(?<![A-Za-z])){_BOOK}\.?\s*{_REF}"
    rf"(?:\s*[,;]\s*(?:{_BOOK}\.?\s*{_REF}|{_REF}))*"
)
_BOOK_TOKEN = re.compile(rf"({_BOOK})\.?(?=\s*\d)")
_ROMAN = re.compile(r"(?<![A-Za-z])[xviXVI]{2,}(?![A-Za-z])")
_SEE_REF = re.compile(
    r"""(?ix)
    (?:
        which\s+see
      | see\s+word
      | see\s+also
      | see\s*:
      | see\s+(?:infr|supr|below|above)\.?
      | see\s+(?:
            MM|VGT|Swete|ICC|Hort\.?|Mayor|WM|Viteau|
            Cremer|Deiss\.?|LS|Blass|Westc\.?|Thayer|Moulton
        )
      | (?<=:\s)see(?=\s*(?:$|[).,;†\n]))
    )
    """
)
_SEE_LABEL = {"es": "véase", "he": "ר׳"}

BOOKS: dict[str, dict[str, str]] = {
    "Mat": {"es": "Mt", "he": "מתי"},
    "Mrk": {"es": "Mc", "he": "מרקוס"},
    "Mk": {"es": "Mc", "he": "מרקוס"},
    "Luk": {"es": "Lc", "he": "לוקס"},
    "Luke": {"es": "Lc", "he": "לוקס"},
    "Jhn": {"es": "Jn", "he": "יוחנן"},
    "Jn": {"es": "Jn", "he": "יוחנן"},
    "Act": {"es": "Hch", "he": "מע״ש"},
    "Rom": {"es": "Ro", "he": "רומים"},
    "1Co": {"es": "1Co", "he": "1קור"},
    "2Co": {"es": "2Co", "he": "2קור"},
    "Gal": {"es": "Gá", "he": "גל"},
    "Eph": {"es": "Ef", "he": "אפ"},
    "Php": {"es": "Fil", "he": "פי"},
    "Col": {"es": "Col", "he": "קל"},
    "1Th": {"es": "1Ts", "he": "1תס"},
    "2Th": {"es": "2Ts", "he": "2תס"},
    "1Ti": {"es": "1Ti", "he": "1טי"},
    "2Ti": {"es": "2Ti", "he": "2טי"},
    "Tit": {"es": "Tit", "he": "טיט"},
    "Phm": {"es": "Flm", "he": "פימ"},
    "Heb": {"es": "Heb", "he": "עב"},
    "Ti": {"es": "Ti", "he": "טי"},
    "Ps": {"es": "Sal", "he": "תה"},
    "Ju": {"es": "Jud", "he": "יהו"},
    "Jas": {"es": "Stg", "he": "יעק"},
    "1Pe": {"es": "1P", "he": "1פ"},
    "2Pe": {"es": "2P", "he": "2פ"},
    "1Jn": {"es": "1Jn", "he": "1יוח"},
    "2Jn": {"es": "2Jn", "he": "2יוח"},
    "3Jn": {"es": "3Jn", "he": "3יוח"},
    "1Jo": {"es": "1Jn", "he": "1יוח"},
    "2Jo": {"es": "2Jn", "he": "2יוח"},
    "3Jo": {"es": "3Jn", "he": "3יוח"},
    "Jud": {"es": "Jud", "he": "יהו"},
    "Rev": {"es": "Ap", "he": "התג"},
    "Gen": {"es": "Gn", "he": "בר"},
    "Exo": {"es": "Éx", "he": "שמ"},
    "Lev": {"es": "Lv", "he": "וי"},
    "Num": {"es": "Nm", "he": "במ"},
    "Deu": {"es": "Dt", "he": "דב"},
    "Jos": {"es": "Jos", "he": "יהוש"},
    "Jdg": {"es": "Jue", "he": "שופ"},
    "Rut": {"es": "Rt", "he": "רות"},
    "1Sa": {"es": "1S", "he": "1שמ"},
    "2Sa": {"es": "2S", "he": "2שמ"},
    "1Ki": {"es": "1R", "he": "1מל"},
    "2Ki": {"es": "2R", "he": "2מל"},
    "3Ki": {"es": "3R", "he": "3מל"},
    "1Ch": {"es": "1Cr", "he": "1דה"},
    "2Ch": {"es": "2Cr", "he": "2דה"},
    "Ezr": {"es": "Esd", "he": "עז"},
    "Neh": {"es": "Neh", "he": "נחמ"},
    "Est": {"es": "Est", "he": "אס"},
    "Job": {"es": "Job", "he": "איוב"},
    "Psa": {"es": "Sal", "he": "תה"},
    "Pro": {"es": "Pr", "he": "מש"},
    "Ecc": {"es": "Ec", "he": "קה"},
    "Sng": {"es": "Cnt", "he": "שה״ש"},
    "Isa": {"es": "Is", "he": "יש"},
    "Jer": {"es": "Jer", "he": "יר"},
    "Lam": {"es": "Lm", "he": "איכה"},
    "Eze": {"es": "Ez", "he": "יח"},
    "Dan": {"es": "Dn", "he": "דנ"},
    "Hos": {"es": "Os", "he": "הוש"},
    "Jol": {"es": "Jl", "he": "יואל"},
    "Joe": {"es": "Jl", "he": "יואל"},
    "Amo": {"es": "Am", "he": "עמ"},
    "Oba": {"es": "Abd", "he": "עוב"},
    "Jon": {"es": "Jon", "he": "יונ"},
    "Mic": {"es": "Mi", "he": "מיכ"},
    "Nah": {"es": "Nah", "he": "נח"},
    "Nam": {"es": "Nah", "he": "נח"},
    "Hab": {"es": "Hab", "he": "חב"},
    "Zep": {"es": "Sof", "he": "צפ"},
    "Hag": {"es": "Hag", "he": "חגי"},
    "Zec": {"es": "Zac", "he": "זכ"},
    "Mal": {"es": "Mal", "he": "מל"},
    "Sir": {"es": "Eclo", "he": "בן־סירא"},
    "Wis": {"es": "Sab", "he": "חכמ"},
    "1Ma": {"es": "1Mac", "he": "1מק"},
    "2Ma": {"es": "2Mac", "he": "2מק"},
    "3Ma": {"es": "3Mac", "he": "3מק"},
    "4Ma": {"es": "4Mac", "he": "4מק"},
    "3Mac": {"es": "3Mac", "he": "3מק"},
    "Tob": {"es": "Tob", "he": "טובי"},
    "Jdth": {"es": "Jdt", "he": "יהודית"},
    "Jdt": {"es": "Jdt", "he": "יהודית"},
    "Bar": {"es": "Bar", "he": "ברוך"},
    "1Es": {"es": "1Esd", "he": "1עז"},
    "2Es": {"es": "2Esd", "he": "2עז"},
}

# Longer keys first so "metaphorically" wins over "metaph".
ABBREVS: tuple[tuple[str, dict[str, str]], ...] = (
    ("metaphorically", {"es": "metafóricamente", "he": "בהשאלה"}),
    ("with accusative of person(s)", {"es": "con acus. de pers.", "he": "עם ישי׳ של אדם"}),
    ("with accusative of thing(s)", {"es": "con acus. de cosa", "he": "עם ישי׳ של דבר"}),
    ("with accusative of person", {"es": "con acus. de pers.", "he": "עם ישי׳ של אדם"}),
    ("with accusative of thing", {"es": "con acus. de cosa", "he": "עם ישי׳ של דבר"}),
    ("with genitive of person(s)", {"es": "con gen. de pers.", "he": "עם יחס׳ של אדם"}),
    ("with genitive of thing(s)", {"es": "con gen. de cosa", "he": "עם יחס׳ של דבר"}),
    ("with genitive of person", {"es": "con gen. de pers.", "he": "עם יחס׳ של אדם"}),
    ("with genitive of thing", {"es": "con gen. de cosa", "he": "עם יחס׳ של דבר"}),
    ("with dative of person(s)", {"es": "con dat. de pers.", "he": "עם עקיף של אדם"}),
    ("with dative of thing(s)", {"es": "con dat. de cosa", "he": "עם עקיף של דבר"}),
    ("with dative of person", {"es": "con dat. de pers.", "he": "עם עקיף של אדם"}),
    ("with dative of thing", {"es": "con dat. de cosa", "he": "עם עקיף של דבר"}),
    ("accusative of person(s)", {"es": "acus. de pers.", "he": "ישי׳ של אדם"}),
    ("accusative of person", {"es": "acus. de pers.", "he": "ישי׳ של אדם"}),
    ("with infinitive", {"es": "con inf.", "he": "עם מקור"}),
    ("with indicative", {"es": "con indic.", "he": "עם מציאות"}),
    ("with subjunctive", {"es": "con subj.", "he": "עם משאלה"}),
    ("with optative", {"es": "con opt.", "he": "עם אופטי"}),
    ("with participle", {"es": "con part.", "he": "עם בינוני"}),
    ("with article", {"es": "con art.", "he": "עם היידוע"}),
    ("with aorist", {"es": "con aor.", "he": "עם עבר"}),
    ("with negation", {"es": "con neg.", "he": "עם שלילה"}),
    ("with accusative", {"es": "con acus.", "he": "עם ישי׳"}),
    ("with genitive", {"es": "con gen.", "he": "עם יחס׳"}),
    ("with dative", {"es": "con dat.", "he": "עם עקיף"}),
    ("with inf.", {"es": "con inf.", "he": "עם מקור"}),
    ("with indic.", {"es": "con indic.", "he": "עם מציאות"}),
    ("with subjc", {"es": "con subj.", "he": "עם משאלה"}),
    ("with ptcp", {"es": "con part.", "he": "עם בינוני"}),
    ("with subst", {"es": "con sust.", "he": "עם שם"}),
    ("with prep", {"es": "con prep.", "he": "עם מילת יחס"}),
    ("with aor", {"es": "con aor.", "he": "עם עבר"}),
    ("with inf", {"es": "con inf.", "he": "עם מקור"}),
    ("with art", {"es": "con art.", "he": "עם היידוע"}),
    ("with adv", {"es": "con adv.", "he": "עם תואר"}),
    ("with neg", {"es": "con neg.", "he": "עם שלילה"}),
    ("accusative", {"es": "acus.", "he": "ישי׳"}),
    ("genitive", {"es": "gen.", "he": "יחס׳"}),
    ("dative", {"es": "dat.", "he": "עקיף"}),
    ("frequently", {"es": "frec.", "he": "לעיתים קרובות"}),
    ("chiefly", {"es": "princ.", "he": "בעיקר"}),
    ("Christ's", {"es": "de Cristo", "he": "המשיח"}),
    ("Messiah's", {"es": "de Mesías", "he": "המשיח"}),
    ("Christ", {"es": "Cristo", "he": "משיח"}),
    ("Messiah", {"es": "Mesías", "he": "משיח"}),
    ("see also", {"es": "véase también", "he": "ראה גם"}),
    ("see word", {"es": "véase", "he": "ר׳ ערך"}),
    ("see below", {"es": "véase abajo", "he": "ר׳ להלן"}),
    ("see above", {"es": "véase arriba", "he": "ר׳ לעיל"}),
    ("see infr.", {"es": "véase infr.", "he": "ר׳ להלן"}),
    ("see supr.", {"es": "véase supr.", "he": "ר׳ לעיל"}),
    ("in cl.", {"es": "en clás.", "he": "בקלאסית"}),
    ("in NT", {"es": "en el NT", "he": "ברה״ח"}),
    ("in LXX", {"es": "en LXX", "he": "בשבעים"}),
    ("opposite to", {"es": "opp. a", "he": "נגד"}),
    ("which see", {"es": "véase", "he": "ר׳ ערך"}),
    ("Aram.", {"es": "aram.", "he": "ארמ׳"}),
    ("Aram,", {"es": "aram.", "he": "ארמ׳"}),
    ("Heb.", {"es": "heb.", "he": "עב׳"}),
    ("Cremer", {"es": "Cremer", "he": "Cremer"}),
    ("Swete", {"es": "Swete", "he": "Swete"}),
    ("Milligan", {"es": "Milligan", "he": "Milligan"}),
    ("indecl.", {"es": "indecl.", "he": "בלתי-נוטה"}),
    ("subst.", {"es": "sust.", "he": "כשם"}),
    ("metaph.", {"es": "metáf.", "he": "בהשאלה"}),
    ("seqq.", {"es": "seqq.", "he": "ואח׳"}),
    ("supr.", {"es": "supr.", "he": "לעיל"}),
    ("infr.", {"es": "infr.", "he": "להלן"}),
    ("prop.", {"es": "prop.", "he": "בעיקרו"}),
    ("q.v.", {"es": "v.", "he": "ר׳ ערך"}),
    ("e.g.", {"es": "p. ej.", "he": "למשל"}),
    ("i.e.", {"es": "es decir", "he": "כלומר"}),
    ("FlJ", {"es": "FlJ", "he": "יוסף בן מתתיהו"}),
    ("VGT", {"es": "VGT", "he": "VGT"}),
    ("LXX", {"es": "LXX", "he": "LXX"}),
    ("NT", {"es": "NT", "he": "ברה״ח"}),
    ("OT", {"es": "AT", "he": "תנ״ך"}),
    ("MM", {"es": "MM", "he": "MM"}),
    ("WH", {"es": "WH", "he": "WH"}),
    ("Rec.", {"es": "Rec.", "he": "Rec."}),
    ("seq.", {"es": "seq.", "he": "ואח׳"}),
    ("sc.", {"es": "sc.", "he": "כלומר"}),
    ("al.", {"es": "etc.", "he": "ועוד"}),
    ("cf.", {"es": "cf.", "he": "השוו"}),
    ("cl.", {"es": "clás.", "he": "קלאסית"}),
    ("lit.", {"es": "lit.", "he": "כפשוטו"}),
    ("fig.", {"es": "fig.", "he": "בהשאלה"}),
    ("esp.", {"es": "esp.", "he": "במיוחד"}),
    ("abs.", {"es": "abs.", "he": "מוחלט"}),
    ("etc.", {"es": "etc.", "he": "ועוד"}),
    ("univ.", {"es": "univ.", "he": "כללי"}),
    ("mid.", {"es": "med.", "he": "בינוני"}),
    ("fem.", {"es": "fem.", "he": "נק׳"}),
    ("masc.", {"es": "masc.", "he": "ז׳"}),
    ("neut.", {"es": "neut.", "he": "סת׳"}),
    ("aor.", {"es": "aor.", "he": "עבר"}),
    ("pass.", {"es": "pas.", "he": "סביל"}),
    ("act.", {"es": "act.", "he": "פעיל"}),
    ("gen.", {"es": "gen.", "he": "יחס׳"}),
    ("dat.", {"es": "dat.", "he": "עקיף"}),
    ("acc.", {"es": "acus.", "he": "ישיר"}),
    ("nom.", {"es": "nom.", "he": "נושא"}),
    ("inf.", {"es": "inf.", "he": "מקור"}),
    ("ib.", {"es": "ib.", "he": "שם"}),
    ("exc.", {"es": "exc.", "he": "חוץ"}),
    ("Ion.", {"es": "ión.", "he": "יונית"}),
    ("pi.", {"es": "pi.", "he": "פיעל"}),
    ("hi.", {"es": "hi.", "he": "הפעיל"}),
    ("App.", {"es": "Apénd.", "he": "נספח"}),
    ("bks.", {"es": "libros", "he": "ספרים"}),
    ("absol.", {"es": "abs.", "he": "מוחלט"}),
    ("adv.", {"es": "adv.", "he": "תואר"}),
    ("syn.", {"es": "sín.", "he": "נרדף"}),
    ("cf .", {"es": "cf.", "he": "השוו"}),
    ("see:", {"es": "véase:", "he": "ר׳:"}),
)

def _abbrev_pattern(key: str) -> str:
    pattern = re.escape(key)
    if key.endswith("."):
        pattern += r"(?!\d)"
    if key[:1].isalnum():
        pattern = r"(?<![A-Za-z])" + pattern
    if key[-1:].isalnum():
        pattern += r"(?![A-Za-z])"
    return pattern


_ABBREV_RE = re.compile(
    r"|".join(_abbrev_pattern(key) for key, _ in sorted(ABBREVS, key=lambda item: -len(item[0]))),
    re.I,
)
_ABBREV_MAP = {key.lower(): value for key, value in ABBREVS}


@dataclass(frozen=True)
class PreparedField:
    original: str
    api_text: str
    tokens: tuple[str, ...]
    script_only: bool


def localize_protected(text: str, target: str) -> str:
    def book(match: re.Match[str]) -> str:
        token = re.sub(r"\s+", "", match.group(1))
        mapped = BOOKS.get(token, {}).get(target)
        suffix = "." if "." in match.group(0) else " "
        return f"{mapped}{suffix}" if mapped else match.group(0)

    text = _BOOK_TOKEN.sub(book, text)

    def abbrev(match: re.Match[str]) -> str:
        mapped = _ABBREV_MAP.get(match.group(0).lower(), {})
        return mapped.get(target, match.group(0))

    return _ABBREV_RE.sub(abbrev, text)


def localize_token(token: str, target: str) -> str:
    localized = localize_protected(token, target)
    if token.strip().lower() == "see" or _SEE_REF.search(token):
        localized = re.sub(r"(?i)\bsee\b", _SEE_LABEL[target], localized)
    return localized


def _mask(text: str) -> tuple[str, tuple[str, ...]]:
    tokens: list[str] = []

    def store(match: re.Match[str]) -> str:
        tokens.append(match.group(0))
        return PLACEHOLDER.format(index=len(tokens) - 1)

    patterns = (_AS, _CITATION, _SEE_REF, _ABBREV_RE, _HEBREW, _GREEK, _DAGGER, _ROMAN)
    masked = text
    for pattern in patterns:
        masked = pattern.sub(store, masked)
    return masked, tuple(tokens)


def restore(text: str, tokens: tuple[str, ...]) -> str:
    def replace(match: re.Match[str]) -> str:
        index = int(match.group(1))
        if 0 <= index < len(tokens):
            return tokens[index]
        return match.group(0)

    return _PLACEHOLDER_RE.sub(replace, text)


def remaining_prose(masked: str) -> str:
    return _PLACEHOLDER_RE.sub(" ", masked)


def is_script_only(masked: str) -> bool:
    return not _LATIN_WORD.search(remaining_prose(masked))


def has_greek(text: str) -> bool:
    return bool(_GREEK_SEARCH.search(text or ""))


def prepare_field(text: str, target: str) -> PreparedField:
    if not text:
        return PreparedField("", "", (), True)
    masked, tokens = _mask(text)
    return PreparedField(
        original=text,
        api_text="" if is_script_only(masked) else masked,
        tokens=tokens,
        script_only=is_script_only(masked),
    )


def finalize_field(api_text: str, prepared: PreparedField, target: str) -> str:
    if prepared.script_only:
        return localize_protected(prepared.original, target)
    localized_tokens = tuple(localize_token(token, target) for token in prepared.tokens)
    source = api_text if api_text.strip() else prepared.api_text
    return restore(source, localized_tokens).strip()


def prepare_pair(
    short: str,
    fuller: str,
    target: str,
) -> tuple[PreparedField, PreparedField]:
    return prepare_field(short, target), prepare_field(fuller, target)
