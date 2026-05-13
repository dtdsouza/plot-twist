# 7. Email-change flow with re-verification

Date: 2026-05-11
Status: Accepted

## Context

Authenticated users need to be able to change the email address tied to their account. The forgot-password flow (ADR 0004) already establishes patterns for hashed tokens, Resend transactional email, and generic-message responses — but those rules were chosen for an unauthenticated flow whose goal is account recovery without leaking which emails are registered. Email change runs in a different context:

- The user is **already authenticated**, so anti-enumeration silence around the *user's own* identity has less value.
- The action **mutates** the account's primary identifier and login credential; if the verification link is intercepted, the new owner can lock the original user out.
- The user actively wants feedback — "did the change go through?" — which a fully generic 200 response cannot give without round-tripping to the new mailbox.

We need to either (a) reuse ADR 0004's rules verbatim, (b) build a deliberately different flow that documents its divergences, or (c) treat email change as a support-ticket-only operation and defer it indefinitely.

## Decision Drivers

- **Account-takeover prevention** — the verification must prove control of the new address before the swap happens.
- **UX clarity at the point of failure** — when a change fails, the user needs to know enough to retry without contacting support.
- **Reuse over reinvention** — wherever the forgot-password mechanics fit, reuse them.
- **MVP scope ceiling** — the broader rate-limiting and session-revocation work was explicitly deferred from PR #8.

## Options Considered

### Option A: Reuse ADR 0004 verbatim (anti-enumeration parity)

Apply the forgot-password rules unchanged: generic 200 response regardless of newEmail availability, 30-minute token TTL, no concurrent-change semantics defined.

- Pro: One consistent rule across both flows; least cognitive load.
- Pro: No new enumeration vector — an attacker who steals an authenticated session cannot probe which emails are registered.
- Con: A legitimate user whose `newEmail` is already taken gets a "check your inbox" success message and waits indefinitely for an email that will never arrive.
- Con: 30 minutes is tight for email change — the user may not have immediate access to the new mailbox.
- Con: Leaves the concurrent-attempt question silently undefined; first implementer makes a quiet choice.

### Option B: Two-step re-verification with explicit divergences (chosen)

Build a flow modeled on ADR 0004 but make three deliberate departures: return `409 Conflict` on duplicate emails, extend the token TTL to 60 minutes, and specify a one-pending-change-per-user policy where re-initiate overwrites any existing pending token.

- Pro: User gets actionable feedback on the most common failure (newEmail already in use) without round-tripping to a mailbox that may not even exist.
- Pro: Longer TTL accommodates real-world mailbox-access patterns (different device, work vs. personal account).
- Pro: Single-pending policy makes the "I made a typo, let me re-send" case work without extra UX.
- Con: An authenticated attacker (with a stolen JWT) can probe arbitrary emails by submitting them as `newEmail` and watching for 409 vs 200. Acknowledged enumeration vector.
- Con: Diverges from ADR 0004 — future contributors must consult both ADRs to know which rule applies.
- Con: Silent-replacement of pending tokens enables a hostile-email-DOS variant (repeatedly trigger verification emails to a victim address). Mitigated by the action being JWT-gated and by Resend's own deliverability protections; not eliminated.

### Option C: Defer email change indefinitely (support-only)

Don't implement email change in-product; route it through a human support process.

- Pro: Zero attack surface added.
- Pro: Trivial to implement (nothing).
- Con: Doesn't scale; manual support work for every email change.
- Con: Pushes a routine operation onto the slowest, highest-cost channel.
- Con: The handoff designs already include the UI; partial implementation creates worse confusion than a full one.

## Decision

We chose **Option B — two-step re-verification with explicit divergences from ADR 0004**.

The complete rule set for email change:

| Property | Email change | Compare: ADR 0004 (password reset) |
|---|---|---|
| Authentication required to initiate | Yes (JWT) | No (public) |
| Current password required to initiate | Yes (bcrypt-verified) | No (email alone) |
| Duplicate-target response | `409 Conflict` with generic-ish message | Generic 200 (anti-enumeration) |
| Token TTL | **60 minutes** | 30 minutes |
| Token storage | SHA-256 hash; raw token in URL only | Same |
| Single-use | Yes (row deleted on verify) | Same |
| Concurrent attempts | Latest overwrites; one pending per user | Not specified |
| Verify endpoint auth | Public (token is the proof) | Same |
| On success | Atomic email swap + token delete | Atomic password update + token delete |
| JWT invalidation on success | **Deferred** — pre-change tokens remain valid until expiry | n/a (no session existed) |
| Notify current email of the change attempt | **Deferred** — out of MVP scope | n/a |
| Rate limiting | **Deferred** — applies to all credential endpoints uniformly when introduced | Same |

The flow ships as:

- `POST /user/me/email-change` (JWT-guarded): verify current password → reject if `newEmail` equals current email (400) → reject if `newEmail` is in use (409) → delete any pending tokens for this user → generate token, hash, persist with 60-min TTL → send Resend verification email to `newEmail` → return generic success.
- `POST /auth/verify-email-change` (public, token-authenticated): hash incoming token → look up → reject if missing or expired (410) → transactionally swap `user.email` and delete the token → return success with the new email.

We accept the enumeration tradeoff because the attacker model that benefits most from anti-enumeration (an outsider probing the registration system) is not present here — the endpoint is JWT-gated. An attacker who has already stolen a session has access to enumeration vectors that are more reliable than this one (e.g., the existing registration endpoint's behavior, the user's own contacts, etc.).

We accept deferred JWT invalidation as a known-bounded window: any pre-change session token continues to carry the old email claim until its natural expiry. The frontend mitigates the most visible symptom by forwarding `/api/auth/me` to the backend (so the visible-state staleness window is one network round-trip, not one JWT TTL); the residual risk lives in any backend code that trusts the JWT's `email` claim authoritatively, which today is none.

## Consequences

### Positive

- Users get actionable feedback when an email is already in use, without a silent-success-and-no-email failure mode.
- Single-pending-change UX is predictable: re-initiate is the natural "fix my typo" action, no special path needed.
- The flow reuses ADR 0004's token-hashing, Resend mail service, and entity shape — implementation is mostly mechanical translation rather than novel design.
- Future credential-change flows (phone number, recovery email, 2FA enrollment) have a documented precedent that distinguishes "in-app authenticated change" rules from "unauthenticated recovery" rules.

### Negative / Trade-offs

- **Enumeration via 409 on initiate.** An authenticated attacker can probe which emails are registered. We've judged this acceptable because the endpoint is JWT-gated and the marginal information leaked is small relative to existing surfaces.
- **Silent overwrite of pending tokens.** Re-initiate replaces any existing pending change for the same user. This enables a hostile-email-DOS variant where a compromised session repeatedly emails a victim address. Mitigation today is just "the action requires a valid JWT and Resend's deliverability protections"; a per-user cooldown is the obvious next defense and is deferred.
- **No notification to the current email when a change is initiated.** A compromised session can rotate the user's email without the original owner getting any warning channel. This is a real account-takeover surface that the deferred follow-up must close.
- **JWT invalidation deferred.** Pre-change tokens remain valid until natural expiry. The window is bounded by the configured JWT TTL, but it's non-zero.

### Neutral / Watch

- **Revisit when adding the second credential-change flow** (phone, recovery email, 2FA enrollment). If the second flow chooses Option A's rules, this ADR should be downgraded to "email-only" and a broader pattern ADR drafted. If two flows in a row choose Option B, generalize.
- **Revisit when rate limiting lands.** The rate limiter should treat all four credential endpoints uniformly (`/auth/login`, `/auth/change-password`, `/user/me/email-change`, `/auth/verify-email-change`) rather than special-casing this flow.
- **Revisit when session revocation lands.** If `passwordChangedAt` (or a `tokenVersion` claim) is introduced, this ADR's "JWT invalidation deferred" line should be updated and the verify endpoint should bump the version alongside the email swap.
- **`identity.email_change_token` table has no sweeper.** Expired rows accumulate until manual cleanup. Volume should stay low (one row per pending change per user, all short-lived), but a scheduled deletion job is the obvious follow-up if it grows.
- **No audit log entry is written on email swap.** When auditing infrastructure exists, the swap should emit an `email.changed` event with the old and new addresses.
