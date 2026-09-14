# Greek Besorah modifications — ae39711d7843b2902d54993e432de9c12d6a4b9a

Source: STEP Bible (www.STEPBible.org), Tyndale House, Cambridge, CC BY 4.0.
Repository: https://github.com/STEPBible/STEPBible-Data/tree/ae39711d7843b2902d54993e432de9c12d6a4b9a

## What changed

Davar reformats official TAGNT and TBESG into edition-namespaced JSON. Greek spelling, accents, punctuation, token order, lemmas, and disambiguated Strong’s identifiers are preserved. Only lookup keys are normalized.

## Edition selection

Displayed tokens are those whose TAGNT Editions field includes `SBL` (Holmes 2010). Alternatives without `SBL` are dropped, never concatenated. N/K/O is not the selector.

## Spelling and punctuation

If Spelling variants names `SBL`, that form is used. Otherwise the main Greek cell is used. TAGNT default spelling is NA28 for shared words. Punctuation follows TAGNT’s THGNT-based punctuation. This is not a byte-for-byte reprint of printed SBLGNT.

## Columns not used as dictionary text

TAGNT English (Berean, STEPBible-only permission) and Spanish (OpenGNT) columns are not stored as Davar definitions. English definitions come from TBESG.

## Books imported

matthew, mark, luke, john, acts, romans, corinthians1, corinthians2, galatians, ephesians, philippians, colossians, thessalonians1, thessalonians2, timothy1, timothy2, titus, philemon, hebrews, james, peter1, peter2, john1, john2, john3, jude, revelation

## Absent SBL verses at this revision

These TAGNT identities have rows but no `SBL` token. They are recorded as absent and are not filled from Hebrew Besorah or NA28.

- `Mat.17.21`
- `Mat.18.11`
- `Mat.23.14`
- `Mrk.7.16`
- `Mrk.9.44`
- `Mrk.9.46`
- `Mrk.11.26`
- `Mrk.15.28`
- `Mrk.16.9`
- `Mrk.16.10`
- `Mrk.16.11`
- `Mrk.16.12`
- `Mrk.16.13`
- `Mrk.16.14`
- `Mrk.16.15`
- `Mrk.16.16`
- `Mrk.16.18`
- `Mrk.16.19`
- `Mrk.16.20`
- `Luk.17.36`
- `Luk.23.17`
- `Jhn.5.4`
- `Jhn.7.53{8.1}`
- `Jhn.8.1`
- `Jhn.8.2`
- `Jhn.8.3`
- `Jhn.8.4`
- `Jhn.8.5`
- `Jhn.8.6`
- `Jhn.8.7`
- `Jhn.8.8`
- `Jhn.8.9`
- `Jhn.8.10`
- `Jhn.8.11`
- `Act.8.37`
- `Act.15.34`
- `Act.24.7`
- `Act.28.29`
- `Rom.16.25{14.24}`
- `Rom.16.26{14.25}`
- `Rom.16.27{14.26}`
