# 0001 — Keep Hono encryption and version the envelope

## Context

The Hono server seals PII and tokens with AES-256-GCM. The AES key is `SHA-256(DAVAR_ENCRYPTION_PRIMARY_KEY)`. The envelope was `v1.` plus base64url of a random 12-byte IV, ciphertext, and tag. Rails ActiveRecord Encryption uses a different derivation (PBKDF2) and a JSON envelope. Those stored bytes do not open on this server.

`DAVAR_ENCRYPTION_PREVIOUS_KEYS` already listed older primaries, and reads tried each secret, but the envelope did not say which key had sealed it.

Jhonny decided on 2026-10-07: no Rails-written data needs to be preserved. There is no live hosted data. Local dev data can be reset. Keep Hono encryption. Byte-compatible means the HTTP API only. Add key versioning so keys can be rotated. Deleting Rails is a separate change.

## Decision

Keep the Hono scheme. Do not make ciphertext byte-compatible with Rails ActiveRecord Encryption.

Byte-compatible means the HTTP API only: the same `/api/v1` methods, paths, and JSON shapes. It does not mean stored bytes.

New envelopes are `v1.<keyId>.<payload>`. `keyId` is the first 8 lowercase hex characters of `SHA-256(secret)`. `payload` is unchanged: base64url of the 12-byte IV, then the AES-GCM ciphertext and tag. New writes stamp the current primary key.

A later primary can be introduced by putting the old secret on `DAVAR_ENCRYPTION_PREVIOUS_KEYS`. A versioned envelope opens only with the secret whose key id matches, whether that secret is the primary or an entry on the previous-key list.

Envelopes that already omit the key id (`v1.<payload>`) still decrypt with the current primary key. After that primary moves onto the previous-key list, those envelopes open from that list.

Rails deletion is not this change.

## Alternatives

- Emit ActiveRecord JSON ciphertext so stored bytes match Rails. Rejected. No Rails-written rows need to be read, and the schemes differ in key derivation, deterministic identity lookup, and envelope layout.
- Leave envelopes unversioned and keep trying every secret. Rejected. A later key cannot be told from an earlier one except by attempting decryption.
- Store an integer key version in the environment (`1:secret`). Rejected. That changes how `DAVAR_ENCRYPTION_PREVIOUS_KEYS` is parsed. The key id is derived from the secret, so the comma-separated list stays a list of secrets.

## Evidence

- `server/src/lib/codec.ts` writes `v1.<keyId>.<payload>` and still opens `v1.<payload>`.
- `server/tests/encryption.pin.test.ts` decrypts a fixed legacy `v1.` envelope with the primary key that sealed it, and with that key on the previous-key list.
- `server/tests/encryption.test.ts` opens an envelope sealed under an older secret after a later primary is placed first in the ring.
- `server/README.md` states that byte-compatible means the HTTP API only.

## How to undo

Revert the commit that introduced key ids. Rows written as `v1.<keyId>.<payload>` would then fail to open until they are rewritten or the reader is restored. Legacy `v1.<payload>` rows are unchanged by this decision.

## Status

Accepted on 2026-10-07. Rails deletion stays a separate pull request.
