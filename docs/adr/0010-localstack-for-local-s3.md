# 0010. LocalStack as the local S3 emulator

Date: 2026-05-13
Status: Accepted

## Context

The presigned POST + finalize protocol (ADR-0009) depends on real S3 semantics: presigned policy formatting, bucket policy, lifecycle, CORS. Integration tests written against an in-process mock of the AWS SDK cannot prove that the policy fields are formatted correctly enough for S3 to accept the upload — a mock returns whatever the test author tells it to return. We need a way to develop and test locally without an AWS account, on a substrate that actually speaks S3.

## Decision Drivers

- **Local dev should exercise the production code path.** A divergent local backend creates two contracts: the one CI proves and the one the developer's machine proves.
- **The integration test must run real S3 calls** against a real bucket, including presigned POST upload and policy evaluation, to catch breakage that a mock would silently hide.
- **No AWS account dependency for contributors.** Cloning the repo and `docker compose up` must be sufficient.

## Options Considered

### Option i: MinIO

- Pro: Lightweight, single-purpose, great web console
- Con: Different code paths in some edge cases (e.g., presigned POST policy nuances). Operationally fine, but one more diverging surface

### Option ii: LocalStack community edition *(chosen)*

- Pro: Same `S3Client` code path as production (only `endpoint` and `forcePathStyle` differ). Bucket policy, lifecycle, and CORS APIs match real S3
- Pro: A future need for SQS, SNS, or Secrets Manager extends the same container
- Con: Heavier image than MinIO (~500 MB pulled). Acceptable one-time cost
- Con: **Community S3 does not enforce policy `Deny` against anonymous reads.** A public GET of an object under `avatars/pending/` returns 200 locally; real AWS S3 returns 403. The design relies on defense in depth — the API never publishes a URL pointing at `pending/` — so this gap is dev-only, but it must be re-verified against a real bucket before production launch. *(Caught during Unit 2 implementation; documented in the plan's risk register.)*
- Con: As of 2026, the `localstack/localstack:latest` tag resolves to a Pro-licensed build that fails to start without `LOCALSTACK_AUTH_TOKEN`. We pin to `localstack/localstack:3` for the community release. *(Caught during Unit 2 implementation.)*

### Option iii: Filesystem fallback adapter

A non-S3 `IStoragePort` implementation that writes to `./uploads/` and serves via a static route.

- Pro: No Docker dependency
- Con: Different code path from production. Presigned URLs are emulated or non-existent. Policy semantics absent. Tests written against this would not catch broken policy formatting that real S3 rejects
- Con: We would write integration tests twice — once against the fallback, once against real S3 in CI — or accept that local tests do not prove the production contract

## Decision

**Option ii.** Local development uses LocalStack pinned to `localstack/localstack:3`. An `infra/localstack/init.sh` script (mounted into the container's init-aws hook) creates the bucket, applies CORS for the configured dev origins, applies a 1-day lifecycle rule on the `avatars/pending/` prefix, and applies a bucket policy that allows public read on `avatars/*` and explicitly denies it on `avatars/pending/*`.

A new Nx target `pnpm nx test:e2e api` wraps Jest with `NODE_OPTIONS=--experimental-vm-modules` because the AWS SDK uses dynamic imports internally for error wrapping in the smithy retry middleware. The unit and integration targets keep the standard Nx Jest executor.

## Consequences

### Positive

- The same `S3Client` code, configuration object, and presigned-POST policy run against LocalStack locally and against real S3 in production. The only deltas are `endpoint` and `forcePathStyle`.
- Bucket policy, CORS, and lifecycle rules are exercised by the dev environment, not just configured in production. Mis-formatted policies fail at `docker compose up`, not at deploy time.
- The same container will support SQS, SNS, Secrets Manager, and other AWS services if we adopt them later — no extra dev-infra to introduce.

### Negative / Trade-offs

- Local dev now requires three containers up (postgres, localstack, api). The `depends_on: condition: service_healthy` chain in `docker-compose.yml` handles this for `docker compose up`, but `pnpm nx serve api` directly assumes the operator has the infra running.
- LocalStack community does not enforce bucket policy `Deny` against anonymous reads (see Cons above). The pending-object protection in dev is carried by unguessable keys + lifecycle expiry, not by the policy. The policy must be re-verified on a real bucket during production rollout.
- AWS SDK v3's reliance on dynamic imports means the e2e Jest target needs `NODE_OPTIONS=--experimental-vm-modules`. We isolated this to a dedicated `test:e2e` target rather than polluting the global Jest configuration; unit and int tests are unaffected.

### Neutral / Watch

- The `localstack/localstack:latest` tag is unsafe to use (Pro-licensed). The pin to `:3` must be revisited when LocalStack 4 stabilizes and the licensing posture is re-checked.
- CORS origins are env-driven (`WEB_ORIGINS`, comma-separated). The default covers `localhost` and `127.0.0.1` on the two dev ports; new origins are an env change, not a script change.

## Related

- ADR-0008: Object storage lives in a generic `module/shared/storage` — the module whose `S3StorageAdapter` is exercised against LocalStack.
- ADR-0009: Two-phase presigned POST + finalize — the upload protocol whose policy semantics LocalStack must implement faithfully for our tests to prove anything.
