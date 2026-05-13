---
title: "feat: Avatar Image Upload via S3 Presigned POST"
type: feat
status: completed
date: 2026-05-13
---

# Avatar Image Upload via S3 Presigned POST

## Overview

Add user avatar upload capability to the profile page. The browser uploads the image directly to S3 using a presigned POST URL issued by the API, then asks the API to validate and commit the result. A new generic `module/shared/storage` module wraps the AWS SDK and is consumed by `module/identity`, which owns all avatar-specific business rules. Local development uses LocalStack to emulate S3.

## Problem Frame

The `UserEntity.avatar` column already exists but is unused — there is no upload path. Today the profile page can show an avatar URL but cannot change it. We need a secure, scalable upload mechanism that:

- Does not stream image bytes through the API (cost + memory)
- Cannot be abused to upload non-images, oversized files, or to overwrite other users' avatars
- Works locally without a real AWS account
- Keeps the cross-cutting S3 plumbing isolated from identity business rules, per `MODULAR-PRINCIPLES.md`

## Requirements Trace

- R1. Authenticated users can replace their profile avatar from the profile page.
- R2. The browser uploads bytes directly to S3 (no API proxy of file bytes).
- R3. S3 itself enforces max file size and content-type prefix at the upload boundary.
- R4. The API independently validates real content (magic-byte MIME sniff + image dimensions) before committing the avatar URL.
- R5. A user can only write to their own avatar key prefix.
- R6. Orphaned uploads (intent issued but never finalized) are automatically cleaned up.
- R7. Local development uses an S3-compatible emulator with the same code path as production.
- R8. The avatar URL stored on `user.avatar` is publicly readable by browsers and CDN-cacheable.
- R9. All S3 access is encapsulated in `module/shared/storage` — no avatar logic leaks in; no S3 SDK leaks out to domain modules.

## Scope Boundaries

**In scope:**
- Generic `module/shared/storage` (presigned POST, HEAD, delete, get-range)
- `module/identity` avatar endpoints (upload-intent + finalize) and business rules
- Frontend avatar upload UI on the profile page
- LocalStack-based local dev setup
- Validation: MIME magic-byte sniff, dimensions, file size

**Out of scope (explicit non-goals):**
- Server-side image resize / re-encode / variant generation (deferred — see Future Considerations)
- EXIF stripping (deferred — bundled with resize work)
- CDN (CloudFront) — public S3 URL is sufficient for v1; CDN can be put in front later transparently
- Background job worker for orphan cleanup — handled by S3 Lifecycle rule, no app code needed
- Avatar for non-user entities (clubs, etc.)
- Multi-region S3 strategy

## Context & Research

### Relevant Code and Patterns

- `apps/api/src/module/shared/mail/` — exact template for the new storage module's shape:
  - `mail.module.ts` registers the provider via a DI token
  - `client/email.client.ts` is the domain-facing API
  - `provider/email-provider.interface.ts` exports `EMAIL_PROVIDER` symbol + interface
  - `provider/resend.provider.ts` is the swappable implementation
  - `index.ts` re-exports only `MailModule`, `EmailClient`, and the options type
- `apps/api/src/module/shared/config/env.schema.ts` — Zod env schema; add storage variables here
- `apps/api/src/module/identity/persistence/entity/user.entity.ts` — `avatar` column already exists (varchar 500, nullable). No migration needed.
- `apps/api/src/module/identity/http/controller/user.controller.ts` — extend with two new endpoints under `/api/user/me/avatar/*`
- `apps/api/src/module/identity/core/user.service.ts` — already has `updateProfile` that sets `avatar`; we will not reuse it for the finalize flow (separate concern: validated upload commit)
- `apps/web/src/components/profile/profile-form.tsx` — existing profile form; the new avatar uploader is a sibling component
- `apps/web/src/app/api/user/me/` — existing pattern for Next.js API route handlers proxying to the NestJS API with the JWT cookie

### Institutional Learnings

- `docs/adr/0006-module-shared-and-path-aliases.md` — shared modules must not contain business rules; this plan strictly respects that boundary.
- `docs/STATE-ISOLATION.md` — avatar metadata lives on `user` (identity schema); the bucket itself is a separate state plane outside any DB schema, so no schema isolation conflict.
- `docs/MODULAR-PRINCIPLES.md` §6 (Replaceability) — `STORAGE_PROVIDER` DI token allows swapping S3 for any S3-compatible store (MinIO, R2) without service changes.

### External References

- AWS SDK v3: `@aws-sdk/client-s3` + `@aws-sdk/s3-presigned-post` are the current SDK packages. Use `createPresignedPost` for POST policy URLs.
- `file-type` (npm) — magic-byte MIME sniffing from a buffer; works on the first ~4KB of a file.
- `image-size` (npm) — extracts width/height without full decode; very cheap.
- LocalStack community edition emulates S3 including presigned POST policies. Override `endpoint` on the `S3Client` and set `forcePathStyle: true`.

## Key Technical Decisions

- **Presigned POST + finalize (two-phase upload).** Rationale: S3 enforces `content-length-range` and `Content-Type` `starts-with` at the boundary; finalize handles the things S3 cannot (real MIME sniff, dimensions, lifecycle commit). Confirmed in pre-plan discussion as stronger than presigned PUT.
- **Generic `module/shared/storage`.** Rationale: per `MODULAR-PRINCIPLES.md`, S3 is a cross-cutting concern. The module exposes generic operations (`createPresignedPost`, `headObject`, `getObjectRange`, `deleteObject`); avatar-specific key naming, prefixes, and validation rules live in `module/identity`.
- **LocalStack for local dev.** Rationale: chosen by user. Same SDK code path as production, only the endpoint differs. Add as a docker-compose service with auto-bucket-init.
- **Validate only at finalize, no transform.** Rationale: chosen by user. Cheapest path; preserves user-uploaded fidelity; resize/optimize can be added later without changing the upload contract.
- **Public bucket on `/avatars/` prefix.** Rationale: chosen by user. CDN-friendly, simple, industry-standard for non-sensitive profile images. Bucket policy allows public read on the finalized prefix; the pending prefix stays private.
- **Two-prefix key layout: `avatars/pending/{userId}/{uploadId}` → `avatars/{userId}/{uploadId}.{ext}`.** Rationale: upload-intent issues a key in `pending/`, finalize copies to the public prefix after validation and deletes the pending object. Lifecycle rule auto-deletes anything left in `pending/` after 24h. This keeps unvalidated bytes out of the public space and gives a clean orphan-cleanup story without a worker.
- **Upload ID = UUID v4 generated server-side.** Rationale: consistent with ADR-0005 (application-side UUID generation). The client never picks the key.
- **Avatar URL stored as full public URL, not a key.** Rationale: keeps the frontend dumb (no URL composition), allows transparent CDN swap-in later (change the public URL builder, run a one-shot backfill).
- **Max size 2 MB, max dimensions 2048×2048, MIME prefix `image/`, allowed types: jpeg, png, webp.** Rationale: comfortable headroom for high-DPI displays without permitting abuse. Encoded in env (overridable) but defaulted in the Zod schema.

## Open Questions

### Resolved During Planning

- **Upload mechanism** → presigned POST + finalize.
- **Local emulator** → LocalStack community edition.
- **Image processing** → validate only; no transform in v1.
- **Read access** → public bucket on `/avatars/` prefix.
- **Where do avatar key naming rules live** → in `module/identity` (business rule), not in `module/shared/storage`.
- **How is orphan cleanup done** → S3 Lifecycle rule on the `pending/` prefix; no app code.

### Deferred to Implementation

- Exact LocalStack image tag and init-script mechanism (`AWS_PROFILE` + `awslocal` vs. `localstack/localstack` boot hooks) — pick what is least painful when wiring docker-compose.
- Exact behavior when finalize is called twice for the same upload ID — likely idempotent (second call is a no-op if the destination already exists). Decide during integration tests.
- Whether to delete the user's previous avatar object on successful finalize — leaning yes, but only after the new one is committed. Confirm during implementation; the storage client already supports `deleteObject`.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

**Sequence:**

```
Browser                  Next.js Route             NestJS API                    S3 / LocalStack
   |                          |                          |                              |
   | select file              |                          |                              |
   |------------------------->|                          |                              |
   |  POST /api/user/me/      |                          |                              |
   |  avatar/upload-intent    |                          |                              |
   |  { contentType, size }   | proxy w/ JWT cookie      |                              |
   |                          |------------------------->|                              |
   |                          |                          | validate size/type,          |
   |                          |                          | generate key                 |
   |                          |                          | avatars/pending/{uid}/{uuid} |
   |                          |                          | createPresignedPost(...)     |
   |                          |                          |----------------------------->|
   |                          |                          |<-- url + fields + key -------|
   |                          |<-------------------------|                              |
   |<-- url + fields + key ---|                          |                              |
   |                                                                                    |
   | POST multipart form (file + policy fields) directly to S3                          |
   |----------------------------------------------------------------------------------->|
   |                                                S3 enforces size + content-type     |
   |<---------------------------------------------- 204 No Content ---------------------|
   |                          |                          |                              |
   |  POST /api/user/me/      |                          |                              |
   |  avatar/finalize         |                          |                              |
   |  { uploadKey }           |                          |                              |
   |------------------------->|------------------------->|                              |
   |                          |                          | HEAD pending object          |
   |                          |                          |----------------------------->|
   |                          |                          |<-- size, contentType --------|
   |                          |                          | GET first 4KB                |
   |                          |                          |----------------------------->|
   |                          |                          |<-- bytes --------------------|
   |                          |                          | file-type sniff,             |
   |                          |                          | image-size dimensions        |
   |                          |                          | copyObject pending -> public |
   |                          |                          |----------------------------->|
   |                          |                          | deleteObject pending         |
   |                          |                          |----------------------------->|
   |                          |                          | update user.avatar = url     |
   |                          |<-- { user } --------------|                              |
   |<-- { user } -------------|                          |                              |
```

**Module shape (`module/shared/storage`):**

```
module/shared/storage/
├── client/
│   └── storage.client.ts            # domain-facing API
├── provider/
│   ├── storage-provider.interface.ts # STORAGE_PROVIDER token + IStorageProvider
│   ├── s3.provider.ts                # AWS SDK v3 implementation
│   └── __tests__/
├── interface/
│   ├── presigned-post.interface.ts   # { url, fields, key, expiresAt }
│   ├── object-metadata.interface.ts  # { contentType, contentLength, etag }
│   └── presigned-post-options.interface.ts
├── storage.module.ts
└── index.ts
```

Exported public API (from `index.ts`): `StorageModule`, `StorageClient`, types for options and results. **Not exported:** `S3Client`, AWS SDK types, `STORAGE_PROVIDER` token — those stay internal.

## Implementation Units

- [x] **Unit 1: Add `module/shared/storage` generic storage module**

**Goal:** Provide a generic, replaceable S3 client for the rest of the API. No domain knowledge inside.

**Requirements:** R2, R7, R9

**Dependencies:** None

**Files:**
- Create: `apps/api/src/module/shared/storage/storage.module.ts`
- Create: `apps/api/src/module/shared/storage/index.ts`
- Create: `apps/api/src/module/shared/storage/client/storage.client.ts`
- Create: `apps/api/src/module/shared/storage/provider/storage-provider.interface.ts`
- Create: `apps/api/src/module/shared/storage/provider/s3.provider.ts`
- Create: `apps/api/src/module/shared/storage/interface/presigned-post.interface.ts`
- Create: `apps/api/src/module/shared/storage/interface/presigned-post-options.interface.ts`
- Create: `apps/api/src/module/shared/storage/interface/object-metadata.interface.ts`
- Test: `apps/api/src/module/shared/storage/provider/__tests__/s3.provider.spec.ts`
- Test: `apps/api/src/module/shared/storage/client/__tests__/storage.client.spec.ts`
- Modify: `tsconfig.base.json` — add `"@module/shared/storage": ["apps/api/src/module/shared/storage/index.ts"]`
- Modify: `.dependency-cruiser.cjs` (or equivalent) — register `@module/shared/storage` allowed direction
- Modify: `package.json` — add `@aws-sdk/client-s3` and `@aws-sdk/s3-presigned-post`

**Approach:**
- `IStorageProvider` interface methods: `createPresignedPost(opts)`, `headObject(bucket, key)`, `getObjectRange(bucket, key, byteRange)`, `copyObject(srcBucket, srcKey, destBucket, destKey)`, `deleteObject(bucket, key)`, `buildPublicUrl(bucket, key)`. **No avatar-specific methods.** All operations are bucket+key generic.
- `S3Provider` constructs `S3Client` from config: `region`, optional `endpoint` (for LocalStack), `forcePathStyle: true` when endpoint is set, credentials from env.
- `StorageClient` is a thin facade that delegates to the injected `STORAGE_PROVIDER`. It exists so domain modules depend on a stable class rather than the interface token directly — same pattern as `EmailClient`.
- `buildPublicUrl` honors an optional `S3_PUBLIC_URL_BASE` config (for CDN swap-in later); falls back to standard S3 URL construction when unset.

**Patterns to follow:**
- `apps/api/src/module/shared/mail/` — mirror the directory layout, module wiring, and DI-token convention exactly.

**Test scenarios:**
- *Happy path:* `StorageClient.createPresignedPost` returns `{ url, fields, key, expiresAt }` when given valid options.
- *Happy path:* `headObject` returns metadata `{ contentType, contentLength, etag }` for an existing key.
- *Happy path:* `getObjectRange(bucket, key, '0-4095')` returns a buffer of expected size.
- *Happy path:* `copyObject` invokes provider with correct source/dest pair.
- *Happy path:* `deleteObject` invokes provider with the right bucket+key.
- *Happy path:* `buildPublicUrl` uses `S3_PUBLIC_URL_BASE` when configured; falls back to S3 URL when not.
- *Error path:* `headObject` on a missing key surfaces a typed "not found" result (not a generic AWS error) so callers can branch without inspecting SDK internals.
- *Error path:* `createPresignedPost` propagates a clear error when bucket is missing/misconfigured.
- *Integration:* `S3Provider` against LocalStack produces a presigned POST that a real `fetch` can use to upload a 1-byte file (run as `.int-spec.ts`, gated on LocalStack availability).

**Verification:**
- `pnpm nx test api` passes new specs.
- `import { StorageClient } from '@module/shared/storage'` resolves and the public surface contains only the documented exports — no AWS SDK types leak.

---

- [x] **Unit 2: Wire config + LocalStack into the dev environment**

**Goal:** Add all storage-related env vars, fail-fast on missing values, and bring up an S3-compatible bucket in local dev with a single `docker compose up`.

**Requirements:** R3, R5, R7, R8

**Dependencies:** Unit 1 (the storage module reads these vars)

**Files:**
- Modify: `apps/api/src/module/shared/config/env.schema.ts` — add storage vars to Zod schema
- Modify: `apps/api/src/module/shared/config/env.type.ts` — extend typed config
- Modify: `apps/api/src/module/shared/config/segment/` — add `storage` segment (mirrors `jwt`, `mail`)
- Modify: `apps/api/.env.example` — document new vars
- Modify: `docker-compose.yml` — add `localstack` service and `localstack-init` one-shot
- Create: `infra/localstack/init.sh` — `awslocal s3api create-bucket`, set CORS, set lifecycle rule on `pending/`, set public-read policy on `avatars/*` (excluding `pending/*`)

**Approach:**
- New env vars (all with sensible local defaults; production must override credentials and bucket name):
  - `STORAGE_DRIVER` — `s3` (only value for now, but reserved for future)
  - `S3_REGION` — default `us-east-1`
  - `S3_ENDPOINT` — optional; when set, S3 client uses path-style addressing (LocalStack)
  - `S3_BUCKET_AVATARS` — default `plot-twist-avatars`
  - `S3_PUBLIC_URL_BASE` — optional; when unset, fall back to S3 standard URL builder
  - `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` — required (LocalStack accepts dummy values `test`/`test`)
  - `MAX_AVATAR_SIZE_BYTES` — default `2097152` (2 MB)
  - `MAX_AVATAR_DIMENSION` — default `2048`
  - `AVATAR_ALLOWED_MIME` — default `image/jpeg,image/png,image/webp`
  - `PRESIGNED_POST_TTL_SECONDS` — default `300` (5 min)
- LocalStack service in compose: `localstack/localstack:latest`, ports `4566:4566`, env `SERVICES=s3`, `DEFAULT_REGION=us-east-1`, volume mount for the init script under `/etc/localstack/init/ready.d/`.
- `localstack-init` script:
  - Create bucket `plot-twist-avatars`
  - Apply CORS allowing POST from `http://localhost:4200`
  - Apply lifecycle rule: expire objects under `avatars/pending/` after 1 day
  - Apply bucket policy: public read on `arn:aws:s3:::plot-twist-avatars/avatars/*` excluding `pending/*` (use a `NotResource` or condition; verify exact policy syntax during impl)
- Update `api` service env in compose to point at `S3_ENDPOINT=http://localstack:4566` and provide dummy credentials.

**Patterns to follow:**
- `apps/api/src/module/shared/config/segment/` shows the existing segment pattern (`jwt`, `mail`); add `storage`.
- Existing `postgres` and `api` services in docker-compose show health-check + `depends_on: condition: service_healthy` chaining.

**Test scenarios:**
- *Happy path:* API boots with all storage env vars set; `ConfigService.get('storage')` returns the typed segment.
- *Error path:* missing `S3_BUCKET_AVATARS` causes a Zod parse error at boot with a clear message (mirror existing `JWT_SECRET` behavior).
- *Error path:* invalid `MAX_AVATAR_SIZE_BYTES` (non-numeric) fails Zod parse.
- *Integration:* `docker compose up localstack localstack-init` brings the container to healthy and creates the bucket with the expected policy and lifecycle rule (verify via `awslocal s3api get-bucket-policy`, `get-bucket-lifecycle-configuration`).

**Verification:**
- `pnpm nx serve api` boots successfully when LocalStack is running.
- `awslocal s3 ls s3://plot-twist-avatars` succeeds from inside the localstack container.
- The init script is idempotent (re-running `docker compose up` doesn't fail).

---

- [x] **Unit 3: Add avatar endpoints + service in `module/identity`**

**Goal:** Two new authenticated endpoints (`upload-intent`, `finalize`) plus an `AvatarService` that owns every avatar-specific business rule (key prefixes, validation thresholds, lifecycle commit). No S3 SDK appears anywhere in this module.

**Requirements:** R1, R3, R4, R5, R8, R9

**Dependencies:** Unit 1, Unit 2

**Files:**
- Create: `apps/api/src/module/identity/core/avatar.service.ts`
- Create: `apps/api/src/module/identity/http/dto/avatar-upload-intent.dto.ts` (request: `contentType`, `contentLength`)
- Create: `apps/api/src/module/identity/http/dto/avatar-upload-intent-response.interface.ts` (response: `{ url, fields, key, expiresAt }`)
- Create: `apps/api/src/module/identity/http/dto/avatar-finalize.dto.ts` (request: `uploadKey`)
- Modify: `apps/api/src/module/identity/http/controller/user.controller.ts` — add two routes
- Modify: `apps/api/src/module/identity/identity.module.ts` — import `StorageModule`, register `AvatarService`
- Modify: `apps/api/src/module/identity/index.ts` — no new exports needed (avatar is internal to identity)
- Modify: `package.json` — add `file-type` and `image-size`
- Test: `apps/api/src/module/identity/core/__tests__/avatar.service.spec.ts`
- Test: `apps/api/src/module/identity/http/controller/__tests__/user.controller.avatar.spec.ts`
- Test: `apps/api/src/module/identity/__tests__/avatar.e2e-spec.ts`

**Approach:**
- New routes on `UserController`:
  - `POST /user/me/avatar/upload-intent` (200) — validates DTO (content-type in allowlist, content-length ≤ max), generates `uploadId = uuid()`, builds key `avatars/pending/{userId}/{uploadId}`, calls `StorageClient.createPresignedPost` with `content-length-range` and `Content-Type` `starts-with` constraints, returns presigned response.
  - `POST /user/me/avatar/finalize` (200) — validates DTO, asserts `uploadKey` starts with `avatars/pending/{currentUserId}/` (defense in depth even though presigned POST already locked the key), calls `AvatarService.finalize`.
- `AvatarService.finalize(userId, uploadKey)`:
  1. `headObject` — confirm exists, confirm `contentLength` ≤ max, confirm `contentType` in allowlist
  2. `getObjectRange(0-4095)` — sniff real MIME via `file-type`; reject if it disagrees with header or is not in allowlist
  3. Run `image-size` on the same buffer — reject if width or height exceed max dimension
  4. Compute final key `avatars/{userId}/{uploadId}.{ext}` where `ext` comes from sniffed MIME (`jpg`/`png`/`webp`)
  5. `copyObject` from pending → final
  6. `deleteObject` on the pending key (best-effort; log on failure)
  7. Read prior `user.avatar` URL; if present and on our bucket, derive its key and `deleteObject` (best-effort)
  8. `buildPublicUrl(finalKey)` and update `user.avatar`
  9. Return updated `IUserResponse` via `toUserResponse`
- On any validation failure between steps 1–3: `deleteObject` on the pending key, throw `BadRequestException` with a specific reason code.
- All avatar-specific constants (key prefixes, max size, max dim, allowed MIME) come from `ConfigService.get('storage')` — `AvatarService` does not hard-code them.

**Execution note:** Implement integration coverage first (`avatar.e2e-spec.ts` against LocalStack) because the contract spans HTTP, S3, and DB — mocks alone won't prove correctness.

**Patterns to follow:**
- `apps/api/src/module/identity/core/email-change.service.ts` — same shape: business-rule service that depends on a shared client (`EmailClient`) and a repository (`UserRepository`).
- `UserController` already uses `@CurrentUser()` and `JwtAuthGuard`; reuse without changes.

**Test scenarios:**
- *Happy path:* Authenticated `POST /user/me/avatar/upload-intent` with `{ contentType: 'image/jpeg', contentLength: 500000 }` returns `{ url, fields, key, expiresAt }` and `key` is under `avatars/pending/{currentUserId}/`.
- *Happy path:* After a real upload to LocalStack with that policy, `POST /user/me/avatar/finalize { uploadKey }` returns the user with a new `avatar` URL under `avatars/{userId}/` and the pending object is gone.
- *Happy path:* Finalizing a second time replaces the previous avatar and deletes the old object from S3.
- *Edge case:* Content-length exactly at the max is accepted; one byte over is rejected at intent stage.
- *Edge case:* `image/svg+xml` is rejected at the intent stage (not in allowlist).
- *Edge case:* Valid header content-type but the actual bytes are a `.exe` (magic bytes mismatch) — finalize rejects, pending object is deleted, `user.avatar` is unchanged.
- *Edge case:* JPEG of 4000×4000 — finalize rejects on dimensions, pending object deleted.
- *Edge case:* A PNG renamed to .jpg uploaded with `Content-Type: image/jpeg` — sniffer detects PNG; finalize uses `.png` extension on the final key.
- *Error path:* Finalize with a `uploadKey` belonging to another user (`avatars/pending/OTHER/...`) returns 403, no S3 access performed.
- *Error path:* Finalize with a key that has no object in S3 returns 404, `user.avatar` unchanged.
- *Error path:* Finalize when S3 is unreachable returns 503; `user.avatar` unchanged and the request is safely retryable.
- *Integration:* The end-to-end flow (intent → real S3 POST upload → finalize → GET `/user/me`) returns the new avatar URL, and that URL is publicly reachable via HTTP GET (LocalStack public-read policy honored).
- *Integration:* Pending objects left for 24h are auto-deleted by the bucket lifecycle rule (verify policy is configured, not necessarily the time-travel behavior).

**Verification:**
- `pnpm nx test api` passes all new specs (unit + int + e2e).
- `dependency-cruiser` reports no violations (`module/shared/storage` → no domain imports; `module/identity` → `module/shared/storage` allowed).
- `import { S3Client } from '@aws-sdk/client-s3'` does **not** appear anywhere under `module/identity/`.

---

- [x] **Unit 4: Frontend avatar upload UI + Next.js API proxy routes**

**Goal:** A profile-page component where the user picks a file, watches a progress indicator, and sees the new avatar appear on success. Two thin Next.js route handlers proxy the API calls (mirroring the existing `me` pattern).

**Requirements:** R1, R2

**Dependencies:** Unit 3

**Files:**
- Create: `apps/web/src/app/api/user/me/avatar/upload-intent/route.ts`
- Create: `apps/web/src/app/api/user/me/avatar/finalize/route.ts`
- Create: `apps/web/src/components/profile/avatar-upload.tsx`
- Create: `apps/web/src/components/profile/avatar-upload.module.css`
- Create: `apps/web/src/lib/types/avatar.ts` — shared types `IAvatarUploadIntentResponse`
- Modify: `apps/web/src/app/(app)/profile/page.tsx` — render `<AvatarUpload />` next to `<ProfileForm />`
- Test: `apps/web/src/components/profile/__tests__/avatar-upload.spec.tsx`

**Approach:**
- Route handlers: receive the request from the browser, forward to NestJS API with the JWT cookie (same pattern as the existing `app/api/user/me/route.ts`). They contain no business logic.
- `AvatarUpload` component (client component):
  1. `<input type="file" accept="image/jpeg,image/png,image/webp">` — also enforces client-side allowlist as UX hint (real enforcement is server-side)
  2. On change: client-side pre-checks — file size against advertised max (read from a public config endpoint or hardcode the same default as backend; **prefer fetching limits from the upload-intent response** so they stay in sync — extend the intent response to echo back applied limits). Reject locally with a friendly message before round-tripping.
  3. Call `POST /api/user/me/avatar/upload-intent` with `{ contentType, contentLength }`
  4. Build a `FormData` with all `fields` from the response + the file (file must be the last field per S3 POST policy spec). `fetch(url, { method: 'POST', body: formData })`.
  5. Show upload progress via `XMLHttpRequest` (`fetch` doesn't expose upload progress; use XHR for this step only — well-established pattern).
  6. On `204 No Content`, call `POST /api/user/me/avatar/finalize { uploadKey: key }`.
  7. On success, update local user state with the new `avatar` URL; show success toast.
  8. On any failure, surface the server's reason code as a user-friendly message; allow retry.
- Add an "X" button next to the current avatar to clear it — calls `PATCH /user/me { avatar: null }` (existing endpoint; no new backend code).

**Patterns to follow:**
- `apps/web/src/app/api/user/me/route.ts` — existing JWT-cookie proxy pattern.
- `apps/web/src/components/profile/profile-form.tsx` — form component layout, CSS module convention, toast/error display style.
- `apps/web/src/components/account/verify-email-change.tsx` — two-step async flow with intermediate states.

**Test scenarios:**
- *Happy path:* Selecting a valid 200KB JPEG triggers intent → S3 POST (mocked) → finalize → avatar updates in the UI.
- *Edge case:* Selecting a 5MB file is rejected client-side before the intent call is made.
- *Edge case:* Selecting a `.svg` is rejected client-side (allowlist).
- *Error path:* S3 upload returns 403 (e.g., wrong policy) — UI shows a clear error, no finalize call is made, no state change.
- *Error path:* Finalize returns 400 (bad content) — UI shows the server's reason; previous avatar still displayed.
- *Error path:* Network error during intent — UI shows retry option.
- *Integration:* The component's "remove avatar" button calls `PATCH /user/me { avatar: null }` and clears the displayed avatar.

**Verification:**
- `pnpm nx test web` passes new specs.
- Manual smoke test against running API + LocalStack: upload completes end-to-end, the new avatar is fetched on next profile load, refreshing the page shows the persisted avatar.

---

- [x] **Unit 5: Documentation + ADR**

**Goal:** Capture the architectural decision and update operator docs.

**Requirements:** R7, R9

**Dependencies:** Units 1–4 complete (so the doc reflects the shipped shape)

**Files:**
- Create: `docs/adr/0008-object-storage-via-shared-storage-module.md`
- Modify: `CLAUDE.md` — add `@module/shared/storage` to the path-alias table and to the module structure section
- Modify: `apps/api/.env.example` — already updated in Unit 2; double-check completeness
- Optional: `docs/DOMAINS-DEFINITION.md` — note that avatar URLs are an Identity concern; the bucket is shared infra

**Approach:**
- ADR records: decision (presigned POST + finalize, generic shared storage), context (why not proxy, why not presigned PUT), consequences (LocalStack dependency in dev, public-bucket implications, lifecycle-based orphan cleanup), and explicit alternatives rejected.
- Cross-link from ADR-0006 (module-shared-and-path-aliases) so future readers find the new module.

**Patterns to follow:**
- Existing ADRs in `docs/adr/` — number sequentially, follow the same template (Context / Decision / Consequences / Alternatives).

**Test scenarios:** N/A (doc-only).

**Verification:**
- `pnpm nx graph` and dependency-cruiser remain green after `CLAUDE.md` updates (no code changes implied).
- ADR renders correctly in the directory listing and is reachable from ADR-0006.

## System-Wide Impact

- **Interaction graph:** New dependency `module/identity → module/shared/storage`. No new event listeners. `UserController` gains two routes — no change to existing routes or guards.
- **Error propagation:** `StorageClient` translates AWS SDK errors into typed results (`null` for "not found", typed exceptions for transport failure). `AvatarService` translates those into `BadRequestException` / `NotFoundException` / `ServiceUnavailableException` with stable reason codes the frontend can branch on.
- **State lifecycle risks:**
  - **Orphaned pending objects** — mitigated by S3 Lifecycle rule (24h expiry on `pending/`).
  - **Orphaned final objects on user deletion** — out of scope for v1 (no user-delete flow exists yet); flag as Future Consideration.
  - **Race: two concurrent finalize calls for the same user** — last write wins on `user.avatar`; both prior objects might be live in S3 briefly. Acceptable; storage cost is negligible and a follow-up sweep can be added if it ever matters.
  - **Partial-write: copy succeeds, DB update fails** — leaves a valid object in the public prefix not referenced by any user. Acceptable orphan; same lifecycle-sweep mitigation could be extended to detect un-referenced public objects in a future job.
- **API surface parity:** This adds avatar-upload-specific endpoints; other entities (clubs, books) will reuse `module/shared/storage` directly when they need uploads. The pattern is generalizable, not bespoke to identity.
- **Integration coverage:** Real LocalStack-backed integration test in Unit 3 is non-negotiable — mocks of the AWS SDK cannot prove that the policy fields are formatted correctly enough for S3 to accept the upload.
- **Unchanged invariants:**
  - `UserEntity.avatar` column shape (varchar 500, nullable) — unchanged. No migration.
  - `PATCH /user/me` body shape — unchanged. (Direct `avatar` URL set is still allowed; this is what powers the "remove avatar" path.)
  - `JwtAuthGuard`, `@CurrentUser()`, and the existing user-response shape — unchanged.
  - The identity schema (Postgres) — unchanged.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Bucket policy misconfigured at deploy time, exposing pending uploads publicly | Bake the policy into infra-as-code (LocalStack init script today, Terraform/CDK later); the policy explicitly scopes public-read to `avatars/*` excluding `pending/*`. Add an integration test that asserts a pending object returns 403 on public GET. |
| Presigned POST policy fields constructed incorrectly, leading to all uploads being rejected by S3 | Real LocalStack-backed integration test in Unit 3 (not just SDK mocks). The test must perform an actual `fetch` against the presigned URL. |
| Magic-byte sniff library disagrees with browser-reported content-type, causing legitimate uploads to fail | Sniffer is the source of truth; final extension is derived from sniff result, not header. Allowlist is checked against sniffed type. Log mismatches at `warn` level for visibility. |
| LocalStack drift from real S3 (especially around policy/lifecycle behavior) | Document known divergences in the ADR. Keep production rollout gated on a manual smoke against a real bucket before public release. **Confirmed during Unit 2:** LocalStack community does not enforce the bucket-policy Deny statement on anonymous reads — both `/avatars/*` and `/avatars/pending/*` return 200 locally. Real AWS honors the Deny. Defense in depth (server-generated unguessable pending key + lifecycle expiry + no URL ever published for pending) keeps the design sound. |
| Cost / abuse: malicious user requests thousands of presigned URLs | Rate-limit `POST /user/me/avatar/upload-intent` at the controller (NestJS rate-limiter; or add it in this plan if not present). Limit pending objects via lifecycle rule, so even successful abuse self-cleans. |
| AWS credentials misconfiguration in production | Zod schema fails fast at boot. Production deployment guide (out of scope here) will use IAM-role credentials, not access keys. |

## Documentation / Operational Notes

- **Local dev runbook update:** `docker compose up postgres localstack -d` then `pnpm nx serve api`. Document `awslocal s3 ls` for inspection.
- **Production rollout:**
  - Real S3 bucket provisioned with the same policy and lifecycle rule.
  - IAM policy for the API: `s3:PutObject`, `s3:GetObject`, `s3:HeadObject`, `s3:DeleteObject`, `s3:CopyObject` on `arn:aws:s3:::{bucket}/avatars/*` only.
  - CORS allowing POST from the production web origin.
  - Optional: CloudFront in front of the bucket; flip `S3_PUBLIC_URL_BASE` to the distribution domain. No app code change required.
- **Monitoring:** Add structured log entries (when logging is introduced) for: presigned URL issued, finalize success, finalize rejection (with reason), prior-avatar cleanup outcome. Useful for abuse detection.
- **Backfill:** None required. Existing `user.avatar` values continue to work; they were always free-form URLs.

## Future Considerations

These are explicitly **out of scope** for this plan; listed only so they aren't lost:

- Sharp-based resize / re-encode / EXIF strip at finalize.
- Variant generation (thumbnail / display / original).
- CloudFront distribution in front of the bucket.
- Reusing `module/shared/storage` for club covers, book covers, and other uploads.
- Background sweep job for orphaned final-prefix objects (post user-deletion flow).

## Sources & References

- Existing module template: `apps/api/src/module/shared/mail/` (client/provider split, DI token pattern)
- Existing config pattern: `apps/api/src/module/shared/config/`
- Existing user routes: `apps/api/src/module/identity/http/controller/user.controller.ts`
- Existing profile UI: `apps/web/src/components/profile/profile-form.tsx`
- Existing API proxy pattern: `apps/web/src/app/api/user/me/route.ts`
- ADR-0005: Application-side UUID generation (used for upload IDs)
- ADR-0006: Module shared and path aliases (boundary rules enforced here)
- AWS SDK v3 `@aws-sdk/s3-presigned-post` — `createPresignedPost` API
- LocalStack S3 emulation documentation
- `file-type` npm package — magic-byte MIME sniffing
- `image-size` npm package — dimension extraction without decode
