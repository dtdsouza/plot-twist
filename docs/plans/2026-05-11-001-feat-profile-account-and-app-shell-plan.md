---
title: "feat: Profile/Account pages + app shell (Topbar/Sidebar) + placeholder routes"
type: feat
status: active
date: 2026-05-11
---

# feat: Profile/Account pages + app shell (Topbar/Sidebar) + placeholder routes

## Overview

Translate the handoff design (`Plot Twist-handoff.zip`) into the Next.js app:

1. Build a shared signed-in **app shell** (Topbar + Sidebar) under a new `(app)` route group, matching the handoff `Topbar` and `SideNav` components.
2. Ship two functional pages — **Profile** (`/profile`) and **Account** (`/account`) — wired to real backend endpoints.
3. Scaffold five placeholder routes — **Reading Desk** (`/`, replacing the Nx starter), **My Clubs** (`/clubs`), **Bookshelf** (`/bookshelf`), **Discover** (`/discover`), **Notifications** (`/notifications`) — each rendering a "coming soon" state inside the shell.
4. Add the backend endpoints that Profile and Account require: `PATCH /user/me` (profile fields), `POST /auth/change-password`, and a two-step email change with email re-verification (`POST /user/me/email-change` → `POST /auth/verify-email-change`).
5. Widen the auth middleware to protect every signed-in route.

## Problem Frame

The Next.js app currently exposes only the four `(auth)` screens and the Nx-generated welcome page at `/`. There is no signed-in chrome (no header, no sidebar), no profile or account pages, and no destination for an authenticated user after login (`AuthProvider.login()` pushes to `/`, which still shows the Nx starter). The handoff bundle provides finished designs for the full signed-in surface, but every screen beyond auth is missing. This plan ships the Profile and Account pages — the only two screens with self-contained data — plus the shell and placeholder routes that make the navigation feel real.

The handoff's `ScreenProfile` and `ScreenAccount` (`/tmp/plot-twist-handoff/plot-twist/project/screens-extra.jsx:252-400`) drive the field list: display name, username, bio, avatar, favorite genres, currently reading, email, time zone, password, notification preferences. The current `UserEntity` (`apps/api/src/module/identity/persistence/entity/user.entity.ts`) covers only `email`, `passwordHash`, `displayName`, `avatar`, `bio`, `status`. Anything beyond that set is out of scope for this plan and rendered as a visual stub.

## Requirements Trace

**Functional (Profile / Account)**

- **R1.** Signed-in user can view their profile fields prefilled from `GET /user/me` on `/profile`.
- **R2.** Signed-in user can edit and persist `displayName`, `bio`, and `avatar` via `PATCH /user/me`; success surfaces inline.
- **R3.** Signed-in user can change their password on `/account` via `POST /auth/change-password` (requires current password, new password, confirm).
- **R4.** Signed-in user can initiate an email change on `/account` via `POST /user/me/email-change` (requires current password + new email); a verification email is sent to the new address.
- **R5.** Clicking the verification link lands the user on `/verify-email-change?token=<raw>`, which calls `POST /auth/verify-email-change` and renders success/failure inline.
- **R6.** All signed-in pages render the shared Topbar + Sidebar shell.
- **R7.** Sidebar items: Reading Desk, My Clubs, Bookshelf, Settings (the Settings entry is "active" on `/profile` and `/account`).
- **R8.** Unauthenticated users hitting any `(app)` route are redirected to `/login` by middleware.

**Visual (translated from the handoff)**

- **V1.** Match handoff layout: `bg-paper` background, Topbar across the top (logo left; search/bell/avatar right), 240px-wide Sidebar on the left, content column to the right (max-width ~720px for Profile/Account).
- **V2.** Match handoff typography tokens already exposed in `apps/web/src/app/global.css` (Young Serif headings, Newsreader body, Karla labels).
- **V3.** Profile card: large avatar w/ upload button, two-column grid (Display name / Username), single-column Bio with 240-char counter, Favorite genres pill list (visual stub), Currently reading card (visual stub), Save/Cancel footer.
- **V4.** Account: three `SettingsCard`s — Email & sign-in (email + time zone), Change password (current/new/confirm), Notifications (toggle list — visual stub); footer with "Sign out of all devices" and "Delete my account" (both visual stubs in this plan).
- **V5.** Placeholder pages render the shell + a centered "coming soon" empty state styled with `Eyebrow` + serif headline + muted italic copy.

## Scope Boundaries

**In scope**

- Frontend route group `(app)` with shared Topbar/Sidebar layout
- `/profile`, `/account` fully wired
- Placeholder pages for `/`, `/clubs`, `/bookshelf`, `/discover`, `/notifications`
- Middleware protecting the above
- Backend: `PATCH /user/me`, `POST /auth/change-password`, `POST /user/me/email-change`, `POST /auth/verify-email-change`
- Resend email template for email-change verification
- TypeORM migration for the new `email_change_token` table

**Out of scope (deferred)**

- Username field on UserEntity (the handoff shows `@jane.reads` but the entity has no `username` column; rendered as a read-only stub showing display-name-derived placeholder). Adding `username` would require a unique-constraint migration + handle-collision UX, which is a separate concern.
- Favorite genres (no books/taxonomy domain yet)
- Currently reading (depends on books domain)
- Time zone persistence (no `timezone` column; rendered editable but not persisted with a "Coming soon" hint)
- Notification preferences persistence (no prefs entity)
- "Sign out of all devices" and "Delete my account" actions (visual only)
- Search bar functionality and bell-notification dropdown (visual only in the Topbar)
- Mobile/responsive design — the handoff is fixed-width 1280px; we ship the desktop layout and accept that smaller viewports will scroll horizontally for now
- Tests for the web app — `apps/web` has no Jest config (consistent with `2026-05-03-001-feat-forgot-reset-password-ui-plan.md`). Verification is via TypeScript checks and the running dev server. Backend tests follow the existing identity-module pattern.

## Context & Research

### Relevant Code and Patterns

**Frontend**

- **Auth route group:** `apps/web/src/app/(auth)/layout.tsx` — wraps children in a CSS grid with `BrandPanel`. New `(app)/layout.tsx` follows the same shape but uses Topbar + Sidebar.
- **Auth provider:** `apps/web/src/lib/auth-context.tsx` exposes `user`, `isLoading`, `login`, `register`, `logout`. Profile/Account pages will read `user` and re-fetch via a new `updateProfile` helper (added to the context).
- **Existing api-client:** `apps/web/src/lib/api-client.ts` — pattern is one `async function` per endpoint with `AuthApiError` + `handleResponse<T>`. New endpoints get the same shape.
- **Middleware:** `apps/web/src/middleware.ts` currently protects only `/` and matches a fixed list. Needs widening; the matcher pattern still uses an explicit array.
- **Auth-cookie shape:** `apps/web/src/app/api/auth/me/route.ts` decodes the JWT payload directly to return user fields. After a profile update, the JWT payload becomes stale; the page should re-fetch via `/api/auth/me` (which decodes the cookie locally) or, better, switch `/api/auth/me` to forward to the backend `GET /user/me` so updates surface without re-issuing the JWT. **Decision:** switch `/api/auth/me` to forward to the backend so freshness is automatic (see Key Technical Decisions).
- **CSS module + custom component pattern:** Auth components co-locate `*.tsx` + `*.module.css` (e.g., `apps/web/src/components/auth/login-form.tsx` + `login-form.module.css`). New components follow this.
- **Design tokens:** `apps/web/src/app/global.css` already exposes the cream/dark-green/terracotta palette. The handoff `tokens.css` introduces additional tokens (`--color-surface`, `--color-surface-2`, `--color-muted`, `--color-accent`, `--color-border-soft`, shadow tokens). These need to be added to `global.css`. The fonts are already loaded via `next/font/google` in `apps/web/src/app/layout.tsx`.

**Backend**

- **Domain structure:** `apps/api/src/module/identity/` follows `core/` (services), `http/` (controllers, DTOs, guards, decorators), `persistence/` (entities, repositories, enums, interfaces), `migrations/`. New code stays inside this domain.
- **Existing controllers:** `apps/api/src/module/identity/http/controller/auth.controller.ts` (login, register, forgot/reset password) and `user.controller.ts` (GET /me, GET /:id, JWT-guarded). New endpoints split cleanly: profile patch + email-change initiate on `UserController` (already JWT-guarded), password change + email-change verification on `AuthController` (verification endpoint must remain public since the token is the proof).
- **Existing JWT guard + decorator:** `apps/api/src/module/identity/http/guard/jwt-auth.guard.ts` + `apps/api/src/module/identity/http/decorator/current-user.decorator.ts` — reuse on the new authenticated routes.
- **Password reset analog:** `password-reset-token.entity.ts` is the model for the new `email_change_token.entity.ts` (single-use hashed token, `userId`, `expiresAt`, plus a `newEmail` column). The 2026-03-28 forgot-password plan is the reference implementation for the entity + hashed-token + Resend-email + verify-endpoint flow.
- **DTOs use class-validator** (`@IsEmail`, `@IsString`, `@MinLength`, etc.). Existing DTOs (`register.dto.ts`, `reset-password.dto.ts`) are the pattern.
- **Mail:** `apps/api/src/module/shared/mail/resend-email.service.ts` — already configured, sends transactional email via Resend. Add a `sendEmailChangeVerification` method following `sendPasswordResetEmail`.
- **Schema isolation (mandatory):** new entity must declare `@Entity({ schema: 'identity', name: 'email_change_token' })` per `docs/STATE-ISOLATION.md`. The migration creates the table inside the `identity` schema only.
- **Application-side UUIDs:** `docs/adr/0005-application-side-uuid-generation.md` — new entity inherits `BaseEntity` which already handles UUID generation.

### Institutional Learnings

- **Plan style:** `docs/plans/2026-05-03-001-feat-forgot-reset-password-ui-plan.md` is the closest precedent — same Stitch/handoff → Next.js workflow. It established the convention of carrying handoff designs into the existing CSS-module + custom-component pattern rather than introducing styled-components or Tailwind. We follow it.
- **Forgot-password ADR (`0004-forgot-password-flow-behavior.md`):** Reset endpoints return a generic message regardless of email validity to avoid account enumeration; tokens are hashed at rest; one-time use. The same rules apply to the email-change verification flow.
- **Module isolation (ADR `0002`, `0006`):** Cross-module imports use `@module/*` aliases pointing to barrels. New imports inside the identity module stay relative.
- **Branch coverage learning** (`MEMORY.md`): The identity module accepts 78% branch coverage due to TypeScript decorator metadata. New unit tests follow the same pattern; the threshold does not need adjustment unless new unreachable branches drop coverage below 78%.

### External References

- **Next.js App Router route groups:** `(app)` / `(auth)` are non-URL-affecting groupings; each can have its own `layout.tsx`. Used here so signed-in pages share a layout without polluting URL paths.
- **`next/navigation`:** `usePathname` to compute the active sidebar item.

## Key Technical Decisions

- **Use a Next.js route group `(app)` for the signed-in shell.** Mirrors the existing `(auth)` group and keeps Topbar/Sidebar in one place. *Rationale:* matches Next.js 16 idioms and the project's existing convention; avoids prop-drilling layout into every page.
- **Split backend endpoints across two controllers.** `UserController` (JWT-guarded) handles `PATCH /user/me` (profile fields) and `POST /user/me/email-change` (initiate). `AuthController` handles `POST /auth/change-password` (JWT-guarded inline) and `POST /auth/verify-email-change` (public, token-authenticated). *Rationale:* keeps the public verify endpoint outside the JWT guard exactly like `POST /auth/reset-password`, while authenticated actions live on `UserController`.
- **Two-step email change with re-verification, modeled on the forgot-password flow.** Initiate stores a hashed token + new email + expiry in `identity.email_change_token`; Resend emails the new address; verify validates and atomically (1) updates `user.email`, (2) deletes the token, (3) invalidates all existing JWTs for that user is **deferred** — we accept that an unexpired pre-change JWT remains valid until natural expiry (typical for this complexity tier; matches password-reset behavior). *Rationale:* parity with the existing reset-password flow; reuses the Resend mail service; avoids account enumeration on the verification endpoint.
- **Switch `/api/auth/me` (Next.js route) from JWT-decode-only to a forwarded backend call.** *Rationale:* after `PATCH /user/me`, the cookie's JWT payload becomes stale. Forwarding ensures the page always reads the latest user record. Alternative (re-issuing the JWT on every profile update) is more code and requires changes in `AuthService` and the cookie setter. (Trade-off: one extra network hop per `/me` call.)
- **Add a `updateUserProfile` method to `AuthProvider`.** Single source of truth for the local `user` state; the Profile page calls it and the context updates without a full reload.
- **Render fields with no backend support (username, genres, currently reading, time zone, notifications, sign-out-everywhere, delete-account) as visual stubs.** Each is implemented but its Save action is either disabled or routes through a noop with a small "Coming soon" toast/inline message. *Rationale:* the user requested the full UI; deferring fields cleanly is preferable to scope creep into a books domain or a preferences entity.
- **Extend `apps/web/src/app/global.css` with the handoff token set (`--color-surface`, `--color-muted`, `--color-accent`, `--color-surface-2`, etc.) and the `bg-paper` noise overlay.** *Rationale:* the handoff `tokens.css` is small and self-contained; merging it into the existing token file keeps the design system in one place.
- **Sidebar uses `usePathname()` to compute the active item.** *Rationale:* simpler and more correct than threading an `active` prop through every page; matches the App Router pattern.
- **Email-change verification uses raw token in the URL, hashed at rest.** *Rationale:* identical to the password-reset behavior in ADR `0004`; reuses the same crypto utilities.
- **Token TTL: 60 minutes for email-change** (vs. 30 for password reset). *Rationale:* email-change verification is less time-sensitive and the user may not have immediate access to the new mailbox.

## Open Questions

### Resolved During Planning

- **Username field?** Not added in this plan. Rendered read-only on the Profile page as a derived value (`@<lowercased-display-name>`). *Resolution:* avoids a schema change + uniqueness migration in this scope.
- **Where do the new tokens live?** Merged into `apps/web/src/app/global.css`. *Resolution:* keeps the design system co-located.
- **Sidebar `active` state?** Computed from `usePathname()` in a client component. *Resolution:* idiomatic for App Router.
- **Should `/profile` and `/account` be one page with tabs?** No — the handoff treats them as sibling routes and the sidebar's Settings entry is "active" on both. *Resolution:* two routes, both rendered under `(app)/`.
- **Bio max length?** Cap at 240 characters in the DTO (`@MaxLength(240)`) to match the UI counter. *Resolution:* server-side cap is mandatory — leaving `bio: text` unbounded is a storage-abuse and stored-XSS surface; the UI cap is not enough on its own. Unit 5 reflects this.

### Deferred to Implementation

- **Avatar upload mechanics.** The handoff shows an upload control but no backend upload endpoint exists. Implementation should accept a URL field in `PATCH /user/me` (consistent with `UserEntity.avatar: string`) and treat the "Upload new" button as a stub that opens a file picker but doesn't actually upload. Real upload is a future concern.
- **JWT invalidation strategy on password / email change.** Out of scope; current sessions remain valid until natural expiry.
- **Whether to add a unique constraint on `email_change_token.userId`** so a user can only have one pending change. Practical implementation may need this for UX; decide while writing the entity.

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

**Route map (Next.js)**

```
app/
├── (auth)/                 # existing — split-screen layout, public
│   ├── layout.tsx
│   ├── login/page.tsx
│   ├── register/page.tsx
│   ├── forgot-password/page.tsx
│   └── reset-password/page.tsx
├── (app)/                  # NEW — Topbar + Sidebar layout, protected
│   ├── layout.tsx          # renders Topbar + Sidebar + <main>{children}</main>
│   ├── page.tsx            # / — Reading Desk placeholder (replaces Nx starter)
│   ├── clubs/page.tsx      # placeholder
│   ├── bookshelf/page.tsx  # placeholder
│   ├── discover/page.tsx   # placeholder
│   ├── notifications/page.tsx # placeholder
│   ├── profile/page.tsx    # functional
│   └── account/page.tsx    # functional
├── verify-email-change/    # NEW — public landing page for email-change link
│   └── page.tsx
├── api/                    # existing
│   └── auth/me/route.ts    # MODIFIED — forwards to backend GET /user/me
└── layout.tsx              # existing root layout
```

**Backend endpoints (new)**

| Verb | Path | Auth | Body | Effect |
|---|---|---|---|---|
| PATCH | `/user/me` | JWT | `{ displayName?, bio?, avatar? }` | Updates the row; returns `IUserResponse` |
| POST | `/user/me/email-change` | JWT | `{ currentPassword, newEmail }` | Validates pw + email uniqueness, creates `email_change_token`, sends Resend mail to `newEmail` |
| POST | `/auth/change-password` | JWT | `{ currentPassword, newPassword }` | Validates current pw, updates `passwordHash` |
| POST | `/auth/verify-email-change` | public (token) | `{ token }` | Hashes + looks up token, swaps `user.email`, deletes token |

**Email-change flow (sequence)**

```
[Web /account] --POST /user/me/email-change--> [API]
                                                 ├─ verify current password
                                                 ├─ ensure newEmail not in use
                                                 ├─ create EmailChangeToken (hash, newEmail, exp +60m)
                                                 └─ Resend email to newEmail with /verify-email-change?token=<raw>
                              <----- 200 { message: "Check your new inbox" }

[New inbox] --click link--> [Web /verify-email-change?token=…] --POST /auth/verify-email-change--> [API]
                                                                                                    ├─ hash + find token
                                                                                                    ├─ expired? -> 410
                                                                                                    ├─ swap user.email
                                                                                                    └─ delete token
                                                                          <----- 200 success / 4xx failure
                            [Web] renders success or "link expired" inline
```

**Sidebar active-state mapping**

| Pathname matches | Active item |
|---|---|
| `/` | Reading Desk |
| `/clubs*` | My Clubs |
| `/bookshelf*` | Bookshelf |
| `/profile`, `/account` | Settings |
| `/discover`, `/notifications` | (no sidebar match — header items) |

## Implementation Units

- [ ] **Unit 1: Add design tokens + paper background to `global.css`**

**Goal:** Make the handoff's full token set available app-wide so all subsequent UI uses CSS variables instead of hardcoded values.

**Requirements:** V2

**Dependencies:** none

**Files:**
- Modify: `apps/web/src/app/global.css`

**Approach:**
- Append the missing tokens from `/tmp/plot-twist-handoff/plot-twist/project/tokens.css` to the existing `:root` block: `--color-surface`, `--color-surface-2`, `--color-muted`, `--color-accent`, `--color-border-soft` (rename from `--color-border` only if a conflict exists; current `global.css` already defines `--color-border` with the same value), `--radius-card`, `--radius-img`, `--radius-btn`, `--shadow-soft`, `--shadow-book`, `--shadow-sm`.
- Add the `.bg-paper` class + `::before` noise overlay from the handoff (the SVG-data-URI version) verbatim.
- Remove the Nx-starter-specific classes (`#welcome`, `#hero`, `#middle-content`, `#nx-cloud`, etc.) — they exist only to style the page being replaced in Unit 9. Keep base resets.

**Patterns to follow:**
- Existing token block at the top of `apps/web/src/app/global.css`.

**Test scenarios:** *(visual verification only — no Jest in apps/web)*
- *Happy path:* `dev` server renders the existing auth pages unchanged after token additions.
- *Edge case:* No console errors related to undefined CSS variables after removing the Nx-starter blocks.

**Verification:**
- `pnpm nx serve web` boots; visiting `/login` looks identical to before.
- New tokens resolve in DevTools when inspected on a `:root` element.

---

- [ ] **Unit 2: Build shared shell components (Topbar, Sidebar, AppEmptyState)**

**Goal:** Implement the chrome components used by every `(app)` route.

**Requirements:** R6, R7, V1, V5

**Dependencies:** Unit 1

**Files:**
- Create: `apps/web/src/components/app-shell/topbar.tsx` + `topbar.module.css`
- Create: `apps/web/src/components/app-shell/sidebar.tsx` + `sidebar.module.css`
- Create: `apps/web/src/components/app-shell/sidebar-item.tsx` (private to sidebar; can be inlined if trivial)
- Create: `apps/web/src/components/app-shell/app-empty-state.tsx` + `app-empty-state.module.css`
- Create: `apps/web/src/components/icons/` — add the icons the shell needs that don't yet exist (`search`, `bell`, `menu-book`, `users`, `library`, `settings`). Match the inline-SVG style of `book-icon.tsx`.

**Approach:**
- `Topbar` is a server component (no client state). Renders logo (reuse `BookIcon` + a `<span>Plot-Twist</span>` wordmark, mirroring `LogoMark` in `shared.jsx`), then search button + bell + avatar+name on the right. Search and bell are non-functional buttons (visual only).
- `Sidebar` is a **client component** (uses `usePathname()`). Renders "Signed in as" + display name (read from `useAuth().user`), then the four nav items + divider + Settings item. Each item is a Next.js `<Link>` with active state computed from pathname (see mapping in High-Level Technical Design).
- `AppEmptyState` accepts `{ eyebrow, title, body }` and renders the centered "coming soon" layout used by every placeholder page.

**Patterns to follow:**
- CSS-module-per-component (`apps/web/src/components/auth/login-form.tsx` + `login-form.module.css`)
- Inline-SVG icon style (`apps/web/src/components/icons/book-icon.tsx`)

**Test scenarios:**
- *Happy path (Topbar):* Renders user's display name and avatar when `useAuth().user` is non-null; falls back to a placeholder avatar otherwise.
- *Happy path (Sidebar):* On `/profile`, Settings is highlighted. On `/clubs`, My Clubs is highlighted. On `/`, Reading Desk is highlighted.
- *Edge case (Sidebar):* On `/clubs/anything-deeper`, My Clubs is still highlighted (prefix match, not exact).
- *Edge case (AppEmptyState):* Renders body and title; missing optional `eyebrow` doesn't crash layout.

**Verification:**
- Components import-compile under `pnpm nx typecheck web`.
- Visual diff against the handoff `Topbar` and `SideNav` is acceptable to a reviewer.

---

- [ ] **Unit 3: Create the `(app)` route group layout + route shim**

**Goal:** Mount Topbar + Sidebar around every signed-in page; ensure the root layout still provides fonts.

**Requirements:** R6, V1

**Dependencies:** Unit 2

**Files:**
- Create: `apps/web/src/app/(app)/layout.tsx`
- Create: `apps/web/src/app/(app)/layout.module.css`

**Approach:**
- Server component layout. Render `<div className={styles.paper}>` (applies `.bg-paper`), then `<Topbar />`, then a flex/grid row with `<Sidebar />` and `<main className={styles.main}>{children}</main>`.
- Container grid matches the handoff: `display: grid; grid-template-columns: 240px 1fr; gap: 32px; padding: 24px 40px 60px;` on the row below the topbar.
- Inherits fonts from the root layout — no need to re-declare.

**Patterns to follow:**
- `apps/web/src/app/(auth)/layout.tsx` for route-group layout shape.

**Test scenarios:**
- *Integration:* Rendering any `(app)/<route>/page.tsx` includes the Topbar at the top and Sidebar on the left.
- *Edge case:* `(auth)/login` does NOT inherit this layout (verifies route-group isolation).

**Verification:**
- Visit `/profile` (Unit 5) → shell renders. Visit `/login` → split-screen `BrandPanel` still renders.

---

- [ ] **Unit 4: Widen middleware to protect all `(app)` routes + add the `verify-email-change` public route**

**Goal:** Redirect unauthenticated users away from signed-in pages; allow the email-change verify page through unauthenticated (token is the proof).

**Requirements:** R8

**Dependencies:** none (can land in any order, but easiest after the new routes exist)

**Files:**
- Modify: `apps/web/src/middleware.ts`

**Approach:**
- Expand `PROTECTED_ROUTES` to `['/', '/profile', '/account', '/clubs', '/bookshelf', '/discover', '/notifications']`.
- Use prefix matching (`pathname === r || pathname.startsWith(r + '/')`) rather than exact-match, so future nested routes inherit protection automatically.
- Expand the `matcher` regex to a pattern that covers all of the above plus the existing auth routes and `/verify-email-change`. Use a single regex like `'/((?!api|_next|favicon).*)'` if it works with Next.js 16, or list explicitly.
- Verify-email-change page is public (not in PROTECTED_ROUTES, not in AUTH_ROUTES).

**Patterns to follow:**
- Existing `apps/web/src/middleware.ts`.

**Test scenarios:**
- *Happy path:* Unauthenticated request to `/profile` 302s to `/login`.
- *Happy path:* Authenticated request to `/login` 302s to `/`.
- *Happy path:* Unauthenticated request to `/verify-email-change?token=xyz` 200s (page loads, can call the verify endpoint).
- *Edge case:* `/api/auth/me` is not redirected (matcher excludes `/api`).
- *Edge case:* Nested route `/clubs/something` is protected (prefix match).

**Verification:**
- `curl -I http://localhost:4200/profile` returns 302 to `/login` when no `token` cookie is sent.

---

- [ ] **Unit 5: Backend — `PATCH /user/me` endpoint**

**Goal:** Persist profile-field changes (`displayName`, `bio`, `avatar`).

**Requirements:** R2

**Dependencies:** none

**Files:**
- Create: `apps/api/src/module/identity/http/dto/update-profile.dto.ts`
- Modify: `apps/api/src/module/identity/http/controller/user.controller.ts` (add `@Patch('me')`)
- Modify: `apps/api/src/module/identity/core/user.service.ts` (add `updateProfile(id, dto)`)
- Modify: `apps/api/src/module/identity/persistence/repository/user.repository.ts` (add update method if not present; otherwise use existing TypeORM repo update)
- Test: `apps/api/src/module/identity/http/controller/__tests__/user.controller.spec.ts` (extend or create)
- Test: `apps/api/src/module/identity/core/__tests__/user.service.spec.ts` (extend or create)

**Approach:**
- DTO uses class-validator: `@IsOptional() @IsString() @MaxLength(100) displayName?: string`, `@IsOptional() @IsString() @MaxLength(240) bio?: string`, `@IsOptional() @IsUrl() @MaxLength(500) avatar?: string`. All three fields optional; service only updates the keys present in the DTO.
- `UserService.updateProfile(id, dto)` reads the user, throws `NotFoundException` if absent, merges + saves, returns `toUserResponse(user)`.
- Controller passes the JWT subject as `id` so a user can only update themselves.

**Patterns to follow:**
- `apps/api/src/module/identity/http/dto/register.dto.ts` (class-validator setup)
- `user.controller.ts:getMe` for `@CurrentUser` injection

**Test scenarios:**
- *Happy path:* `updateProfile` with all three fields persists and returns the updated `IUserResponse`.
- *Happy path:* `updateProfile` with only `bio` leaves `displayName` and `avatar` unchanged.
- *Edge case:* Empty DTO returns the user unchanged.
- *Error path:* `updateProfile` for a non-existent user id throws `NotFoundException`.
- *Error path:* DTO with `displayName.length > 100` rejected by validation (controller-level test via `ValidationPipe`).
- *Error path:* DTO with `avatar = "not-a-url"` rejected.
- *Integration:* `PATCH /user/me` with valid JWT cookie + body returns 200 and the updated user; same call without JWT returns 401.

**Verification:**
- `pnpm nx test api` passes for the identity module.
- Coverage remains ≥ 78% branch / 100% on the new code.

---

- [ ] **Unit 6: Backend — `POST /auth/change-password` endpoint**

**Goal:** Allow an authenticated user to rotate their password by confirming the current one.

**Requirements:** R3

**Dependencies:** Unit 5 is independent; this can land in parallel

**Files:**
- Create: `apps/api/src/module/identity/http/dto/change-password.dto.ts`
- Modify: `apps/api/src/module/identity/http/controller/auth.controller.ts` (add `@Post('change-password')` guarded by `JwtAuthGuard`)
- Modify: `apps/api/src/module/identity/core/auth.service.ts` (add `changePassword(userId, dto)`)
- Test: `apps/api/src/module/identity/http/controller/__tests__/auth.controller.spec.ts`
- Test: `apps/api/src/module/identity/core/__tests__/auth.service.spec.ts`

**Approach:**
- DTO: `@IsString() currentPassword`, `@IsString() @MinLength(8) @MaxLength(128) newPassword`. Confirm-password is client-side only.
- `changePassword(userId, dto)` reads user, `bcrypt.compare(currentPassword, user.passwordHash)`; throws `UnauthorizedException('Current password incorrect')` on mismatch. Otherwise `bcrypt.hash(newPassword, 12)` and save. Returns `{ message: 'Password updated' }`.
- Reuse `BCRYPT_ROUNDS = 12` from the existing auth service.

**Patterns to follow:**
- Bcrypt usage in `apps/api/src/module/identity/core/auth.service.ts` (existing register/login flow)
- Generic-message convention from ADR `0004`

**Test scenarios:**
- *Happy path:* Correct current password → password hash updated, returns `{ message: ... }`.
- *Edge case:* New password identical to current is allowed (we don't enforce "must differ"; leave to a future plan).
- *Error path:* Wrong current password → `UnauthorizedException`.
- *Error path:* `newPassword.length < 8` rejected by validation.
- *Error path:* `newPassword.length > 128` rejected by validation.
- *Error path:* Non-existent user (deleted between JWT issue and request) → `NotFoundException`.
- *Integration:* `POST /auth/change-password` without JWT returns 401.

**Verification:**
- New tests pass; existing auth tests still green.

---

- [ ] **Unit 7: Backend — Email-change flow (entity, migration, mail template, initiate + verify endpoints)**

**Goal:** Two-step email change with re-verification (R4, R5).

**Requirements:** R4, R5

**Dependencies:** none (independent of Units 5-6, but largest of the backend units; can split during execution if needed)

**Files:**
- Create: `apps/api/src/module/identity/persistence/entity/email-change-token.entity.ts`
- Create: `apps/api/src/module/identity/persistence/repository/email-change-token.repository.ts`
- Create: `apps/api/src/module/identity/migrations/<timestamp>-create-email-change-token-table.ts`
- Create: `apps/api/src/module/identity/http/dto/email-change-initiate.dto.ts`
- Create: `apps/api/src/module/identity/http/dto/verify-email-change.dto.ts`
- Modify: `apps/api/src/module/identity/http/controller/user.controller.ts` (add `@Post('me/email-change')`)
- Modify: `apps/api/src/module/identity/http/controller/auth.controller.ts` (add `@Post('verify-email-change')`, public)
- Modify: `apps/api/src/module/identity/core/user.service.ts` OR create a new `email-change.service.ts` (preferred: separate service to keep `UserService` focused on the user CRUD)
- Modify: `apps/api/src/module/identity/identity.module.ts` (register the new entity + service + repository)
- Modify: `apps/api/src/module/shared/mail/resend-email.service.ts` (add `sendEmailChangeVerification(newEmail, link)`)
- Modify: `apps/api/src/module/shared/config/env.schema.ts` (add `EMAIL_CHANGE_VERIFICATION_URL` — defaults to `http://localhost:4200/verify-email-change`)
- Modify: `apps/api/.env.example`
- Test: `apps/api/src/module/identity/core/__tests__/email-change.service.spec.ts`
- Test: `apps/api/src/module/identity/http/controller/__tests__/user.controller.spec.ts` (extend)
- Test: `apps/api/src/module/identity/http/controller/__tests__/auth.controller.spec.ts` (extend)

**Approach:**
- Entity columns: `id` (BaseEntity), `userId` (uuid, indexed), `tokenHash` (varchar 64), `newEmail` (varchar 255), `expiresAt` (timestamp), `createdAt`/`updatedAt` (BaseEntity). Schema `identity`.
- **Initiate (`POST /user/me/email-change`):**
  1. Verify current password (bcrypt compare).
  2. Check `newEmail` is not already in use in `identity.user`.
  3. Delete any existing pending tokens for `userId` (one-pending-change-per-user policy).
  4. Generate raw token via `crypto.randomBytes(32).toString('base64url')`; hash via SHA-256.
  5. Save token row with `expiresAt = now + 60min`.
  6. Send Resend email to `newEmail` with link `${EMAIL_CHANGE_VERIFICATION_URL}?token=<raw>`.
  7. Return `{ message: 'Check your new inbox' }` regardless (avoids enumeration of the new email).
- **Verify (`POST /auth/verify-email-change`):**
  1. Hash incoming raw token.
  2. Look up row by `tokenHash`. If missing or expired → 410 Gone with `{ message: 'Link expired or invalid' }`.
  3. Within a transaction: update `user.email = row.newEmail`; delete the token row.
  4. Return `{ message: 'Email updated', email: newEmail }`.
- Reuse the SHA-256 hashing utility used by the password-reset flow (likely in `auth.service.ts` or a shared helper — find and reuse rather than duplicate).
- Email template body: plain text + simple HTML mirror of the password-reset template.

**Patterns to follow:**
- `apps/api/src/module/identity/persistence/entity/password-reset-token.entity.ts` (entity shape)
- `apps/api/src/module/identity/migrations/1708000000000-create-identity-schema-and-user-table.ts` (migration style — schema-scoped, idempotent)
- `apps/api/src/module/shared/mail/resend-email.service.ts:sendPasswordResetEmail` (email template shape)
- ADR `0004-forgot-password-flow-behavior.md` for the generic-message and hashed-token rules

**Test scenarios:**
- *Happy path:* Initiate with correct password and unique newEmail → token persisted, mail sent, 200.
- *Happy path:* Verify with valid raw token → user.email swapped, token deleted, 200.
- *Edge case (initiate):* Existing pending token is replaced (only one in flight at a time).
- *Edge case (verify):* Raw token never matches any stored hash → 410 with generic message.
- *Error path (initiate):* Wrong current password → `UnauthorizedException`.
- *Error path (initiate):* `newEmail` already in use → 409 Conflict with generic-ish message (NOT silent — the user needs to know to try another email).
- *Error path (initiate):* `newEmail` is the same as current email → 400 Bad Request.
- *Error path (verify):* Expired token → 410.
- *Error path (verify):* Token used twice → second attempt returns 410 (deleted on first verify).
- *Integration:* Full round-trip — initiate → read mail → POST verify → confirm `GET /user/me` returns the new email.

**Verification:**
- `pnpm nx test api` passes including new tests.
- Migration applies cleanly to a fresh PostgreSQL via `docker compose up postgres -d` and `pnpm typeorm migration:run`.

---

- [ ] **Unit 8: Frontend — API client + AuthContext extensions**

**Goal:** Expose typed client functions for the new backend endpoints and update local user state after profile changes.

**Requirements:** R2, R3, R4, R5

**Dependencies:** Units 5-7 backend endpoints (but client code can be written in parallel; integration testing requires backend complete)

**Files:**
- Modify: `apps/web/src/lib/api-client.ts` (add `updateProfile`, `changePassword`, `initiateEmailChange`, `verifyEmailChange`)
- Modify: `apps/web/src/lib/types/auth.ts` (add `IUpdateProfileRequest`, `IChangePasswordRequest`, `IInitiateEmailChangeRequest`, `IVerifyEmailChangeRequest`)
- Modify: `apps/web/src/lib/auth-context.tsx` (add `updateProfile` method that calls the client and updates local state)
- Modify: `apps/web/src/app/api/auth/me/route.ts` (switch from JWT-decode-only to forwarding to backend `GET /user/me` with the cookie's Bearer token)
- Create: `apps/web/src/app/api/user/me/route.ts` (PATCH proxy — forwards body + cookie token to backend)
- Create: `apps/web/src/app/api/user/me/email-change/route.ts` (POST proxy)
- Create: `apps/web/src/app/api/auth/change-password/route.ts` (POST proxy)
- Create: `apps/web/src/app/api/auth/verify-email-change/route.ts` (POST proxy)

**Approach:**
- Mirror the existing `loginUser` / `registerUser` shape: one function per endpoint, throws `AuthApiError` on non-2xx.
- New Next.js API routes are thin proxies: read the `token` cookie, forward as `Authorization: Bearer <token>` to the backend (API URL from `process.env.NEXT_PUBLIC_API_URL` or a server-only `API_INTERNAL_URL` — match how existing auth routes already proxy; check `apps/web/src/app/api/auth/login/route.ts` for the pattern).
- `/api/auth/me` change: instead of decoding the JWT, forward to backend `GET /user/me`. If backend returns 401, clear local state via 401 response. Keep the route signature identical so consumers don't break.
- `AuthProvider.updateProfile(dto)` calls `updateProfile(dto)` from the client, then `setUser(updated)`.

**Patterns to follow:**
- `apps/web/src/lib/api-client.ts` (function shape)
- `apps/web/src/app/api/auth/login/route.ts` (proxy pattern)

**Test scenarios:**
- *Happy path:* `updateProfile({ bio: 'new bio' })` returns the updated user and `AuthProvider.user.bio` reflects it on the next render.
- *Edge case:* Calling `updateProfile` with an empty object returns the current user unchanged.
- *Error path:* `changePassword` with wrong current pw throws `AuthApiError` with status 401 and the backend message.
- *Error path:* `initiateEmailChange` with duplicate email throws `AuthApiError` with status 409.
- *Integration:* After `verifyEmailChange` succeeds, calling `getCurrentUser()` returns the new email (proves the `/api/auth/me` forwarding works).

**Verification:**
- TypeScript compiles (`pnpm nx typecheck web`).
- Manual: in the dev server, log in, change bio on `/profile`, refresh — bio persists.

---

- [ ] **Unit 9: Frontend — `/profile` page**

**Goal:** Functional Profile page wired to `PATCH /user/me`.

**Requirements:** R1, R2, V3

**Dependencies:** Units 2, 3, 4, 5, 8

**Files:**
- Create: `apps/web/src/app/(app)/profile/page.tsx`
- Create: `apps/web/src/components/profile/profile-form.tsx` + `profile-form.module.css`
- Create: `apps/web/src/components/profile/avatar-uploader.tsx` + `avatar-uploader.module.css` (visual stub — opens file picker, no upload)
- Create: `apps/web/src/components/profile/pill-list.tsx` + `pill-list.module.css` (Favorite genres — visual stub)
- Create: `apps/web/src/components/profile/currently-reading-card.tsx` + `currently-reading-card.module.css` (visual stub)

**Approach:**
- Page is a server component that reads no data itself (auth-context handles user state on the client).
- `<ProfileForm />` is a client component: pulls `user` from `useAuth()`, mirrors fields into local state, validates (display name required, bio ≤ 240), submits via `updateProfile`. On success, surfaces inline "Saved" message (mirrors the auth-form success-state pattern). On failure, surfaces the API error in a banner styled like the auth forms.
- Avatar uploader, genre pills, and currently-reading card render with the handoff visuals but the Save action only persists `displayName`, `bio`, `avatar` (genre + currently-reading are read-only stubs with a "Coming soon" tooltip).
- Username field is read-only and shows `@<lowercased-displayName-no-spaces>` as a derived placeholder.

**Patterns to follow:**
- `apps/web/src/components/auth/login-form.tsx` — `'use client'`, local state, validation, error banner, loading overlay, submit button shape
- `apps/web/src/lib/validation.ts` — extend with `validateProfileForm` returning `{ field: error }`

**Test scenarios:**
- *Happy path:* Form prefills from `useAuth().user`; submitting with changes persists and re-renders with the new values.
- *Happy path:* Bio counter updates as the user types and caps at 240.
- *Error path:* Submitting with an empty display name shows a field-level error and does not call the API.
- *Error path:* API 500 surfaces a banner error and re-enables the submit button.
- *Edge case:* `user` is `null` (still loading) → form renders skeleton/disabled state, not a crash.
- *Edge case:* Avatar URL field accepts a valid URL and surfaces validation error for an invalid URL.

**Verification:**
- `pnpm nx serve web`; log in, navigate to `/profile`, see the handoff layout, change display name, save, refresh — change persists.

---

- [ ] **Unit 10: Frontend — `/account` page**

**Goal:** Functional Account page covering email change and password change (with notification/timezone visual stubs).

**Requirements:** R3, R4, V4

**Dependencies:** Units 2, 3, 4, 6, 7, 8

**Files:**
- Create: `apps/web/src/app/(app)/account/page.tsx`
- Create: `apps/web/src/components/account/settings-card.tsx` + `settings-card.module.css` (reusable for the three blocks; mirrors handoff `SettingsCard`)
- Create: `apps/web/src/components/account/email-section.tsx` + `email-section.module.css` (initiate email change; reveals current-password + new-email inline form)
- Create: `apps/web/src/components/account/password-section.tsx` + `password-section.module.css` (current/new/confirm; calls `changePassword`)
- Create: `apps/web/src/components/account/notifications-section.tsx` + `notifications-section.module.css` (visual-stub toggle list)
- Create: `apps/web/src/components/ui/toggle.tsx` + `toggle.module.css`

**Approach:**
- Each section is a client component with local state.
- `EmailSection`: displays current email + an "Edit" button. Clicking reveals an inline two-field form (current password + new email). Submit → `initiateEmailChange` → on success replace the form with "Check <newEmail> for a verification link" copy.
- `PasswordSection`: three fields + Update button. Client-side: confirm matches new, both min-length 8. On success render an inline "Password updated" message and clear the fields.
- `NotificationsSection`: four `<Toggle>` rows with the labels/sub-labels from the handoff. Toggle changes are local-only; sub-copy reads "Coming soon — preferences are read-only".
- `TimeZone` field in EmailSection is editable but Save shows "Coming soon" (no backend column).

**Patterns to follow:**
- Auth-form pattern (`login-form.tsx`) for state + submit + error banner.

**Test scenarios:**
- *Happy path (password):* Valid current + new + matching confirm → API called, success message rendered.
- *Edge case (password):* Confirm-mismatch prevents submit and shows field error.
- *Error path (password):* Wrong current pw → API 401 → banner surfaces backend message.
- *Happy path (email):* Submit with correct password + new email → success copy renders; sent button is disabled.
- *Error path (email):* Backend 409 (email in use) → banner with backend message.
- *Edge case (email):* Submitting the user's current email → backend 400; banner surfaces it.
- *Edge case (notifications):* Toggle clicks update visual state only and don't call any API.

**Verification:**
- Dev server: log in, change password, log out, log in with new password — works.
- Initiate email change → log into Resend dashboard (or use the dev mailbox the app already uses) → confirm an email landed.

---

- [ ] **Unit 11: Frontend — `/verify-email-change` page**

**Goal:** Land the user from the email link and confirm the email swap.

**Requirements:** R5

**Dependencies:** Units 1, 4, 7, 8

**Files:**
- Create: `apps/web/src/app/verify-email-change/page.tsx` (NOT inside `(app)` — public, no sidebar, no auth requirement)
- Create: `apps/web/src/app/verify-email-change/page.module.css`

**Approach:**
- Client component. On mount, reads `?token=` from `useSearchParams`, calls `verifyEmailChange({ token })`, renders one of three states: pending (spinner), success (with link to `/account`), or failure (with link back to `/account`).
- Visually a simple centered card — no sidebar, no topbar. Could reuse `BrandPanel`+form layout if desired, but the simplest version is a centered card on the `bg-paper` background.

**Patterns to follow:**
- `apps/web/src/app/(auth)/reset-password/page.tsx` (token-from-URL + call + render-state pattern from the 2026-05-03 plan).

**Test scenarios:**
- *Happy path:* Valid token → success state, link to `/account`.
- *Error path:* Missing or empty `?token=` → render failure state without calling the API.
- *Error path:* Expired/invalid token → backend 410 → failure state with the backend message.
- *Edge case:* Component unmounts before fetch resolves → no setState-after-unmount warning (use AbortController or an `isMounted` ref).

**Verification:**
- Dev server: trigger an email change, click the link in the dev mailbox, land here, see success, navigate to `/account` — confirm new email shows.

---

- [ ] **Unit 12: Frontend — Placeholder pages (Reading Desk, My Clubs, Bookshelf, Discover, Notifications)**

**Goal:** Five "coming soon" pages under `(app)/`, each rendering through the shell.

**Requirements:** R6, V5

**Dependencies:** Units 2, 3

**Files:**
- Create: `apps/web/src/app/(app)/page.tsx` (Reading Desk — REPLACES `apps/web/src/app/page.tsx`)
- Delete: `apps/web/src/app/page.tsx` (old Nx starter home page; conflicts with the new `(app)/page.tsx` since route groups cannot both define `/`)
- Delete: `apps/web/src/app/page.module.css` (Nx starter styles, orphaned after the deletion above)
- Create: `apps/web/src/app/(app)/clubs/page.tsx`
- Create: `apps/web/src/app/(app)/bookshelf/page.tsx`
- Create: `apps/web/src/app/(app)/discover/page.tsx`
- Create: `apps/web/src/app/(app)/notifications/page.tsx`

**Approach:**
- Each page is a server component that renders `<AppEmptyState eyebrow="…" title="…" body="…" />`. No data fetching.
- Copy suggestions (match the handoff tone):
  - Reading Desk: "Soon" / "Your Reading Desk" / "A quiet home for current reads, your clubs, and the next chapter. Arriving soon."
  - My Clubs: "Soon" / "My Clubs" / "Every gathering you've joined, in one place."
  - Bookshelf: "Soon" / "Your Bookshelf" / "Books you've read, want to read, and marginalia — under construction."
  - Discover: "Soon" / "Find a Club" / "Browse clubs by genre, cadence, and mood."
  - Notifications: "Soon" / "The Daily Page" / "Replies, invites, and meeting reminders will live here."

**Note:** Be careful when deleting `apps/web/src/app/page.tsx` — Next.js route groups CANNOT both define `/`. The old `app/page.tsx` must be removed; the new `app/(app)/page.tsx` becomes the route for `/`.

**Patterns to follow:**
- `AppEmptyState` from Unit 2.

**Test scenarios:**
- *Happy path:* Each route renders the shell + the empty-state component with the right title.
- *Edge case:* Navigating between placeholder routes via the sidebar updates the active item without a full page reload (App Router default).

**Verification:**
- Dev server: log in, visit each of the five routes, confirm shell + copy render.

---

- [ ] **Unit 13: Add a logout entry point in the Topbar (avatar dropdown stub)**

**Goal:** Give a signed-in user a way to sign out without resorting to dev tools.

**Requirements:** R6 (implicit — Topbar functionality)

**Dependencies:** Unit 2

**Files:**
- Modify: `apps/web/src/components/app-shell/topbar.tsx` (+ module CSS)
- Create: `apps/web/src/components/app-shell/user-menu.tsx` + `user-menu.module.css`

**Approach:**
- Click avatar → small dropdown with two items: "Profile" (links to `/profile`) and "Sign out" (calls `useAuth().logout()`).
- Dropdown is a tiny client component; close on outside-click or Escape.
- This is the minimum nav affordance needed to test the auth flow end-to-end.

**Patterns to follow:**
- Existing button + click-handler conventions from auth forms.

**Test scenarios:**
- *Happy path:* Click avatar → dropdown opens; click "Sign out" → `logout()` runs and router pushes `/login`.
- *Edge case:* Click outside the dropdown closes it.
- *Edge case:* Pressing Escape closes the dropdown.

**Verification:**
- Manual: sign out via the menu, confirm cookie cleared and middleware redirects to `/login`.

## System-Wide Impact

- **Interaction graph:** New backend endpoints expand the identity domain's HTTP surface (`UserController` and `AuthController`). The shared `ResendEmailService` gains a new method. The Next.js `middleware.ts` matcher widens; verify no existing pages are accidentally excluded.
- **Error propagation:** Backend uses NestJS HTTP exceptions (`UnauthorizedException`, `NotFoundException`, `ConflictException`, custom 410 via `HttpException`). Frontend `api-client.ts` wraps these in `AuthApiError` with the original status. UI surfaces messages inline; no toast system.
- **State lifecycle risks:**
  - JWT cookie payload becomes stale after profile or email change. Mitigation: `/api/auth/me` is forwarded to the backend (Unit 8), so reads are always fresh.
  - Email-change token: one row per user policy enforced in `initiate`; verify is single-use (row deleted on success). Race condition on concurrent verify calls is acceptable (only the first wins; the second sees a stale row and returns 410).
  - Password change does not invalidate the current JWT. Documented as a deferred concern.
- **API surface parity:** No other clients consume the API yet, so the new endpoints are additive. The existing `/api/auth/me` Next.js route changes shape internally (forward vs. decode) but its response shape is unchanged.
- **Integration coverage:** Email-change verification round-trip (initiate → email → click → verify → confirm `/user/me`) is the only flow that crosses both the mail service and the persistence layer; this scenario is enumerated in Unit 7.
- **Unchanged invariants:**
  - Existing auth endpoints (`/auth/login`, `/auth/register`, `/auth/logout`, `/auth/forgot-password`, `/auth/reset-password`) are not modified.
  - `(auth)` route group layout is not modified.
  - `JwtAuthGuard`, `CurrentUser` decorator, and JWT issuance are not modified.
  - Module-isolation rules (ADR `0006`) — all new code stays inside `module/identity/` and `module/shared/mail/`; no new cross-module imports.

## Risks & Dependencies

| Risk | Mitigation |
|---|---|
| Replacing `apps/web/src/app/page.tsx` with `(app)/page.tsx` creates a route collision if both exist simultaneously. | Delete the old file as part of Unit 12 in the same commit; verify with `pnpm nx build web`. |
| Middleware regex change could over-protect public routes (`/verify-email-change`, `/api/auth/*`). | Unit 4 lists exact prefix-protected routes and explicitly excludes `/verify-email-change` and `/api`. Add a smoke test (curl) before merging. |
| Forwarding `/api/auth/me` to the backend introduces a latency hop and a new failure mode (backend down → me returns null → user logged out). | Acceptable; the backend is already required for every other API call. If it becomes a problem, cache the result in memory for a short TTL. |
| Email-change verification token leaks via referrer if the user clicks a link from the new mailbox to a third-party page. | Same risk profile as password reset (ADR `0004`); tokens are one-use and short-lived (60min). Add `Referrer-Policy: strict-origin-when-cross-origin` if not already set (low priority). |
| Race: user submits PATCH /user/me with a stale `displayName` from before another tab changed it. | Last-write-wins is acceptable for this scope. Document as a known limitation. |
| Migration applies to a database already in use during deploy. | New table only; no destructive operations. Standard TypeORM migration. |
| Bcrypt cost (12 rounds) makes `change-password` slow under load. | Same cost as login; acceptable for an authenticated, rate-limited endpoint (rate-limiting not in scope of this plan). |

## Documentation / Operational Notes

- **Env var:** Document `EMAIL_CHANGE_VERIFICATION_URL` in `apps/api/.env.example` and the CLAUDE.md "Environment Variables" section.
- **Migration:** Mention the new `email_change_token` table in the migration file's header comment; production deploy runs migrations automatically (existing pattern).
- **Resend template:** Reuse the existing transactional sender; no DNS or template-store changes needed.
- **Operational monitoring:** No new dashboards required. The mail service already logs send failures.
- **Rollback:** Frontend changes are layout-additive plus replacing the home page. Roll back by reverting the commit; the Nx starter is preserved in git history. Backend rollback: revert + run the down migration (auto-generated by TypeORM).

## Sources & References

- **Handoff bundle:** `Plot Twist-handoff.zip` (extracted to `/tmp/plot-twist-handoff/`); primary screens `screens-extra.jsx:252-400` (Profile, Account), shell components `shared.jsx:84-114` (Topbar), `screens-dashboard.jsx:15-60` (SideNav).
- **Related plans:**
  - `docs/plans/2026-05-03-001-feat-forgot-reset-password-ui-plan.md` — closest precedent for Stitch/handoff → Next.js conversion + token-link UX
  - `docs/plans/2026-03-28-001-feat-forgot-password-flow-plan.md` — model for the email-change verification flow (hashed token + entity + Resend)
- **ADRs:**
  - `docs/adr/0004-forgot-password-flow-behavior.md` (generic messages, hashed tokens)
  - `docs/adr/0005-application-side-uuid-generation.md` (BaseEntity)
  - `docs/adr/0006-module-shared-and-path-aliases.md` (cross-module imports)
- **Project rules:** `docs/STATE-ISOLATION.md` (schema-scoped entities), `docs/MODULAR-PRINCIPLES.md` (domain boundaries), `CLAUDE.md` (project conventions).
- **Existing code touchpoints:** `apps/api/src/module/identity/{core,http,persistence}/`, `apps/web/src/{app,components,lib}/`.
