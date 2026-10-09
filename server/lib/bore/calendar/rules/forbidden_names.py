import re

BABYLONIAN_MONTH_IDS = frozenset(
    {
        "nisan",
        "nissan",
        "iyar",
        "iyyar",
        "sivan",
        "tammuz",
        "tamuz",
        "av",
        "elul",
        "tishrei",
        "tishrey",
        "tishri",
        "cheshvan",
        "marcheshvan",
        "kislev",
        "tevet",
        "teves",
        "shevat",
        "shvat",
        "adar",
        "adar_i",
        "adar_ii",
        "adar_1",
        "adar_2",
    }
)

_TOKEN = re.compile(r"[a-z_]+")


def contains_babylonian_month_name(value: str | None) -> bool:
    if not value:
        return False
    tokens = _TOKEN.findall(value.lower().replace("á", "a").replace("é", "e"))
    return any(token in BABYLONIAN_MONTH_IDS for token in tokens)
