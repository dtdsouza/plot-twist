# 0008. Object storage via a generic module/shared/storage with presigned POST + finalize

Date: 2026-05-13
Status: Accepted

## Context

The first concrete need for object storage was user avatar upload, but the same plumbing will be reused for club covers, book covers, and any future user-supplied media. We had three open questions at the same time:

1. **Where does S3 logic live in the API?** The `MODULAR-PRINCIPLES.md` rule is firm — bounded contexts own business rules; cross-cutting concerns live under `module/shared/*` (ADR-0006). Storage is plainly cross-cutting, but "what counts as business rule vs. infrastructure" needed an explicit call for object storage in particular (key shape, validation thresholds, lifecycle).

2. **How does the browser get bytes to S3?** Three credible paths: proxy through the API, presigned PUT, presigned POST with policy. Each has different security and cost profiles.

3. **How do we develop and test locally without an AWS account?** The integration test must exercise the real S3 contract — mocks of the AWS SDK do not prove that presigned POST policy fields are formatted correctly enough for S3 to accept the upload.

This ADR captures the three answers as one decision because they are interdependent.

## Decision Drivers

- **Boundary integrity (ADR-0006).** Storage primitives must be domain-agnostic — `module/shared/storage` cannot know anything about avatars, users, books, or clubs. Avatar-specific rules (key shape, validation, lifecycle commit) belong to `module/identity`.
- **Server doesn't move bytes.** Proxying multi-megabyte image uploads through Node is the wrong shape: API memory pressure, full bandwidth cost, no upload progress, weaker resilience to slow clients.
- **S3 enforces what S3 can enforce; the API enforces what it can't.** A presigned upload that doesn't bound size or content-type at S3 trusts the client too much. A presigned upload that does bound them still cannot inspect the bytes — magic-byte sniffing, dimension checks, MIME-from-bytes must happen server-side.
- **No long-lived state pollution.** Uploads that start but never commit must not accumulate in the public space, must not require a custodial worker we don't have today, and must not require human cleanup.
- **Local dev should exercise the production code path.** A filesystem fallback adapter diverges from real S3 behavior (no presigned URLs, different error modes, no policy semantics). Tests written against a fallback would not catch policy mis-formatting that real S3 rejects.
- **Replaceability (ADR-0006 / `MODULAR-PRINCIPLES.md` §6).** The storage backend should be swappable behind a DI token without touching consumers.

## Options Considered

### Where does S3 logic live?

#### Option A: A single `AvatarStorageService` inside `module/identity`

Put the AWS SDK and avatar-specific orchestration in one identity-owned service.

- Pro: Fewer files, fewer boundaries to cross
- Con: Couples a bounded context to AWS SDK directly. Reuse for club covers (`module/clubs`) and book covers (`module/reading`) would mean duplicating the SDK wiring in every domain
- Con: `shared → domain` is forbidden by dep-cruiser, but `domain → AWS SDK` is not constrained at all — the rule offers no protection against AWS bleeding into every domain

#### Option B: A generic `module/shared/storage` with avatar rules in `module/identity` *(chosen)*

`module/shared/storage` exposes bucket+key-generic operations (`createPresignedPost`, `headObject`, `getObjectRange`, `copyObject`, `deleteObject`, `buildPublicUrl`). `module/identity` consumes the client via `@module/shared/storage` and owns every avatar-specific concept (key prefix, allowed MIME, size and dimension limits, finalize lifecycle, prior-avatar cleanup).

- Pro: Boundary lines up with ADR-0006 — storage is shared, business rules are domain-owned
- Pro: Single AWS SDK touchpoint; future domains reuse it for free
- Pro: The `STORAGE_PROVIDER` DI token allows swapping S3 for any S3-compatible store (R2, MinIO, GCS-with-S3-mode) without touching domain code

#### Option C: A "thin facade" shared module that exposes only avatar-shaped operations

`StorageClient.createAvatarUploadIntent(userId)` lives in shared, hiding S3 from identity entirely.

- Pro: Hides AWS SDK from domain code completely
- Con: Forces avatar semantics into shared — the `Avatar` concept becomes cross-cutting, which is a category error. Adding club covers would then need either another shared facade (`createClubCoverIntent`) or a generic one (re-deriving Option B). Net: it converges on Option B with extra coupling

### How does the browser upload?

#### Option α: Proxy through API

Browser POSTs to the API; API streams bytes to S3.

- Pro: One round-trip, simpler client
- Pro: Easiest place to inspect bytes inline
- Con: All upload bandwidth flows through the API. At 2 MB × N users this is wasteful; at higher caps or with global users it becomes a serious cost item
- Con: API holds large request bodies in memory or temp files, surface for DoS and slow-client attacks
- Con: No upload progress events from `fetch` without extra plumbing
- Con: Long-running request semantics — the API is now in the slow-upload business, including timeouts, retries, and disconnects

#### Option β: Presigned PUT URL

API issues a short-lived `PUT` URL; browser uploads directly to S3.

- Pro: Bytes never touch the API
- Pro: Simple to issue
- Con: `Content-Length` cap can only be hinted via headers — clients can lie via chunked transfer encoding. S3 won't enforce it the way a POST policy does
- Con: `Content-Type` is whatever the client sends; PUT has no `starts-with` constraint at the S3 boundary

#### Option γ: Presigned POST with policy + post-upload finalize *(chosen)*

API issues a presigned POST whose policy declares `content-length-range` and `Content-Type` `starts-with image/`. S3 itself rejects oversized or wrong-type uploads at the boundary. After upload, the client calls a separate `finalize` endpoint; the API does a HEAD + small range GET, runs magic-byte MIME sniffing and dimension extraction, then copies the validated object from `avatars/pending/{userId}/{uploadId}` to `avatars/{userId}/{uploadId}.{ext}` and commits `user.avatar`.

- Pro: Strongest S3-side enforcement. Size and content-type are policed by S3, not by trust
- Pro: Bytes never touch the API; finalize-time validation reads a 4 KB range, not the whole object
- Pro: The two-phase model gives clean semantics for orphan cleanup — anything left in `avatars/pending/` after a TTL is by definition not committed and can be expired by a bucket lifecycle rule
- Pro: Defense in depth — even if a malicious client uploaded a renamed `.exe` with `Content-Type: image/jpeg`, magic-byte sniffing at finalize rejects it before any public URL exists
- Con: Two client round-trips (intent + finalize), plus the S3 POST. The client complexity is one extra `fetch`

### How do we run S3 locally?

#### Option i: MinIO

- Pro: Lightweight, single-purpose, great web console
- Con: Different code paths in some edge cases (e.g., presigned POST policy nuances). Operationally fine, but one more diverging surface

#### Option ii: LocalStack community edition *(chosen)*

- Pro: Same `S3Client` code path as production (only `endpoint` and `forcePathStyle` differ). Bucket policy, lifecycle, and CORS APIs match real S3
- Pro: A future need for SQS, SNS, or Secrets Manager extends the same container
- Con: Heavier image than MinIO (~500 MB pulled). Acceptable one-time cost
- Con: **Community S3 does not enforce policy `Deny` against anonymous reads.** A public GET of an object under `avatars/pending/` returns 200 locally; real AWS S3 returns 403. The design relies on defense in depth — the API never publishes a URL pointing at `pending/` — so this gap is dev-only, but it must be re-verified against a real bucket before production launch. *(Caught during Unit 2 implementation; documented in the plan's risk register.)*
- Con: As of 2026, the `localstack/localstack:latest` tag resolves to a Pro-licensed build that fails to start without `LOCALSTACK_AUTH_TOKEN`. We pin to `localstack/localstack:3` for the community release. *(Caught during Unit 2 implementation.)*

#### Option iii: Filesystem fallback adapter

A non-S3 `IStorageProvider` implementation that writes to `./uploads/` and serves via a static route.

- Pro: No Docker dependency
- Con: Different code path from production. Presigned URLs are emulated or non-existent. Policy semantics absent. Tests written against this would not catch broken policy formatting that real S3 rejects
- Con: We would write integration tests twice — once against the fallback, once against real S3 in CI — or accept that local tests don't prove the production contract

## Decision

We chose **Option B + γ + ii**:

1. A new generic `module/shared/storage` exposes bucket+key-agnostic operations behind a `STORAGE_PROVIDER` DI token. Its only AWS implementation today is `S3Provider` (AWS SDK v3). Avatar-specific concepts live entirely inside `module/identity`.
2. The browser uploads via a presigned POST whose policy bounds `content-length-range` and `Content-Type` `starts-with`. The API completes the upload through a separate `finalize` endpoint that HEADs the object, sniffs MIME from the first 4 KB, validates dimensions, copies `avatars/pending/{userId}/{uploadId}` → `avatars/{userId}/{uploadId}.{ext}`, deletes the pending object, best-effort deletes the prior avatar, and commits the public URL on `user.avatar`.
3. Local development uses LocalStack pinned to `localstack/localstack:3`, with a `infra/localstack/init.sh` script that creates the bucket, applies CORS for `http://localhost:4200`, applies a 1-day lifecycle rule on the `avatars/pending/` prefix, and applies a bucket policy that allows public read on `avatars/*` and explicitly denies it on `avatars/pending/*`.

The storage module exports only its `StorageModule`, `StorageClient`, and type aliases — AWS SDK types and the `STORAGE_PROVIDER` token are deliberately not in the public surface, so consumers cannot accidentally couple to AWS specifics.

A new Nx target `pnpm nx test:e2e api` wraps Jest with `NODE_OPTIONS=--experimental-vm-modules` because the AWS SDK uses dynamic imports internally for error wrapping in the smithy retry middleware. The unit and integration targets keep the standard Nx Jest executor.

## Consequences

### Positive

- The storage module is reusable for every future domain that needs user-supplied media (club covers, book covers, future imports). The `IStorageProvider` interface is bucket-and-key generic — no `avatar*` methods to deprecate later.
- The `domain → shared` boundary holds: AWS SDK imports appear only inside `module/shared/storage`. `dependency-cruiser` enforces this transitively through the existing ADR-0006 rules — no new dep-cruiser rule was needed.
- S3 polices the cheap things (size, content-type prefix) at the boundary, before any byte hits our infrastructure. The API polices the things S3 can't (real MIME, dimensions) on the validated object before any URL is published.
- Orphaned uploads have a free cleanup path: anything in `avatars/pending/` older than 1 day is deleted by an S3 Lifecycle rule. No custodial worker, no cron job, no per-app code.
- Production deployment becomes a configuration change, not a code change: a real S3 bucket with the same policy/lifecycle and an IAM role replacing the dummy access key. Pointing the API at CloudFront later is a `S3_PUBLIC_URL_BASE` env update + a one-time backfill of existing avatars — no client or service change.
- The same `StorageClient` will support presigned PUT (different SDK call) if a future use case ever needs it; the public-facing API is generic enough that it doesn't lock us into POST.

### Negative / Trade-offs

- Two client round-trips per upload (intent + finalize), plus the S3 POST itself. The frontend complexity is one extra `fetch` after the upload completes — a small price for the security and cost wins.
- The dependency on LocalStack means local dev now requires three containers (postgres, localstack, postgres) up before the API can boot fully. The `depends_on: condition: service_healthy` chain in `docker-compose.yml` handles this transparently for `docker compose up`, but `pnpm nx serve api` directly assumes the operator has the infra running.
- AWS SDK v3's reliance on dynamic imports means the e2e target needs `NODE_OPTIONS=--experimental-vm-modules`. We isolated this to a dedicated `test:e2e` target rather than polluting the global Jest configuration; unit and int tests are unaffected.
- The bucket policy `Deny` for `avatars/pending/*` is verified manually in LocalStack (the policy is **applied** correctly, but not **enforced** against anonymous reads). Real AWS S3 honors it. This delta must be re-verified on a real bucket during production rollout — and is the reason the design does not rely on the policy alone (server-generated unguessable pending keys + lifecycle expiry are the load-bearing controls; the policy is belt-and-suspenders).

### Neutral / Watch

- `file-type` (the canonical npm MIME sniffer) became ESM-only at v17 and is incompatible with the API's CommonJS test config. We inlined a small magic-byte sniffer covering JPEG, PNG, WEBP — sufficient for avatars. If a future use case needs broader format support (TIFF, HEIC, AVIF), reconsider: either ship our own table or fold in a CJS fork like `magic-bytes.js`.
- The `avatars/pending/` and `avatars/` two-prefix scheme is the unit of orphan cleanup. If we later support staging or moderation queues, this layout may need a third prefix (`avatars/quarantine/` etc.). The lifecycle rule can be extended without code changes.
- The `S3_PUBLIC_URL_BASE` env var is currently optional; the URL builder falls back to standard S3 or endpoint+bucket URLs. Once a CDN is in front of production, that var becomes required in production environments — worth a Zod refinement or a deploy-time check at that point.
- The presigned POST TTL is 5 minutes by default. If we ever see legitimate slow uploads (mobile, large files) start failing past that window, the TTL bumps via env without code change.

## Related

- ADR-0005: Application-side UUID generation (used to mint `uploadId` values server-side, so the client never picks a storage key).
- ADR-0006: `module/shared/*` and `@module/*` path aliases — the boundary rules this ADR depends on.
- `docs/plans/2026-05-13-001-feat-avatar-upload-plan.md`: the implementation plan whose execution produced this ADR.
