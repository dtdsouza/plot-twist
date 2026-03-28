# 0004. Forgot password flow behavior decisions

Date: 2026-03-28
Status: Accepted

## Context

Adding a forgot password flow to the identity module requires several security and UX decisions: how to deliver the reset credential, how long it remains valid, how to store it, and what information to reveal to the requester. These decisions balance user convenience against common attack vectors (user enumeration, token theft, brute force).

## Decision Drivers

- Security: the flow must not introduce vulnerabilities common in password reset implementations
- User experience: the flow should be straightforward for a book club app — not as restrictive as banking
- Simplicity: avoid over-engineering for a personal project while still following security best practices
- Standards alignment: follow OWASP recommendations for password reset flows

## Decisions

### 1. Reset method: Token-based link (not OTP code)

The user receives an email with a URL containing a unique token. Clicking the link opens a page where they set a new password.

**Why not a 6-digit code?** Codes are better suited for mobile-first apps where the user stays in the same app context. For a web-based book club app, a clickable link is the standard UX — it requires one click instead of copying a code between email and browser.

### 2. Token expiry: 1 hour

Reset links expire 1 hour after creation.

**Why 1 hour?** This balances security and usability for a casual book club app. 15 minutes is standard for financial apps but unnecessarily restrictive here — users may not check email immediately. 24 hours creates a wider attack window than needed. 1 hour gives enough time for reasonable email delays while limiting exposure.

### 3. Generic response on forgot password request

The `POST /api/auth/forgot-password` endpoint always returns the same success response regardless of whether the email exists in the system.

**Why?** This prevents user enumeration attacks, where an attacker submits emails to discover which ones have accounts. The OWASP Forgot Password Cheat Sheet explicitly recommends this approach. The response will be something like: "If an account with that email exists, we have sent a password reset link."

**Trade-off:** A user who misspells their email will not know the request failed. This is acceptable — the alternative (leaking account existence) is a worse outcome for security.

### 4. Hashed token storage

Reset tokens are stored hashed (SHA-256) in the database, not in plaintext.

**Why?** If the database is compromised, plaintext tokens would allow an attacker to reset any user's password. Hashing the token means that even with database access, the attacker cannot reconstruct the original URL. SHA-256 is sufficient here (unlike passwords, tokens are high-entropy random values that do not benefit from bcrypt's slow hashing).

### 5. Single-use tokens with invalidation on new request

- A token is invalidated immediately after successful password reset
- When a user requests a new reset, all previous tokens for that user are invalidated

**Why?** Single-use prevents replay attacks. Invalidating old tokens on new request ensures only the latest link works, reducing the window of exposure if an earlier email was intercepted.

### 6. Rate limiting on the forgot password endpoint

The endpoint will be rate-limited to prevent abuse (exact limits to be determined during planning).

**Why?** Without rate limiting, an attacker could flood a user's inbox or use the endpoint to probe for valid emails via timing attacks. Rate limiting is a basic defense recommended by OWASP for any authentication-adjacent endpoint.

## Consequences

### Positive
- The flow follows OWASP best practices for password reset security
- Generic responses prevent user enumeration without complex timing-equalization logic
- Hashed storage and single-use tokens limit damage from both database and email compromises
- 1-hour expiry is user-friendly while limiting attack windows

### Negative / Trade-offs
- Generic responses mean users who mistype their email get no feedback — this may cause confusion
- 1 hour is more permissive than the most secure option (15 minutes) — acceptable risk for a book club app
- Rate limiting adds implementation complexity to a personal project

### Neutral / Watch
- If the app adds email verification for registration, the generic response pattern should be applied consistently there as well
- If mobile clients are added later, consider supporting OTP codes as an alternative reset method alongside links
