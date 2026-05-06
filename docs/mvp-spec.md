# Plot-Twist MVP Specification

## Overview

Plot-Twist is a book club platform focused on the *club itself* — bringing members together and giving them a place to talk. The MVP narrows to two core capabilities: **club management** and **real-time chat inside each club**.

Reading-status tracking, social graphs, and meeting scheduling are intentionally out of scope for the MVP. See [Out of Scope](#out-of-scope) for rationale, and `docs/DOMAINS-DEFINITION.md` for the full domain model.

## Core Entities

### User

- Email/password registration and login
- Profile: display name, avatar, bio
- Password reset by email

### Club

- Name, description, cover image
- Created by a user (owner)
- Owner invites other users in two ways: a **targeted email invitation**, or a **shareable invite link** they can copy and send via any channel
- Members can leave; owner can remove members; owner can transfer ownership
- Roles: **owner** and **member**
- Each club has exactly one chat (see Message)

### Membership

- A user's participation in a club, with role (`owner` or `member`)
- Child entity of Club (no separate API surface beyond club endpoints)

### Invitation (targeted)

- Sent by an owner to a specific email address
- Status: **pending**, **accepted**, **declined**, **revoked**
- The recipient receives an email with a link; only that email can accept
- Child entity of Club

### Invite Link (shareable)

- One regenerable token per club, owned by the Club aggregate
- Owner can **generate**, **rotate** (replaces the existing token), or **revoke** (removes the token)
- Anyone signed in who opens an active link joins the club as a member
- Rotating the token immediately invalidates the previous one
- Surfaces as a copyable URL in the club settings; the owner shares it via any channel they want

### Message (Discussions)

- A chat message inside a club. One implicit chat per club (no multi-channel).
- Fields: `clubId`, `authorId`, `content`, `parentMessageId` (nullable), `postedAt`, `editedAt`, `deletedAt`
- **Threading:** two levels max. A message is either top-level (`parentMessageId === null`) or a reply pointing at a top-level message. Replies-to-replies collapse into the same thread — there's no nesting beyond one level.
- Author can edit and delete their own messages. Club owner can delete any message in their club (moderation).
- Real-time delivery via WebSocket; persistence is the source of truth.

## Pages & Screens

### Authentication

| Screen | Description |
|--------|-------------|
| Sign Up | Email, password, display name |
| Log In | Email and password |
| Forgot Password | Email-based password reset |

### Home / Dashboard

| Section | Description |
|---------|-------------|
| My Clubs | List of clubs the user belongs to, with unread-message indicator |
| Create Club | Entry point to club creation |

### User Profile

| Section | Description |
|---------|-------------|
| Profile Info | Display name, avatar, bio, edit options |
| Account | Change password, sign out |

### Club Detail

The chat is the **default view** of a club — that's where members spend their time.

| Section | Description |
|---------|-------------|
| Chat | Real-time message list with composer; threaded replies open in a side panel |
| Members | List of members with roles; owner can invite by email or remove members |
| Invite Link (owner only) | Copy current invite link, rotate it, or revoke it |
| Settings (owner only) | Edit club info, manage members, transfer ownership, delete club |

### Club Creation / Edit

| Field | Description |
|-------|-------------|
| Name | Club name (required) |
| Description | Short description |
| Cover Image | Upload or choose default |

### Chat Interactions

| Interaction | Description |
|-------------|-------------|
| Post message | Composer at the bottom of the chat |
| Reply in thread | Opens a side panel/modal showing the parent message + its replies |
| Edit message | Author-only; shows "edited" indicator |
| Delete message | Author or club owner; deleted messages render as a tombstone |
| Thread indicator | Top-level messages with replies show "N replies" + last reply time |

## User Flows

### 1. Sign Up and Create First Club

1. User signs up with email, password, and display name
2. Lands on empty dashboard
3. Taps "Create Club"
4. Fills in club name, description, optional cover image
5. Invites other users by email or username
6. Lands in the new club's chat — empty state explains how to start the conversation

### 2a. Join a Club via Email Invitation

1. Owner enters the invitee's email in the club's Members section
2. System creates a pending invitation and sends an email with an accept link
3. Recipient opens the link, signs in (or signs up first), and accepts
4. Recipient becomes a member and lands in the club's chat

### 2b. Join a Club via Invite Link

1. Owner opens club settings and taps "Copy invite link" (generating one if none exists)
2. Owner shares the link via any channel (DM, email, message app, etc.)
3. Recipient opens the link
4. If signed in, they're added as a member immediately and land in the chat
5. If not signed in, they're prompted to sign in or sign up; after auth they're added and land in the chat
6. If the link has been rotated or revoked, the recipient sees a "this link is no longer valid" message

### 3. Post and Reply in Chat

1. Member opens a club
2. Types in the composer and sends a message
3. Another member opens that message as a thread and replies
4. The original message shows a "1 reply" indicator
5. All members see new messages in real time

### 4. Moderate a Message (Owner)

1. Owner taps a message in their club
2. Selects "Delete"
3. Message renders as a tombstone for all members

### 5. Leave or Transfer Ownership

1. Member opens club settings → "Leave club"
2. If the user is the owner, they must transfer ownership to another member first
3. After transfer, the original owner can leave

## API Endpoints (Overview)

### Auth

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`

### Users

- `GET /users/me`
- `PATCH /users/me`
- `GET /users/search?q=` (used by club invitations)

### Clubs

- `POST /clubs`
- `GET /clubs` (clubs the current user belongs to)
- `GET /clubs/:id`
- `PATCH /clubs/:id`
- `DELETE /clubs/:id`
- `POST /clubs/:id/invitations` (body: `email`)
- `POST /clubs/:id/invitations/:invitationId/accept`
- `POST /clubs/:id/invitations/:invitationId/decline`
- `POST /clubs/:id/invite-link` (generate or rotate the shareable link; returns the URL)
- `DELETE /clubs/:id/invite-link` (revoke)
- `POST /invite-links/:token/accept` (recipient redeems the link; auth required)
- `POST /clubs/:id/leave`
- `POST /clubs/:id/transfer-ownership`
- `DELETE /clubs/:id/members/:userId`

### Discussions

- `GET /clubs/:id/messages?cursor=&limit=` (paginated, top-level messages newest-first)
- `GET /messages/:id/replies` (replies in a thread)
- `POST /clubs/:id/messages` (body: `content`, optional `parentMessageId`)
- `PATCH /messages/:id` (author only)
- `DELETE /messages/:id` (author or club owner)

### WebSocket Gateway

- Channel: `club:{clubId}`
- Events: `message.posted`, `message.edited`, `message.deleted`
- Auth: JWT on connection; subscription requires active membership in the club

## Out of Scope

| Excluded | Rationale |
|----------|-----------|
| **Friendships / social graph** | Club membership is the only social relationship the MVP needs. Friend requests don't enable anything users can't already do via club invitations. |
| **Reading status / progress / book catalog** | Goodreads, StoryGraph, and similar apps already solve this well. Plot-Twist is about the club, not the user's personal reading log. |
| **Meetings / scheduling** | A Zoom or Google Meet link pasted into the club chat is sufficient. No scheduling, recurrence, or reminders to model in the MVP. |
| **Multi-channel chat per club** | One club = one chat. Threading handles topic isolation; multi-channel adds UI complexity without clear MVP value. |

Each of these can be reintroduced as its own bounded context post-MVP without disturbing the existing design — see `docs/DOMAINS-DEFINITION.md` §7.
