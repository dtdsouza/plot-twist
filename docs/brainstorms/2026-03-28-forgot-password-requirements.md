---
date: 2026-03-28
topic: forgot-password
---

# Forgot Password Flow

## Problem Frame

Users of Plot-Twist have no way to recover access to their account if they forget their password. The identity module currently only supports registration and login. Adding a forgot password flow is necessary before the app can be used by real people.

## Requirements

**Password Reset Flow**
- R1. User requests a password reset by submitting their email address
- R2. System sends an email containing a unique, one-time reset link
- R3. Reset link expires after 1 hour
- R4. Clicking the link allows the user to set a new password
- R5. After successful reset, the token is invalidated (single use)
- R6. Previous valid tokens for the same user are invalidated when a new reset is requested

**Security**
- R7. The forgot password endpoint always returns a generic success message regardless of whether the email exists (prevents user enumeration)
- R8. Reset tokens are stored hashed (not plaintext) in the database
- R9. Rate limiting on the forgot password endpoint to prevent abuse

**Email Infrastructure**
- R10. Use Resend as the email provider (free tier: 3K/month, 100/day)
- R11. Email sending is abstracted behind an interface so the provider can be swapped later

## Success Criteria

- A user who forgot their password can reset it via email without manual intervention
- Reset tokens cannot be reused or guessed
- The endpoint does not leak whether an email is registered

## Scope Boundaries

- No email verification on registration (separate feature)
- No "change password" for logged-in users (separate feature)
- No email template styling beyond functional plaintext/basic HTML
- No custom domain for sending emails (use Resend default sender for now)

## Key Decisions

- **Email provider: Resend** — simplest setup, generous permanent free tier, good DX
- **Reset method: Token-based link** — standard web approach, user clicks a URL
- **Token expiry: 1 hour** — good balance of security and UX for a book club app
- **Generic response: Yes** — prevents user enumeration attacks

## Dependencies / Assumptions

- Resend account and API key will be configured via environment variable
- The frontend (Next.js) will need a reset password page to handle the link, but that is out of scope for the API-side brainstorm

## Outstanding Questions

### Deferred to Planning
- [Affects R2][Technical] How to structure the email module — standalone NestJS module or part of identity?
- [Affects R8][Technical] Token generation strategy — crypto.randomBytes vs UUID v4 vs nanoid
- [Affects R11][Needs research] Best NestJS pattern for abstracting the email provider (e.g., @nestjs-modules/mailer vs custom service)

## Next Steps

-> `/ce:plan` for structured implementation planning
