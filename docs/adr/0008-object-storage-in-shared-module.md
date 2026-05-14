# 0008. Object storage lives in a generic `module/shared/storage`

Date: 2026-05-13
Status: Accepted

## Context

The first concrete use of object storage was user avatars, but the same plumbing will be reused for club covers, book covers, and any future user-supplied media. We had to decide where the AWS SDK and bucket-aware code live in the API.

`MODULAR-PRINCIPLES.md` and ADR-0006 are firm: bounded contexts own business rules; cross-cutting concerns live under `module/shared/*`. Storage is plainly cross-cutting, but "what counts as business rule vs. infrastructure" needed an explicit call for object storage in particular (key shape, validation thresholds, lifecycle commit).

## Decision Drivers

- **Boundary integrity (ADR-0006).** Storage primitives must be domain-agnostic — `module/shared/storage` cannot know anything about avatars, users, books, or clubs. Avatar-specific rules (key shape, validation, lifecycle commit) belong to `module/identity`.
- **Replaceability (ADR-0006 / `MODULAR-PRINCIPLES.md` §6).** The storage backend should be swappable behind a DI seam without touching consumers.
- **Single SDK touchpoint.** AWS SDK imports must not bleed into multiple domains.

## Options Considered

### Option A: A single `AvatarStorageService` inside `module/identity`

Put the AWS SDK and avatar-specific orchestration in one identity-owned service.

- Pro: Fewer files, fewer boundaries to cross
- Con: Couples a bounded context to AWS SDK directly. Reuse for club covers (`module/clubs`) and book covers (`module/reading`) would mean duplicating the SDK wiring in every domain
- Con: `shared → domain` is forbidden by dep-cruiser, but `domain → AWS SDK` is not constrained at all — the rule offers no protection against AWS bleeding into every domain

### Option B: A generic `module/shared/storage` with domain rules in their own modules *(chosen)*

`module/shared/storage` exposes bucket+key-generic operations (`createPresignedPost`, `headObject`, `getObjectRange`, `copyObject`, `deleteObject`, `buildPublicUrl`). Domain modules consume the client via `@module/shared/storage` and own every domain-specific concept (key prefix, allowed MIME, size and dimension limits, finalize lifecycle, prior-object cleanup).

- Pro: Boundary lines up with ADR-0006 — storage is shared, business rules are domain-owned
- Pro: Single AWS SDK touchpoint; future domains reuse it for free
- Pro: A DI port (`STORAGE_PORT`) allows swapping S3 for any S3-compatible store (R2, MinIO, GCS-with-S3-mode) without touching domain code

### Option C: A "thin facade" shared module that exposes only domain-shaped operations

`StorageClient.createAvatarUploadIntent(userId)` lives in shared, hiding S3 from identity entirely.

- Pro: Hides AWS SDK from domain code completely
- Con: Forces avatar semantics into shared — the `Avatar` concept becomes cross-cutting, which is a category error. Adding club covers would then need either another shared facade (`createClubCoverIntent`) or a generic one (re-deriving Option B). Net: it converges on Option B with extra coupling

## Decision

**Option B.** `module/shared/storage` is bucket+key-agnostic. Its internal layout uses the ports-and-adapters pattern:

- `port/storage.port.ts` — the `IStoragePort` interface and `STORAGE_PORT` DI token (the seam consumers depend on)
- `adapter/s3.adapter.ts` — `S3StorageAdapter`, the only AWS-aware code in the project (the swappable implementation)
- `client/storage.client.ts` — a thin facade that delegates to the port; the only class consumers inject

The module exports `StorageModule`, `StorageClient`, and type aliases. The AWS SDK, `STORAGE_PORT`, and adapter classes are deliberately not in the public surface — consumers cannot accidentally couple to AWS specifics, and a future GCS or R2 adapter is a new file under `adapter/`, not a refactor.

Avatar-specific rules (the `avatars/pending/{userId}/{uploadId}` key shape, allowed MIME, size and dimension limits, finalize lifecycle, prior-avatar deletion) live entirely inside `module/identity`. Magic-byte MIME sniffing — which is image-format logic, not storage logic — lives in `module/shared/image` (where future clubs/books cover code will reuse it).

## Consequences

### Positive

- The storage module is reusable for every future domain that needs user-supplied media (club covers, book covers, future imports). The `IStoragePort` interface is bucket-and-key generic — no `avatar*` methods to deprecate later.
- The `domain → shared` boundary holds: AWS SDK imports appear only inside `module/shared/storage/adapter/`. `dependency-cruiser` enforces this transitively through the existing ADR-0006 rules — no new dep-cruiser rule was needed.
- Production deployment becomes a configuration change, not a code change: a real S3 bucket plus an IAM role replacing the dummy access key.

### Negative / Trade-offs

- One additional level of indirection between domain code and the AWS SDK (domain → `StorageClient` → `STORAGE_PORT` → `S3StorageAdapter`). The ergonomics cost is one constructor parameter; the boundary win is one place to swap the backend.

### Neutral / Watch

- The `MailModule` under `module/shared/mail` predates this ADR and uses an internal `provider/` folder rather than `port/`+`adapter/`. The pattern is the same shape, only the naming differs; a future cleanup may rename it for consistency, but it is not load-bearing.

## Related

- ADR-0006: `module/shared/*` and `@module/*` path aliases — the boundary rules this ADR depends on.
- ADR-0009: Two-phase presigned POST + finalize — the upload protocol this storage module enables.
- ADR-0010: LocalStack as the local S3 emulator — the dev-infra choice that exercises the same code path.
