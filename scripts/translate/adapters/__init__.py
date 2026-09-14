"""Content adapters that turn Davar stores into TranslateJob lists."""

from scripts.translate.adapters.concepts import ConceptsAdapter
from scripts.translate.adapters.greek import GreekAdapter
from scripts.translate.adapters.lexicon import LexiconAdapter
from scripts.translate.adapters.locales import LocalesAdapter

ADAPTERS = {
    "concepts": ConceptsAdapter,
    "greek": GreekAdapter,
    "lexicon": LexiconAdapter,
    "locales": LocalesAdapter,
}

__all__ = [
    "ADAPTERS",
    "ConceptsAdapter",
    "GreekAdapter",
    "LexiconAdapter",
    "LocalesAdapter",
]
