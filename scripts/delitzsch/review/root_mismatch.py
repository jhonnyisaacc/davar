import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
FINALS = str.maketrans("ךםןףץ", "כמנפצ")
SAME_SOUND = str.maketrans("ס", "ש")
WEAK = set("יוהאנ")
MATRES = set("יו")
VARIANTS = {"לקח": ["קח"], "אחד": ["חת"]}
SUFFIXES = ("תמ", "תנ", "ימ", "ות", "נו", "מ", "ו", "ה", "י", "כ", "ת")
PRONOUN_SUFFIX = {"H859": "כ", "H589": "", "H595": "", "H587": "", "H1931": "", "H1992": "מ", "H2007": "", "H1958": ""}
MAX_GAP = 2


def letters(text):
    return "".join(c for c in unicodedata.normalize("NFD", text) if "א" <= c <= "ת").translate(FINALS).translate(SAME_SOUND)


def squeeze(text, dropped):
    out = ""
    for c in letters(text):
        if c not in dropped and not out.endswith(c):
            out += c
    return out


def in_order(want, have):
    for start, c in enumerate(have):
        if c != want[0]:
            continue
        position = start
        for wanted in want[1:]:
            found = have.find(wanted, position + 1)
            if found < 0 or found - position > MAX_GAP:
                break
            position = found
        else:
            return True
    return False


def fits_form(token, form):
    want, have = squeeze(form, WEAK), squeeze(token, WEAK)
    if not want:
        want, have = squeeze(form, MATRES), squeeze(token, MATRES)
        want = want.rstrip("ה") or want
    return not want or in_order(want, have)


def lemma_forms(lemma):
    found = set()
    for word in re.split(r"[\s־־-]+", lemma):
        bare = letters(word)
        if bare:
            found.update({bare, *VARIANTS.get(bare, []), bare[:-1] + "ת" if bare.endswith("ד") else bare})
    return found


def custom_forms(hebrew):
    found = set()
    for word in re.split(r"[\s־־-]+", hebrew):
        bare = letters(word)
        if not bare:
            continue
        head = bare[1:] if len(bare) > 3 and bare[0] in "ובלמכהש" else bare
        found.update({bare, head})
        found.update(b[: -len(s)] for s in SUFFIXES for b in (bare, head) if b.endswith(s) and len(b) - len(s) >= 2)
    if len(found) > 1:
        found.add(letters(hebrew))
    return found


def suffixed_preposition(token, strong):
    if strong not in PRONOUN_SUFFIX:
        return False
    body = letters(token).lstrip("ו")
    return body[:1] in "לבמכ" and squeeze(body[1:], WEAK) in {PRONOUN_SUFFIX[strong], PRONOUN_SUFFIX[strong] + "מ"}


def entry_forms(lexicon, strong):
    forms = set()
    entry = lexicon.words.get(strong) or lexicon.roots.get(strong)
    if entry:
        forms |= lemma_forms(entry.get("lemma") or "")
        parent = entry.get("root_ref") and (lexicon.words.get(entry["root_ref"]) or lexicon.roots.get(entry["root_ref"]))
        if parent:
            forms |= lemma_forms(parent.get("lemma") or "")
    custom = lexicon.custom.get(strong)
    if custom:
        forms |= custom_forms(custom.get("hebrew") or "")
        if custom.get("root"):
            forms |= lemma_forms(custom["root"])
    return {form for form in forms if form}


def new_testament_words(root=ROOT):
    for path in sorted((root / "data/delitzsch/parsed").glob("*/*.json")):
        for chapter in json.loads(path.read_text(encoding="utf-8")):
            for verse in chapter["verses"]:
                for index, word in enumerate(verse["words"]):
                    if word.get("strong"):
                        yield f"{path.parent.name}.{chapter['chapter']}.{verse['verse']}.{index}", word


def mismatches(lexicon, root=ROOT):
    found = {}
    for location, word in new_testament_words(root):
        strong = word["strong"].split("/")[-1]
        forms = entry_forms(lexicon, strong)
        if forms and not suffixed_preposition(word["text"], strong) and not any(fits_form(word["text"], form) for form in forms):
            found[location] = (word["text"], strong)
    return found
