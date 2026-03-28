# 0003. Use Resend for transactional email

Date: 2026-03-28
Status: Accepted

## Context

The forgot password flow requires sending transactional emails (password reset links). Plot-Twist has no email infrastructure today. As a personal learning project, the provider must be free for low-volume use, quick to set up, and simple to integrate with NestJS.

## Decision Drivers

- Free tier: must support low-volume personal/development use indefinitely (no trial expiration)
- Setup speed: minimal configuration to get first email sent
- Developer experience: clean API, good documentation, straightforward Node.js SDK
- Production-realism: a provider that would be a reasonable choice for a real product, not just a dev hack
- Swappability: email sending should be abstracted so the provider can be replaced later

## Options Considered

### Option A: Resend

Modern transactional email API (founded 2023). REST-based with official Node.js SDK.

- Pro: Permanent free tier — 3,000 emails/month, 100/day, no expiration
- Pro: Simplest API surface of all options — sending an email is a single function call
- Pro: Excellent documentation and DX
- Pro: Production-viable — used by real companies, supports custom domains when needed
- Con: Newest provider — less battle-tested than SendGrid/SES at massive scale
- Con: Smaller ecosystem and community compared to established providers

### Option B: SendGrid (Twilio)

Industry-standard transactional email platform.

- Pro: Battle-tested at scale, widely adopted
- Pro: Free tier of 100 emails/day, no expiration
- Con: Account signup requires identity verification that can take days
- Con: More complex API and SDK — heavier setup for simple use cases
- Con: Dashboard and configuration are more complex than needed for this project

### Option C: AWS SES

Amazon's email sending service, cheapest at high volume.

- Pro: Extremely cost-effective at scale
- Pro: Deep AWS ecosystem integration
- Con: Requires AWS account setup, domain verification, and sandbox escape request
- Con: Highest setup complexity of all options
- Con: Free tier only applies when sending from EC2 instances
- Con: Overkill for a personal learning project

### Option D: Nodemailer + Gmail SMTP

Use Gmail's SMTP server directly via Nodemailer. Zero third-party signup.

- Pro: No account creation needed — works with existing Gmail account
- Pro: Nodemailer is the most widely used Node.js email library
- Con: Google periodically blocks SMTP access from apps, requiring re-authentication
- Con: Not production-viable — fragile and rate-limited
- Con: Sends from a personal Gmail address, which looks unprofessional
- Con: Google may require "less secure app access" or app-specific passwords

### Option E: Mailtrap

Email testing and sending platform with separate sandbox and production APIs.

- Pro: Built-in email testing sandbox useful during development
- Pro: 1,000 emails/month free tier
- Con: Lower free tier than Resend (1,000 vs 3,000/month)
- Con: Split between testing and sending APIs adds conceptual overhead

## Decision

We chose **Option A (Resend)** because it offers the best balance of simplicity, free tier generosity, and production-realism for a personal learning project. The API requires minimal boilerplate — sending an email is a single SDK call — and the permanent free tier of 3,000 emails/month is more than sufficient. While newer than SendGrid or SES, Resend is production-viable and its simplicity means less time on email infrastructure and more time on the actual forgot password logic.

The email provider will be abstracted behind an interface in the NestJS codebase, so switching to SendGrid or SES in the future would require changing only the implementation class, not the consuming code.

## Consequences

### Positive
- First email can be sent within minutes of setup — only requires an API key
- Generous free tier eliminates any cost concern for development and personal use
- Clean SDK reduces boilerplate in the codebase
- Provider abstraction means this decision is low-risk and easily reversible

### Negative / Trade-offs
- Adds a third-party service dependency for a core flow (password reset)
- Resend is newer and less proven at massive scale than SendGrid/SES (not relevant at this project's scale)
- Default sender domain is a Resend subdomain — emails may look less professional until a custom domain is configured

### Neutral / Watch
- If the project grows to need marketing emails, email templates, or analytics, evaluate whether Resend's feature set is sufficient or if a more full-featured provider is needed
- Monitor Resend's free tier terms — if they change, the provider abstraction makes switching straightforward
