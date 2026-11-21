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

## Reusable build profiles

The default profile is `data/knowledge/profiles/pilot-v1.json`. The three pilots
are data selections, not branches in the adapters. A profile references a pinned
input manifest, verified reference mappings, optional authored span/relation files,
scripture selections, lexical entry selections, public Shaul records and coverage.
The manifest's historical `pilots` key now accepts any nonempty unique list of
verse queries; it is not restricted to three. Profile and manifest paths are
repository-relative, resolved against `--root`, never against the profile's folder.

For a working, independent example using existing OE Genesis 1:1:

```sh
python -m scripts.knowledge build --profile tests/fixtures/knowledge/genesis/profile.json --output /absolute/temporary/directory/genesis
python -m scripts.knowledge check --profile tests/fixtures/knowledge/genesis/profile.json --output /absolute/temporary/directory/genesis
python -m scripts.knowledge validate --output /absolute/temporary/directory/genesis
```

`check --output` reads the expected artifact tree; it does not overwrite it.
`--profile` applies to `build` and `check`; `validate` validates artifacts alone.
All previous defaults and output-write restrictions remain unchanged. Profiles
cannot specify output paths, commands, modules, network access or permissions.

To extend a profile without changing generator code:

1. Add input files to its manifest with unique IDs, repository, source revision and
   verified SHA-256 digests. Shaul inputs additionally need committed public fixtures
   for offline builds. No directory scanning, automatic download or source refresh
   occurs. Optional input `kind` explicitly classifies an otherwise unselected source;
   this metadata is also retained in the artifact manifest.
2. Add scripture selections with `input_id`, fixed adapter (`oe`, `delitzsch`,
   `greek`, `tth`), registered edition/book IDs and native chapter/verse labels.
   Multiple inputs may use the same adapter. Add only verified reference mappings.
3. For lexical evidence, select `input_id`, stable evidence `id_namespace` and exact
   source `codes`. The adapter copies entry identifiers/lemmas, never definitions
   or new lexical identities. Missing requested entries are errors.
4. For public Shaul data, select `entity`, `mention`, `note` or `relation`. Entities
   and relation endpoints use upstream IDs. Notes require an exact, unique level-two
   heading, stable evidence/upstream IDs and explicit targets. Mention targets and
   relation evidence links are also explicit. These selections are Davar-authored,
   unreviewed integration assertions, not additional approval by Shaul. The profile
   is included in the input digest; original Shaul payloads/provenance remain intact.
5. Add bundle queries to the manifest and one coverage declaration per query and
   registered edition. `present` must resolve to a normalized passage; `absent`
   requires a verified absence reason; `not_requested` makes no coverage claim.
   Missing files, records, ambiguous sections and broken dependencies fail closed.

Profile, registry, mapping and schema content participates in the deterministic
input digest. The domain record schemas and identity rules are unchanged. Relations
enter a bundle only through relevant targets/scopes/evidence, with public endpoints
and complete evidence dependencies. No cross-language semantic alignment is inferred.

## Downstream handoff and remaining connectors

| Capability | Available now | Remaining owner |
| --- | --- | --- |
| OE / Delitzsch / committed Greek / TTH | Selected, pinned passages; original tokens or un-tokenized TTH | Corpus expansion: #200 |
| Lexical references | Selected entry locators and lemmas; Strong/BDB unchanged | Coverage: #200; adjudication/definitions: existing #159/#42/#125 work |
| Public Shaul | Selected concepts, expressions, mentions, notes and expresses relations | Broader public records/adapters: #200 |
| Evidence alignment | Exact selections and authored spans, no inferred alignment | Categories, many-to-many evidence units and Romans evidence: #198 |
| Workflow execution | None | Pipeline: #188; architecture: #187 |
| Translation/review pilots | None | Romans #193, Peter #191, John pt-BR #190, generalization #192 |
| Definition localization / contextual relationships | No new population or adjudication | #183 / #184 |

TS2009 is exercised only by compatibility checks (synthetic export data); this
foundation does not ingest or distribute licensed TS2009 text. LXX, Hutter, DSS and
teaching/transcript connectors are not implemented. NA28/NA29 remain subject to the
permission/data work in #170–#173. Ignored Greek downloads are not inputs. Private
transcripts and local-only Shaul records are excluded. Public availability alone
does not grant redistribution permission or bypass an edition's release gates.

Corpus-wide normalization is tracked separately in
https://github.com/jhonnyisaacc/davar/issues/200. It is not a merge prerequisite
for this foundation and does not block #198's bounded Romans fixture. UI, calendar,
performance and store-release issues are independent. No downstream issue is closed
by these fixtures. Future consumers preserve external IDs; they must not depend on
pilot paths, assume full coverage, or treat generated bundles as authored authority.

## Ownership and source selection

`data/knowledge/pilot-inputs.json` records repository, revision, relative source
path, digest and optional fixture path. Davar source text/annotations remain owned
by their existing datasets. Shaul owns its notes, concepts, expressions, mentions
and relations. Imported records retain their owner, upstream identifiers and source
metadata. Davar authors only the exact pilot span/integration mappings.

The portable concept/expression contract permits `owner: davar` or `owner: shaul`.
IDs must agree with their owner and kind, and the provenance source must have the
same owner. Shaul records still require `upstream_id` and `source_record`; a native
Davar record need not invent upstream metadata. This pilot creates no Davar-owned
concepts or expressions and does not transfer ownership of any Shaul record.

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
- Every source passage declares its actual `language` (`he`, `arc`, `grc`, `es`,
  etc.). Edition language is descriptive, never an implicit passage default: OE
  remains the same `oe` edition and uses `mul` for its Hebrew/Aramaic corpus.
  Daniel 7:13 explicitly declares `arc`. The OE adapter maps the source's H/A
  language markers to tags during ingestion; consumers do not interpret morphology.
  A homogeneous passage's tokens inherit its language without duplicating it.
  OE Daniel 2:4 is a real mixed-language verse: the contract permits passage `mul`
  with a concrete language on every token. Token overrides are optional otherwise.
  Language annotations are excluded from text snapshot identity, preserving all
  existing passage, token and span IDs when only language metadata is corrected.
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

The passage-language and concept-ownership amendments finalize this still-unmerged
initial v1 contract. They are not a migration of an already released contract.

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

`manifest.artifacts` optionally carries independently versioned text/definition publication metadata. `artifact.schema.json` uses existing edition IDs and review/publication vocabulary. A published artifact requires approved review and explicit public distribution permission; AI processing permission is independent. Existing manifests without artifacts remain valid. Fixtures contain metadata only and grant no source license.

## Corpus snapshots (#200)

The corpus normalizes every included source record, not pilot selections. Snapshot
`data/knowledge/corpus/v1/` is the committed state:

| File | Kind | Content |
| --- | --- | --- |
| `inventory.json` | authored | Every source family with a disposition (`included`, `unavailable`, `restricted`, `deferred`), a reason and evidence paths. Included families name an adapter, a root and file patterns. Other families, `not_sources` and `ignore` rows name glob patterns (`*` within a directory, `**` across directories) for Davar or Shaul. |
| `editions.json` | authored | Corpus-only editions (`bes-es`). Registry editions stay in `registries/editions.json`. |
| `manifest.json` | generated | The contract manifest. `inputs` pins every source file by path, revision and SHA-256; `files` holds the digest of every generated shard and report. |
| `reports/coverage.json` | generated | Per family: inputs, source records, normalized and unresolved counts. Per edition and book: chapters expected, present and missing, mapped and unmapped passages, and passage languages. |
| `reports/unresolved.json` | generated | Source records with no v1 record and their reason, unresolved references inside normalized records, and unmapped passages per book. |
| `reports/validation.json` | generated | The checks that passed, shard and record counts, and the input digest. |

The normalized records themselves (about 1,500 shards, one per pinned source file plus
one Shaul shard) are generated, not committed. Each shard is a complete `records`
document that passes `Validator.records(public=True)` and locator resolution on its
own. The committed manifest makes the generated bytes verifiable without committing them.

```sh
python -m scripts.knowledge.corpus check newest --shaul-root /absolute/shaul-at-pinned-revision
python -m scripts.knowledge.corpus build v1 --shaul-root /absolute/shaul --output /absolute/temporary/directory/corpus-v1
python -m scripts.knowledge.corpus compare v1 v2
```

`check` walks every file under `data/` and the Shaul checkout, fails on a file with no
disposition or with more than one, fails on an added or removed pinned file, regenerates
in memory and compares the manifest and reports byte for byte. `build` writes the full
tree to a new temporary directory and fails unless it matches the committed snapshot.
`newest` names the highest-numbered snapshot.

A corpus manifest's `input_manifest_digest` covers the normalizer version, the
inventory, the corpus-only editions, the input pins, and the parsed content of every
file in `registries/` and every record schema. The corpus has no authored mappings
outside the registries.

Staleness follows what the corpus reads, not whole-file bytes:

- A Davar source file may change at HEAD while its pin keeps the SHA-256 of the pinned
  revision. The snapshot stays current while every regenerated shard and report is
  unchanged. A lexicon definition edit leaves it current; a lemma edit makes it stale.
- A change to the content of any file in `registries/` or any record schema changes the
  input digest and makes the snapshot stale, even when no shard changes. A generator
  change that alters a shard or report makes it stale because the digests in
  `manifest.files` change.
- Shaul is pinned by revision and file hash. The checkout must be a clean clone at the
  pinned revision, and any byte change fails.
- `tests/test_knowledge_corpus.py` checks the newest snapshot without a Shaul checkout.
  It regenerates the Davar shards, recomputes the input digest and the Davar-derived
  parts of the three reports, and schema-validates one shard per family. It fails when a
  Davar shard, the input digest, or a Davar part of a report differs, so a registry or
  schema change fails it. The Davar parts are every report field except the counts of
  Shaul families, Shaul unresolved records and references, and the shard and record
  totals of `validation.json`. Davar shard digests already fix the Davar share of those
  totals. A generator change that alters only the Shaul shard needs `check` with
  `--shaul-root`.

Rules the generator enforces:

- One adapter per included family reads every record its pattern addresses. Each record
  ends as normalized or unresolved with a closed reason. Malformed input raises.
  Each input's records are also counted from its native structure (every verse object,
  every lexicon key, one per Shaul file) and must equal the records read. Validation
  re-derives the normalized records from provenance and compares them with the
  accounting.
- A native reference (edition, book, chapter, verse label) appears once per edition.
  A Delitzsch verse needs words, and its words must spell the verse text.
- Passage mappings come only from `registries/reference-mappings.json`. No identity
  mapping is inferred, so most passages stay `unresolved` and are counted per book.
- Delitzsch passage text drops the parser's prefix-segmentation slashes. The result
  equals the DHNT'85+ module verse text after its `<S>` Strong's tags are removed, each maqaf-space pair (`־ `) is closed to the maqaf alone, and leading and trailing whitespace is trimmed. Tokens keep surfaces only. Strong's codes,
  prefixes and segmentation are withheld, and validation rejects a slash in any
  Delitzsch passage or token.
  Lexicons keep entry identifiers and lemmas only. Shaul notes keep frontmatter,
  references and section digests, not section text. Notes with local host paths,
  Shaul entities other than concepts and words, relations without a v1 predicate or
  scope, and dangling targets are reported, never guessed.
- TTH, TS2009, DSS, TCY definitions and Shaul `private/` are never read.

Source update and snapshot comparison:

1. Create `data/knowledge/corpus/vN+1/` with `inventory.json` and `editions.json` copied
   from the previous snapshot. Set `"snapshot"` to the new name and update dispositions,
   revisions or patterns. Every file under `data/` and in the Shaul checkout needs
   exactly one family, `not_sources` or `ignore` row.
2. Commit the source changes, so the pinned revision names the bytes.
3. Run `python -m scripts.knowledge.corpus snapshot vN+1 --shaul-root <clean checkout>`.
   It refuses uncommitted source changes and never rewrites an existing snapshot.
4. Run `python -m scripts.knowledge.corpus compare vN vN+1` and review each changed
   input, artifact and family count in the pull request.
5. Run `check newest` and the knowledge tests. Earlier snapshots stay as history; only
   the newest snapshot is expected to match the current sources.

When a change makes the newest snapshot stale, the same pull request adds the next
snapshot. A change that leaves every shard and report unchanged needs no snapshot.
