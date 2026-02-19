# Plot-Twist MVP Specification

## Overview

Plot-Twist is a book club management platform that helps readers organize clubs, schedule meetings, and track reading progress together. The MVP focuses on core club management — no real-time chat, just the tools needed to run a book club effectively.

## Core Entities

### User

- Email/password registration and login
- Profile: display name, avatar, bio
- Ability to add and manage friends

### Friendship

- Send, accept, and decline friend requests
- View friends list
- Remove friends

### Club

- Name, description, cover image
- Created by a user (owner)
- Invite friends to join the club
- Members can leave; owner can remove members
- Roles: **owner** and **member**

### Book

- Title, author, cover image, description
- ISBN (optional)
- Genre/tags (optional)
- Added to the platform by any user

### Club Book (Reading Assignment)

- Assign a book to a club as the current read
- Status: **reading**, **finished**
- Only one active book per club at a time
- History of previously read books

### Meeting

- Tied to a club
- Date and time
- Google Meet link (auto-generated or manually added)
- Recurring schedule: weekly, biweekly, or monthly
- Meeting notes (optional, added after the meeting)

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
| My Clubs | List of clubs the user belongs to |
| Upcoming Meetings | Next scheduled meetings across all clubs |
| Currently Reading | Books assigned in the user's clubs |

### User Profile

| Section | Description |
|---------|-------------|
| Profile Info | Display name, avatar, bio, edit options |
| Friends | Friends list, pending requests, search users |
| Reading History | Books finished across all clubs |

### Friends

| Screen | Description |
|--------|-------------|
| Friends List | All current friends with remove option |
| Friend Requests | Incoming requests with accept/decline |
| Find Friends | Search users by name or email, send request |

### Club Detail

| Section | Description |
|---------|-------------|
| Overview | Club name, description, cover image, member count |
| Members | List of members with roles; invite friends button |
| Current Book | The book being read now, with progress status |
| Book History | Previously read books |
| Meetings | Upcoming and past meetings |
| Settings | Edit club info, meeting frequency, manage members (owner only) |

### Club Creation / Edit

| Field | Description |
|-------|-------------|
| Name | Club name (required) |
| Description | Short description |
| Cover Image | Upload or choose default |
| Meeting Frequency | Weekly, biweekly, monthly, or none |
| Meeting Day & Time | Preferred day of the week and time |

### Book Search & Assignment

| Screen | Description |
|--------|-------------|
| Search Books | Search by title or author (from platform catalog) |
| Add Book | Manually add a book if not found |
| Assign to Club | Select a book and set it as the club's current read |

### Meeting Detail

| Field | Description |
|-------|-------------|
| Date & Time | When the meeting takes place |
| Google Meet Link | Link to join the video call |
| Club & Book | Which club and what book is being discussed |
| Notes | Optional post-meeting notes or discussion points |

## User Flows

### 1. Sign Up and Create First Club

1. User signs up with email and password
2. Lands on empty dashboard
3. Taps "Create Club"
4. Fills in club name, description, and meeting preferences
5. Invites friends by searching their name/email
6. Club is created and visible on dashboard

### 2. Assign a Book to a Club

1. Owner opens club detail
2. Taps "Set Current Book"
3. Searches for a book by title/author
4. If not found, adds it manually
5. Confirms selection — book appears as current read for all members

### 3. Schedule and Join Meetings

1. Owner sets meeting frequency during club creation (or in settings)
2. System generates recurring meetings based on frequency
3. Each meeting has a Google Meet link
4. Members see upcoming meetings on dashboard and club detail
5. Members click the link to join at the scheduled time

### 4. Add a Friend

1. User navigates to Friends
2. Searches by name or email
3. Sends friend request
4. Other user accepts
5. Both appear in each other's friends list

### 5. Complete a Book and Start Next

1. Owner marks current book as "finished"
2. Book moves to club's reading history
3. Owner assigns a new book as the current read

## API Endpoints (Overview)

### Auth

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/forgot-password`

### Users

- `GET /users/me`
- `PATCH /users/me`
- `GET /users/search?q=`

### Friends

- `GET /friends`
- `POST /friends/request`
- `POST /friends/accept/:id`
- `POST /friends/decline/:id`
- `DELETE /friends/:id`

### Clubs

- `POST /clubs`
- `GET /clubs`
- `GET /clubs/:id`
- `PATCH /clubs/:id`
- `DELETE /clubs/:id`
- `POST /clubs/:id/invite`
- `POST /clubs/:id/leave`
- `DELETE /clubs/:id/members/:userId`

### Books

- `GET /books/search?q=`
- `POST /books`
- `GET /books/:id`

### Club Books

- `POST /clubs/:id/books`
- `PATCH /clubs/:id/books/:bookId`
- `GET /clubs/:id/books`

### Meetings

- `GET /clubs/:id/meetings`
- `POST /clubs/:id/meetings`
- `PATCH /meetings/:id`
- `DELETE /meetings/:id`
