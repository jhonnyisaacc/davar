from enum import Enum


class VisibilityMethod(str, Enum):
    UNAIDED = "unaided"
    AIDED = "aided"
    UNKNOWN = "unknown"


class MonthStatus(str, Enum):
    CONFIRMED = "confirmed"
    PENDING = "pending"
    SOURCE_UNAVAILABLE = "source_unavailable"
    REQUIRES_REVIEW = "requires_review"


class YearStartStatus(str, Enum):
    UNRESOLVED = "unresolved"
    MANUAL = "manual"
    CONFIRMED = "confirmed"


class SourceStatus(str, Enum):
    OK = "ok"
    SOURCE_UNAVAILABLE = "source_unavailable"
    MALFORMED = "malformed"
    REQUIRES_REVIEW = "requires_review"
    UNCHANGED = "unchanged"


class Locale(str, Enum):
    ES = "es"
    EN = "en"
    HE = "he"
    PT = "pt"
    AR = "ar"
    FA = "fa"


RTL_LOCALES = frozenset({Locale.HE, Locale.AR, Locale.FA})


class NewMoonSource(str, Enum):
    ISRAELI_NEW_MOON_SOCIETY = "israeli_new_moon_society"
