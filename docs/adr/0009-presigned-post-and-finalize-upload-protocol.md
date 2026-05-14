# 0009. Browser uploads via presigned POST + server-side finalize

Date: 2026-05-13
Status: Accepted

## Context

Given that storage lives in `module/shared/storage` (ADR-0008), the browser still needs a way to move bytes into S3. Three credible paths exist, with very different security and cost profiles. The choice has to police two things — size and content-type at the bucket boundary, real MIME and dimensions on the server — without ever streaming raw uploads through the API.

## Decision Drivers

- **Server doesn't move bytes.** Proxying multi-megabyte image uploads through Node is the wrong shape: API memory pressure, full bandwidth cost, no upload progress, weaker resilience to slow clients.
- **S3 enforces what S3 can enforce; the API enforces what it can't.** A presigned upload that does not bound size or content-type at S3 trusts the client too much. A presigned upload that does bound them still cannot inspect the bytes — magic-byte sniffing, dimension checks, MIME-from-bytes must happen server-side.
- **No long-lived state pollution.** Uploads that start but never commit must not accumulate in the public space, must not require a custodial worker we do not have today, and must not require human cleanup.
- **Defense in depth on the public/private split.** Even if one control (bucket policy, prefix scheme, key unguessability) fails, the others should still keep half-uploaded objects out of public reach.

## Options Considered

### Option α: Proxy through the API

Browser POSTs to the API; API streams bytes to S3.

- Pro: One round-trip, simpler client
- Pro: Easiest place to inspect bytes inline
- Con: All upload bandwidth flows through the API. At 2 MB × N users this is wasteful; at higher caps or with global users it becomes a serious cost item
- Con: API holds large request bodies in memory or temp files — surface for DoS and slow-client attacks
- Con: No upload progress events from `fetch` without extra plumbing
- Con: Long-running request semantics — the API is now in the slow-upload business, including timeouts, retries, and disconnects

### Option β: Presigned PUT URL

API issues a short-lived `PUT` URL; browser uploads directly to S3.

- Pro: Bytes never touch the API
- Pro: Simple to issue
- Con: `Content-Length` cap can only be hinted via headers — clients can lie via chunked transfer encoding. S3 will not enforce it the way a POST policy does
- Con: `Content-Type` is whatever the client sends; PUT has no `starts-with` constraint at the S3 boundary

### Option γ: Presigned POST with policy + post-upload finalize *(chosen)*

API issues a presigned POST whose policy declares `content-length-range` and `Content-Type` `starts-with image/`. S3 itself rejects oversized or wrong-type uploads at the boundary. After upload, the client calls a separate `finalize` endpoint; the API does a HEAD + small range GET, runs magic-byte MIME sniffing and dimension extraction, then copies the validated object from `avatars/pending/{userId}/{uploadId}` to `avatars/{userId}/{uploadId}.{ext}` and commits `user.avatar`.

- Pro: Strongest S3-side enforcement. Size and content-type are policed by S3, not by trust
- Pro: Bytes never touch the API; finalize-time validation reads a 4 KB range, not the whole object
- Pro: The two-phase model gives clean semantics for orphan cleanup — anything left in `avatars/pending/` after a TTL is by definition not committed and can be expired by a bucket lifecycle rule
- Pro: Defense in depth — even if a malicious client uploaded a renamed `.exe` with `Content-Type: image/jpeg`, magic-byte sniffing at finalize rejects it before any public URL exists
- Con: Two client round-trips (intent + finalize), plus the S3 POST. The client complexity is one extra `fetch`

## Decision

**Option γ.** The full flow is:

1. **Intent.** Client calls `POST /api/user/me/avatar/upload-intent` with intended `contentType` and `contentLength`. Server validates against allow-lists, mints `uploadId = randomUUID()`, builds key `avatars/pending/{userId}/{uploadId}`, and returns a presigned POST with `content-length-range` and `Content-Type` `starts-with image/` conditions, plus the per-domain limits the client should pre-check.
2. **Upload.** Browser POSTs the file directly to S3 using the returned URL + fields. If size or type violates the policy, S3 rejects at the boundary.
3. **Finalize.** Client calls `POST /api/user/me/avatar/finalize` with the upload key. Server asserts the key prefix belongs to the caller, HEADs the object, fetches bytes `0-4095`, runs magic-byte sniffing (`@module/shared/image`), validates dimensions, copies pending → `avatars/{userId}/{uploadId}.{ext}`, deletes the pending object, best-effort deletes the prior avatar, and commits the public URL on `user.avatar`.

The bucket access model that backs this protocol:

- **Two-prefix layout.** `avatars/pending/*` is the staging area; `avatars/*` (excluding `pending/`) holds committed objects.
- **Lifecycle rule.** Anything under `avatars/pending/` older than 1 day is deleted by an S3 Lifecycle rule. No custodial worker, no cron job, no per-app code.
- **Bucket policy.** Public read is allowed on `avatars/*` and explicitly denied on `avatars/pending/*`. This is belt-and-suspenders — the load-bearing controls are server-generated unguessable keys (`uploadId = UUID`) and the fact that the API never publishes a URL pointing at `pending/`.
- **Per-user prefix.** Keys embed `userId`, and the finalize endpoint refuses to operate on keys whose prefix is not `avatars/pending/{caller-userId}/`. Even with a stolen presigned URL, the attacker cannot finalize into another user's avatar slot.

## Consequences

### Positive

- S3 polices the cheap things (size, content-type prefix) at the boundary, before any byte hits our infrastructure. The API polices the things S3 cannot (real MIME, dimensions) on the validated object before any URL is published.
- Orphaned uploads have a free cleanup path: the lifecycle rule under `avatars/pending/` evicts anything older than 1 day with no application code.
- The `module/shared/image` magic-byte sniffer is the same code path that future club/book cover uploads will use — image-format detection is decoupled from storage transport.
- The presigned POST TTL is 5 minutes by default. If we ever see legitimate slow uploads (mobile, large files) start failing past that window, the TTL bumps via env without code change.

### Negative / Trade-offs

- Two client round-trips per upload (intent + finalize), plus the S3 POST itself. The frontend complexity is one extra `fetch` after the upload completes — a small price for the security and cost wins.
- `file-type` (the canonical npm MIME sniffer) became ESM-only at v17 and is incompatible with the API's CommonJS test config. We inlined a small magic-byte sniffer covering JPEG, PNG, WEBP — sufficient for avatars and now living in `module/shared/image`. If a future use case needs broader format support (TIFF, HEIC, AVIF), reconsider: either extend our table or fold in a CJS fork like `magic-bytes.js`.

### Neutral / Watch

- The `avatars/pending/` and `avatars/` two-prefix scheme is the unit of orphan cleanup. If we later support staging or moderation queues, this layout may need a third prefix (`avatars/quarantine/` etc.). The lifecycle rule can be extended without code changes.
- The bucket policy `Deny` for `avatars/pending/*` is enforced by real AWS S3 but not by LocalStack community (see ADR-0010). The design does not rely on the policy alone — unguessable keys + lifecycle expiry remain the load-bearing controls.
- `S3_PUBLIC_URL_BASE` is currently optional; the URL builder falls back to standard S3 or endpoint+bucket URLs. Once a CDN is in front of production, that var becomes required in production environments — worth a Zod refinement or a deploy-time check at that point.

## Related

- ADR-0005: Application-side UUID generation — used to mint `uploadId` values server-side, so the client never picks a storage key.
- ADR-0008: Object storage lives in a generic `module/shared/storage` — the module that issues the presigned POST and runs finalize-time S3 operations.
- ADR-0010: LocalStack as the local S3 emulator — exercises the same presigned POST code path locally.
