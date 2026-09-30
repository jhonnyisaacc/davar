# Davar v2 constraints

Living report, 2026-09-30. Statuses distinguish real blockers from unfinished work.

| Area | Status | Evidence / impact / next action |
| --- | --- | --- |
| Rails/PostgreSQL runtime | Resolved | Installed Ruby 3.4.9/Rails 8.1; isolated PostgreSQL 17 on port 55432 used for tests. No production database touched. |
| Rails JSON compatibility | Resolved | JSON 3.0.2 broke Rails 8.1 default decoding/schema dumps; pinned JSON <3 and regenerated schema. |
| Sign-in provider configuration | Blocked | No v2 provider app configuration is supplied. Adapters and callback flows exist; register HTTPS callback URIs and provide client IDs/secrets for live tests. |
| Email delivery | Blocked for production | Magic links and single-use redemption tested through ActionMailer test delivery. Production SMTP/from domain must be configured. |
| AI provider connection | Mitigated | API-key adapters for Claude/OpenAI/Grok/Gemini; encrypted server storage. Personal consumer subscription OAuth is not assumed to grant API access. |
| Muse | Blocked | Design names Muse but repository supplies no supported API/auth contract. No fabricated adapter or OAuth flow. |
| Sponsored consultation | Blocked for live generation | FREE_AI_KEY and pinned FREE_AI_MODEL required. Persistence, quota, failure refund and idempotency proceed independently. |
| Shaul content ingestion | Blocked on permitted manifest | Public site/source exists, but no approved per-record display/AI manifest is supplied. Import tooling requires separate permissions; no private data/content fabricated. |
| Qahal production migration | Blocked | Existing D1 private_data uses versioned AES-GCM envelopes. Requires authorized decrypted export, source encryption keys and reconciliation. Dry-run tooling implemented; no remote data moved. |
| Qahal unresolved rules | Accepted boundary | No leadership transfer, existing-women-leader adjudication, minimum-age rule or Starting→Experienced product flow invented. Operator verification preserves explicit constraints. |
| Bore Aviv/festival policy | Blocked in owning issue | Bore #1 requires research and a documented rule. Confirmed observations do not infer Aviv. |
| Calendar observations | Blocked on operational ingestion | Import path exists; no live observation store is automatically copied or invented. Empty store honestly reports pending. |
| Calendar runtime boundary | Accepted | Pinned Bore Python domain avoids divergent calendar rules. Deployment requires Python 3.13 and PyYAML; future Ruby port requires parity tests. |
| Temporary connectivity | Accepted | Account-scoped in-memory cache with 24-hour stale bound. Existing Scripture SQLite behavior preserved; no new full offline sync. |
| Notification delivery | Mitigated | Durable outbox and Telegram dispatch task; requires bot configuration and scheduler. At-least-once delivery may duplicate after a crash. |
| Web baseline typing | Confirmed existing issue | bunx tsc --noEmit reports identical existing errors in primary checkout: process.exit, Bun fetch mocks, nullable instances, narrowed test expectations. New v2 files introduce no observed type errors. |
| Web static fixtures | Resolved locally | Fresh worktree lacks generated public/data. Existing local assets initially had a stale TCY fixture; bun ./build.ts regenerated ignored static data, then all 69 web tests passed. Assets are not committed. |
| Native release | Deferred by scope | SecureStore changes native runtime to 1.0.2. Requires future eas build/eas submit; no PR publication. |
| Licensed NA28/NA29 | Blocked in owning issues | Publisher permission/dataset prerequisites remain external; no content imported. |
| Pen/native device fidelity | Partially validated | Actual design/davar.pen inspected through Pen MCP: variables, chat/assembly/calendar frames, LiquidGlass and Desktop navigation. Exported Commentary visually compared through MCP. Native safe areas, keyboard, dark/RTL and live auth still require device QA. |

Each blocked integration has executable independent architecture around it.
No unavailable credential is stored as a placeholder secret or silently bypassed.
