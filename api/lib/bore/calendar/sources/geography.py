from __future__ import annotations

import re
import unicodedata

ISRAEL_ALIASES = {
    "israel",
    "ירושלים",
    "jerusalem",
    "yerushalayim",
    "maale adumim",
    "maaleh adumim",
    "ma'ale adumim",
    "מעלה אדומים",
    "modiin ilit",
    "modiin illit",
    "modi'in ilit",
    "מודיעין עילית",
    "rehovot",
    "rechovot",
    "rechovoto",
    "רחובות",
    "givat shmuel",
    "גבעת שמואל",
    "otniel",
    "עתניאל",
    "ofra",
    "עפרה",
    "talmon",
    "טלמון",
    "shomeria",
    "שומרייה",
    "שומריה",
    "negohot",
    "נגוהות",
    "ein hanatziv",
    "עין הנציב",
    "gilo",
    "גילו",
    "poria ilit",
    "פוריה עילית",
    "har nof",
    "modiin",
    "מודיעין",
    "tel aviv",
    "תל אביב",
    "haifa",
    "חיפה",
    "beer sheva",
    "beersheba",
    "eilat",
    "tzfat",
    "safed",
    "tiberias",
    "ariel",
    "beit shemesh",
    "rishon lezion",
    "petah tikva",
    "netanya",
    "ashdod",
    "ashkelon",
    "herzliya",
    "raanana",
    "kfar saba",
    "ramat gan",
    "bnei brak",
    "hebron",
    "chevron",
    "חברון",
    "beit el",
    "kiryat arba",
    "mishor adumim",
}

NON_ISRAEL_ALIASES = {
    "usa",
    "united states",
    "america",
    "texas",
    "plano texas",
    "europe",
    "france",
    "england",
    "canada",
    "australia",
    "ארהב",
    'ארה"ב',
}


def _normalize(value: str) -> str:
    folded = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    if folded.strip():
        value = folded
    value = value.lower().replace("'", "").replace("’", "").replace('"', "")
    value = re.sub(r"[^a-z0-9\u0590-\u05ff]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def _contains_phrase(haystack: str, needle: str) -> bool:
    return re.search(rf"(?<![\w]){re.escape(needle)}(?![\w])", haystack) is not None


def infer_country(*parts: str) -> str:
    blob = " ".join(part for part in parts if part)
    normalized = _normalize(blob)
    raw = blob.lower()
    if 'ארה"ב' in raw or _contains_phrase(raw, "texas") or _contains_phrase(raw, "usa") or "united states" in raw:
        return "US"
    for alias in NON_ISRAEL_ALIASES:
        if _contains_phrase(normalized, alias) or _contains_phrase(raw, alias):
            return "US" if alias in {"usa", "united states", "america", "texas", "plano texas"} else "XX"
    for alias in ISRAEL_ALIASES:
        if alias in normalized or alias in blob:
            return "IL"
    # Hebrew place names that were not latinized still count as Israel when
    # they appear on an Israeli New Moon Society domestic table.
    if re.search(r"[\u0590-\u05ff]", blob) and "ארה" not in blob:
        return "IL"
    return "unknown"
