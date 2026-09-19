# Biblical knowledge contract 1.0.0

This is an optional data-only foundation. JSON Schema Draft 2020-12 is the authority.
There are no application imports, deployments, API endpoints, source rewrites, or
changes to existing static/offline bundles. Removing these additive directories
and the dedicated workflow rolls back the foundation without a data migration.

## Build and validate

From the Davar repository root, using Python 3.12 with the existing `jsonschema`
and PyYAML dependencies (pytest for tests):

```sh
python -m scripts.knowledge validate
python -m scripts.knowledge check
python -m pytest -q tests/test_knowledge_*.py
python -m scripts.knowledge build --output /absolute/temporary/directory/pilot
```

`build` requires a new or empty canonical output directory. Inside the repository,
only `data/knowledge/generated/pilot-v1` is writable. Outside it, only temporary
directories outside other Git checkouts are accepted. No recursive cleanup occurs.
Use `check` for ordinary validation: it regenerates in a disposable directory and
compares all files with the committed pilot. For an intentional source/schema
update, generate separately, review the exact diff and replace the pilot artifacts
as an explicit editorial operation. Never run legacy generation to build knowledge.

An optional `--shaul-root /absolute/path/to/shaul` uses the six allowlisted public
files directly after verifying their pinned byte digests. The default uses the
committed fixtures. No network requests occur. A source mismatch is an error,
not an instruction to fetch or silently refresh inputs.

The dedicated CI also runs the legacy generator in disposable archives and the
existing public Shaul tests at its pinned revision. The regular foundation build
does not require Bun, Rails, a Shaul checkout, or application dependencies.

## Ownership and source selection

`data/knowledge/pilot-inputs.json` records repository, revision, relative source
path, digest and optional fixture path. Davar source text/annotations remain owned
by their existing datasets. Shaul owns its notes, concepts, expressions, mentions
and relations. Imported records retain their owner, upstream identifiers and source
metadata. Davar authors only the exact pilot span/integration mappings.

The Greek input is the committed revision-pinned preview, NOT the ignored importer
directory. Its cleaned text and consecutive positions are used verbatim, alongside
the upstream TAGNT index/ref. Preserve the original notices documented in
`docs/greek-besorah-source-licenses.md` and the Greek preview release. This contract
does not broaden publication rights or bypass the existing Greek release gates.
OE, Delitzsch and original TTH retain their existing source attribution/permissions.

The Shaul note fixture is a public source document, not a generated note. Projection
output includes one relevant section and frontmatter. Private transcripts, including
their paths and excerpts, are never inputs. The Claim example exists only in tests;
it is an attributed, unreviewed paraphrase, not a published definition.

## Identity and references

- `davar-v1` identifies existing Davar book/chapter/verse coordinates. A reference
  carries its system ID. Supported selections are a verse, chapter, or inclusive
  same-book range (which may cross chapters). Display aliases are not identities.
- Native passage labels survive independently. Only registry-listed mappings are
  asserted. Shaul tags with an unknown alias or unverified numbering system remain
  diagnostic records, even when the syntax is recognized. A transliterated alias
  does not establish Hebrew numbering. Chapter/range syntax is supported by the
  contract; the adapter does not invent canonical mappings for unverified tags.
- A passage snapshot hashes exact text, ordered token surfaces, edition, native
  locator, book, and tokenization policy using the deterministic JSON encoding below.
  The ID includes that full SHA-256 digest. Text, pointing, punctuation, spelling or
  segmentation changes create a new snapshot. Strong, morphology, transliteration
  or git-revision-only changes do not. Source file digests separately track annotations.
- Tokens identify the passage snapshot and consecutive one-based ordinal. Upstream
  `source_index` and `source_token_ref` remain separate; John 1:51 proves index gaps.
- Spans use inclusive one-based endpoints in one passage. Their IDs derive from the
  passage ID and endpoints. Cross-passage/discontinuous expressions are not v1 spans.
- Strong and extended TAGNT codes are external lexical references. Prefix markers
  have their own namespace. No Davar lexeme or normalized sense/definition is minted.
- Authored relation IDs are stable editorial keys. Evidence IDs are qualified by
  source/passages as appropriate; source provenance identifies the observed revision.

The canonical encoder is UTF-8 JSON with unescaped Unicode, lexicographically sorted
object keys, two-space indentation, LF newlines, a final LF, and no nonfinite numbers.
Identity payloads contain strings, arrays, objects and integers only. Record collections
sort by ID; token order is determined by `ordinal`, not collection sorting. Another
language must reproduce this encoding to mint identical IDs; importers should preserve
the supplied IDs. No Unicode normalization or whitespace rewriting occurs.

## Records, evidence and lifecycle

See the individual `*.schema.json` files; `common.schema.json` holds typed targets,
locators, localized text, external lexical references and provenance. `$id` URLs are
identifiers, not network dependencies. All `$ref` resolution is offline.

Structural associations use fields, not graph edges. Semantic relations are limited
to expresses-concept, contextual relation and allusion; contextual relations require
a scope. Upstream `confirmed` remains upstream status and never becomes new approval.
An expression is not automatically a lexeme. A source footnote is evidence, not proof
of cross-language synonymy. Original source payloads are preserved in explicitly
source-specific fields without reclassifying theological text as lexical meaning.

Provenance separates origin, transformation, review, publication and visibility.
All initial normalized editorial assertions are unreviewed/draft. Public visibility
means eligible for this local public-source projection, not deployed or approved.
Media locators use integer milliseconds with an explicit precision label; no media
or transcript extraction is implemented. Language tags are strings independent of
the existing application language union, so pt-BR, fa and ar need no identity change.

## Bundles, versioning and Rails

The only initial queries are Daniel 7:13, John 1:1 and John 1:51. Each bundle contains
selected records plus explicit edition coverage and unresolved-reference diagnostics.
Daniel's absent TTH is never silently filled with another translation. Bundles and
normalized records are projections, not editorial authorities.

`manifest.json` maps logical artifact paths to hashes and pins the complete input
manifest digest (including registries, authored mappings and schemas). The manifest
does not hash itself. Execution time and host paths are excluded. The generator has
its own version, separate from contract version and source snapshot identity.

Schema releases are immutable once published. Strict validation rejects unknown
fields: even additive fields require a coordinated new schema release, and semantic
or incompatible changes require a major contract version. TypeScript types may be
generated one-way later; they must never become the authority.

Rails can import editions, passages, tokens, spans, evidence and semantic records
using these external IDs; internal primary keys may differ. References are value
objects and source-specific locators fit JSONB. Rails must not treat bundle copies,
coverage summaries or physical file paths as database authority. Git-owned records
remain Git-owned until a separate editorial ownership migration. Static files and
a future API can serve the same bundle schema.

## Compatibility acceptance

Existing source datasets, runtime/build files, dictionary precedence, TTH/TS2009
selection and offline formats are untouched. The additive boundary check rejects
modifications outside the approved new paths. Legacy generation comparison permits
only the existing manifest's clock-derived `version` and `generated_at` differences;
all other bytes and file presence must match. Running the new generator itself has
no timestamp exception: existing artifacts must stay byte-identical.

TS2009 export compatibility uses synthetic text and removes remote credentials.
No licensed TS2009 data is fetched. Shaul compatibility hashes public source and
artifact trees before/after adapter execution and runs its existing reference and
knowledge tests. AI, dictionary population, translations, LXX ingestion, application
integration, Rails and database migrations are outside this foundation.
