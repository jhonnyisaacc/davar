# Davar refactor run (2026-10-07)

## PRs

- https://github.com/jhonnyisaacc/davar/pull/258 — verification skill, feature map, and per-app control CLIs. Draft. Base `feat/davar-v2`. `./scripts/check` fails on the existing Web typecheck in `NavigationBar.test.tsx`. Mobile drive is unimplemented (`maestro-unimplemented`).

# Davar refactor — 2026-10-07

## Encryption envelope key version

- PR: https://github.com/jhonnyisaacc/davar/pull/256 (draft)
- Branch: `cursor/hono-envelope-key-version-60f7`
- Base: `feat/davar-v2`
- Status: draft, not merged
- Decision: `docs/decisions/0001-keep-hono-encryption-key-version.md` (accepted 2026-10-07)
- Outcome: Hono AES-GCM stays. Byte-compatible means the HTTP API only, not stored bytes. New envelopes are `v1.<keyId>.<payload>`, where `keyId` is the first 8 lowercase hex characters of `SHA-256(secret)` and `payload` is base64url of a 12-byte IV, ciphertext, and tag. Legacy `v1.<payload>` still opens with the current primary key. Older envelopes open through `DAVAR_ENCRYPTION_PREVIOUS_KEYS`.
- Pin: `server/tests/encryption.pin.test.ts`
- Ratchet: no baseline changes
- Rails deletion: not this PR
- Tier A: none open from this change
