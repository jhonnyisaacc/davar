"""Scripture-attested Biblical month identity.

Named months are only those appearing in Tanakh:
1 Aviv, 2 Ziv, 7 Etanim, 8 Bul.
All other months are ordinal.
"""

NAMED_BIBLICAL_MONTHS = {
    1: "aviv",
    2: "ziv",
    7: "etanim",
    8: "bul",
}

ORDINAL_BIBLICAL_MONTHS = {
    3: "third_month",
    4: "fourth_month",
    5: "fifth_month",
    6: "sixth_month",
    9: "ninth_month",
    10: "tenth_month",
    11: "eleventh_month",
    12: "twelfth_month",
    13: "thirteenth_month",
}

BIBLICAL_MONTH_IDS = {**NAMED_BIBLICAL_MONTHS, **ORDINAL_BIBLICAL_MONTHS}


def month_id_for_ordinal(ordinal: int) -> str | None:
    return BIBLICAL_MONTH_IDS.get(ordinal)
