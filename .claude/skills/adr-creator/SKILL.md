---
name: adr-creator
description: Create Architecture Decision Records (ADRs) through a guided interview process. Use this skill whenever the user wants to document an architectural decision, is choosing between technical options, mentions "ADR", "Architecture Decision Record", wants to record a technical choice, is debating frameworks/patterns/tools, or any time a significant technical decision is being made or has been made. Don't wait for the user to ask explicitly — if an architectural decision is clearly happening in the conversation, proactively offer to create an ADR.
---

# ADR Creator

An ADR (Architecture Decision Record) captures the context, reasoning, and consequences of a significant architectural decision. Good ADRs are short, honest, and written close to the time of the decision — not polished retrospectives.

Your job is to interview the decision-maker, extract the signal from the noise, and produce a clean ADR file they'll actually want to read a year from now.

## Anatomy of a Good ADR

A good ADR answers four questions:

1. **Why did this come up?** — The forces, constraints, and context that made a decision necessary.
2. **What options were on the table?** — At least two real alternatives (not strawmen).
3. **What did we choose and why?** — The decision and the reasoning behind it.
4. **What do we live with?** — Honest consequences, including trade-offs and things that will need revisiting.

## Step 1: Quick Triage

Before interviewing, assess what you already know from the conversation:

- Is the decision **already made** or **still in progress**?
- Do you know the **winning option**?
- Do you know the **alternatives that were considered**?
- Do you understand the **problem being solved**?

Fill in what you know, then ask only for what's missing. Don't ask questions whose answers are already in the conversation.

## Step 2: Interview

Ask focused questions to extract what's needed. Keep it conversational — one cluster of questions at a time, not a long form.

**Core questions (always ask if not already known):**

1. What problem or situation triggered this decision? What would have happened without deciding?
2. What were the main options considered? (Even if briefly)
3. What drove the final choice — what mattered most?
4. What trade-offs are you accepting? What could go wrong or need revisiting?

**Dig deeper if needed:**

- Are there constraints (technical, organizational, time, cost) that ruled out options?
- Who is affected by this decision, and how?
- Is this decision reversible or hard to undo?
- Are there conditions that would cause you to revisit this decision?

**Tips for the interview:**
- Accept rough answers. You'll shape them into clean prose.
- If they say "we just went with X", probe gently: "What made X feel right over the alternatives?"
- If consequences seem overly positive, push back: "What are you giving up or betting on here?"
- Don't require formal language. Extract the intent and translate it.

## Step 3: Draft the ADR

Once you have enough to work with, write the ADR using this template:

```markdown
# [NUMBER]. [Title — verb phrase summarizing the decision, e.g., "Use PostgreSQL as primary database"]

Date: [YYYY-MM-DD]
Status: [Proposed | Accepted | Deprecated | Superseded by ADR-XXXX]

## Context

[2-4 sentences describing the situation, forces, and constraints that made this decision necessary. Focus on WHY this came up — not background about the system in general.]

## Decision Drivers

- [Key factor 1 that influenced the decision]
- [Key factor 2]
- [Key factor 3]
(Optional — include if there were clear, distinct priorities)

## Options Considered

### Option A: [Name]
[1-2 sentence description]
- Pro: [...]
- Pro: [...]
- Con: [...]

### Option B: [Name]
[1-2 sentence description]
- Pro: [...]
- Con: [...]
- Con: [...]

(Add more options if they were seriously considered)

## Decision

We chose **[Option X]** because [clear, honest reasoning that ties back to the decision drivers and context].

## Consequences

### Positive
- [What this enables or improves]
- [...]

### Negative / Trade-offs
- [What we're giving up or betting on]
- [Known risk or limitation]
- [...]

### Neutral / Watch
- [Anything that may need revisiting in the future]
- [Open question or follow-up action]
```

## Step 4: Placement and Naming

**File naming:** `NNNN-title-in-kebab-case.md`

Where `NNNN` is the next sequential number. To determine it:

1. Check if there's an existing `docs/adr/` or `docs/decisions/` directory
2. If it exists, find the highest-numbered file and increment
3. If it doesn't exist, start at `0001`

**Default location:** `docs/adr/`

Ask the user where they want it saved if the project doesn't have an established ADR directory. Once confirmed, create the file.

## Step 5: Review

After writing the ADR:

1. Read it back yourself. Ask: "Would someone unfamiliar with this decision understand *why* it was made?"
2. Check that the Decision section matches what's in Options Considered — if "Option A" is chosen, "Option A" should appear in the Decision.
3. Check that consequences are honest. "No known downsides" is almost never true.
4. Trim anything that doesn't help answer the four core questions.

Show the user the draft and ask if anything feels off or missing — especially around consequences and alternatives.

## Status Values

| Status | When to use |
|--------|-------------|
| `Proposed` | Decision is being discussed, not yet finalized |
| `Accepted` | Decision has been made and is in effect |
| `Deprecated` | Was accepted, but no longer applies |
| `Superseded by ADR-XXXX` | Replaced by a newer decision |

Default to `Accepted` unless the user indicates the decision is still open.

## Common Pitfalls to Avoid

**Vague context:** "We needed a better approach" — push for specifics. What was the forcing function?

**No real alternatives:** An ADR with only one option isn't a decision record, it's an announcement. Dig for what else was on the table.

**Consequence-free decisions:** Every significant choice involves trade-offs. If the user can't name any, ask what they'd be worried about if the decision turns out to be wrong.

**Overly long ADRs:** If it's over 400 lines, it's a design doc, not an ADR. Keep ADRs tight — the context and decision should be readable in 2 minutes.

**Retroactive polishing:** If the decision was made under time pressure or with imperfect information, say so. Honest ADRs are more useful than clean ones.

## Example Titles (for reference)

- `0001-use-postgresql-as-primary-database.md`
- `0002-adopt-nx-monorepo-structure.md`
- `0003-use-jwt-for-api-authentication.md`
- `0004-defer-real-time-features-to-phase-2.md`
- `0005-use-typeorm-over-prisma.md`
