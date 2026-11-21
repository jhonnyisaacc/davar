# Knowledge corpus inventory and generated artifacts

## Context

Issue #200 extends the biblical knowledge foundation from pilot selections to every available, permitted source record. The normalized scripture alone is about 491 MB of canonical JSON. Some source families have unclear or restrictive terms, and the Shaul repository mixes public notes with private transcripts.

## Decision

Shaul knowledge/ and content/ are included at revision 8c94b0fe9eca817e22340430309801d0ef76125b. The included notes are the files under content/besorah, content/tanaj and content/temas.
Shaul private/ is excluded entirely. The corpus reads a clean checkout of the pinned revision, never a local working copy.
Shaul site pages (content/index.md, content/guide.md, content/books.md and content/templates/) are navigation and authoring scaffolding, not notes, and are deferred.
Shaul generated/ and data/ hold derived graphs and authoring inventories, not source records, and are deferred. Shaul docs/scriptures/ mirrors Davar OE, Delitzsch and TTH files for local verse sheets. It is restricted because it carries TTH, and its OE and Delitzsch copies are normalized from Davar directly.
A Shaul note whose bytes contain a local host path is accounted for as unresolved, not normalized.
Normalized notes keep frontmatter, references, and section headings with byte ranges and digests. They do not copy section text, because public notes quote TTH verses and TTH is restricted.
TTH stays at its pilot scope and is restricted, pending the Doldan agreement. No new normalized TTH artifacts are produced.
The Delitzsch text is included as the 1885 edition carried by the DHNT'85+ module in data/delitzsch/raw, whose info table states "Copyright Public Domain. Delitzsch, Franz, 1885". That self-declaration is the only license evidence in the repository, and docs/terms.md has no row for the Delitzsch text. Passage text is the parsed verse with the parser's prefix-segmentation slashes removed, which reproduces the module text for every verse. The per-word Strong's mapping and prefix segmentation come from the ph4.org mapping with unclear terms, so the corpus withholds both and the mapping is restricted.
Transliteration is a second annotation layer over OE and Delitzsch tokens. Contract v1 gives a token one provenance source and has no record kind for another layer, so translit is deferred.
Passage mappings come only from the verified reference-mappings registry. No identity mapping is inferred for any edition.

The committed snapshot holds the inventory, the corpus-only editions, the contract manifest (pinned inputs and artifact digests) and the coverage, unresolved-reference and validation reports. The normalized shards are generated into a temporary directory on demand. A regenerated tree must match the committed manifest byte for byte.

Each source update adds a new snapshot directory. Committed snapshots are never edited, which keeps the knowledge boundary check additive. A snapshot stays current while it generates the same bytes. A Davar source file may change without making the snapshot stale when every generated shard and report is unchanged. Shaul is pinned by revision and file hash.

## Alternatives

Committing the shards was rejected for size and because some upstream terms ask that data files not be reposted. Extending the pilot profile was rejected because it needs one selection per passage and one in-memory record document validated in quadratic time. Inferring identity mappings for OE and Delitzsch was rejected because the reference-system registry asserts only explicitly verified mappings.

## Evidence

docs/terms.md lines 61-79, README.md lines 117-160, web/ATTRIBUTIONS.md, docs/greek-besorah-source-licenses.md, contracts/biblical-knowledge/v1/README.md lines 100-106, and data/dict/raw/tcysite/source_manifest.json.

## How to undo

Delete data/knowledge/corpus/, scripts/knowledge/corpus/, tests/test_knowledge_corpus.py, tests/fixtures/knowledge/corpus/ and this file. No existing artifact depends on them.

## Status

Accepted on 2026-11-20 for snapshot v1.
