# Greek Besorah transliteration

Rule version: `greek-transliteration-v1`.

The importer generates transliteration at build time. Runtime web and mobile
code must only display stored values and must never call an AI model to invent
them.

## Stored fields

Each token stores form and lemma transliterations separately:

- `transliteration.form.en|es|he`
- `transliteration.lemma.en|es|he`
- `transliteration.rule_version`

The flattened `translit_*` and `lemma_translit_*` fields are retained for
current loaders. English form values prefer TAGNT's supplied parenthetical
transliteration. English lemma values prefer TBESG. The deterministic rules
fill source gaps.

## Normalization

Input may be NFC or NFD. The engine decomposes it to identify breathing,
diaeresis, accents, and iota subscript. Accents do not change the output.
Diaeresis prevents a vowel combination. Rough breathing adds `h` in Latin
scripts and `ה` in Hebrew. Smooth breathing is silent. Iota subscript adds
`i` or `י`.

Greek punctuation is not copied into a dictionary transliteration.

## English fallback

Single letters use conventional scholarly Latin values, including `η → ē`,
`θ → th`, `υ → y`, `φ → ph`, `χ → ch`, and `ω → ō`.

Combinations: `αι → ai`, `ει → ei`, `οι → oi`, `ου → ou`, `αυ → au`,
`ευ → eu`, `ηυ → ēu`, `υι → yi`, `γγ → ng`, `γκ → nk`, `γξ → nx`,
and `γχ → nch`.

## Spanish

Spanish is generated directly from Greek, not by modifying English. Long-vowel
marks are omitted. Reading-oriented values include `η → e`, `θ → t`, `υ → i`,
`φ → f`, `χ → j`, and `ω → o`. `ου → u`; the other combinations preserve
their written vowels.

## Hebrew letters

Hebrew is generated directly from Greek and is a pronunciation aid, not a
translation or a claim about Hebrew etymology. Consonants use the nearest
practical Hebrew letters; vowels use `א`, `י`, and `ו` as readable matres.
Combinations are versioned in `transliteration.py`. Hebrew final forms are
applied at word boundaries.

## Exceptions and review

`tests/fixtures/greek/transliteration_exceptions_v1.json` contains exact-NFC,
versioned exceptions. Any intentional rule or exception change requires:

1. a new rule version;
2. regeneration of all Greek artifacts;
3. successful reviewed examples in
   `tests/fixtures/greek/transliteration_examples_v1.json`.
