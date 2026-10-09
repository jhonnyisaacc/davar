# Davar v2 issue alignment

Reviewed open issues in jhonnyisaacc/davar, qahal, bore and shaul on 2026-09-30.
Issue state does not prove implementation state; repository code remains the
source of truth. Source revisions: Davar main c10a71a74, Qahal domain 07b11fa,
Qahal Rails scaffold f2c13a5, Bore 5e2593e. Shaul main 8c94b0fe9eca817e22340430309801d0ef76125b is read-only; its
untracked knowledge/private files are excluded.

| Issues | Owner/dependencies | v2 architectural provision | Delivery |
| --- | --- | --- | --- |
| Davar #187, #198, #188 | Evidence → pipeline → pilots | Existing biblical-knowledge reference system; edition/context boundaries; provider transport separated from chat orchestration; generation provenance, input hashes and explicit permissions | Prepared; translation generation/JEV/review queues are not implemented |
| Davar #200 | Permitted source normalization | Manifest-driven imports, source revisions, stable source IDs, deterministic hashes; missing sources remain explicit | Prepared |
| Davar #193, #191, #190, #192 | Romans → cross-book and pt-BR pilots → generalization | Locale-bearing articles; independently owned immutable Scripture; generated chat is not publishable translation; versionable contracts | Prepared; pilots remain separate |
| Davar #157 → #125 | Printed Hutter source → lexical identity/definitions | No transcription or lexical reassignment in Rails; source edition retained in context | Preserved |
| Davar #159 → #42 | Delitzsch adjudication → definition readiness | Existing lexical/static/offline behavior retained; mappings are not inferred from definition availability | Preserved |
| Davar #183 | TCY localization | Existing contextual duplicates and localization policies preserved; articles/chat do not overwrite lexical records | Prepared; no TCY localization generated |
| Davar #184 | Curated Greek-Hebrew relationships | Reuse existing knowledge relation model; word identity is not collapsed into a cross-language alias | Prepared |
| Davar #170 → #171 → #172; #173 | Publisher permission → licensed import → distribution; future NA29 | Edition-aware context and explicit source/distribution permissions; no automatic edition substitution | Prepared; licensed imports blocked on permission/data |
| Davar #248 | Upstream update review | No automatic release/data refresh during backend work | Preserved |
| Davar #196; Bore #1 | Domain integration; Aviv research and policy | Rails persistence/API over pinned Bore domain; unresolved year-start stays explicit; widget/CLI consumers can reuse endpoint | Integration implemented; Aviv blocked on documented rule |
| Qahal #3 | Admission, privacy, Local/Online discovery | Encrypted fields, provider-independent admission, atomic code capacity, approximate coordinates, consent, transactional membership, notification outbox | Adapted; remote migration and real-provider QA remain blocked |
| Shaul #26, #27 | Residual coverage and note quality | Public-only manifest import with attribution and separate AI permission; no speculative recovery or private transcript paths | Prepared; source remediation remains owned by Shaul |
| Davar #160 | iOS release | SecureStore, existing scheme callback, changed native runtime and build-required release documentation | Prepared; App Store publication excluded |

## Boundary decisions

- Rails owns accounts, authorization, memberships, admission, user settings,
  conversation persistence and metadata. Controllers delegate state transitions.
- Large Scripture assets and their Python generation pipelines stay separate.
- Bore source is pinned under api/lib/bore; PostgreSQL is canonical persistence.
  The bridge is server-side JSON I/O, not a client calendar implementation.
- Human-reviewed/imported evidence, generated candidates, reviewed decisions and
  published artifacts remain distinct. Chat memory is user-owned conversational
  continuity, never a lexical or Scripture authority.
- Live model output is not assumed byte-deterministic. Persist accepted results;
  hash inputs and pin model/prompt versions for replay and review.
- Future translation workers may reuse HTTP/provider transport, but must own
  their own orchestration, permissions, quotas, review gates and artifacts.
- Multi-token spans and contextual relationships stay in biblical-knowledge
  contracts. The simple current word handoff does not replace that richer model.
- Edition IDs and source references remain separate from reader/display IDs.
- No public profiles, followers, likes, social feed or notes subsystem is added.

## Future implementation checklist

For changes touching these boundaries, update this matrix, add a contract or
behavior regression, verify source licenses and publication state, and record
migration/consumer compatibility. Do not close an issue based solely on an
extension point existing.

## Development sandbox alignment

Local fixtures preserve the Qahal admission, consent and hidden-discovery
boundaries while exercising the provider-neutral email identity flow. Synthetic
articles explicitly retain attribution/permissions and do not claim Shaul coverage.
Deterministic Commentary transport is development-only and keeps provenance,
quota and lifecycle checks; it is not a translation workflow or evidence. Bore
fixture confirmation carries synthetic source provenance and does not resolve
Bore #1 Aviv policy. Native callback smoke testing covers the local simulator
portion of #160; live provider apps and publication remain outside this work.
