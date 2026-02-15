---
name: skill-creator
description: Guide for creating effective skills. This skill should be used when users want to create a new skill (or update an existing skill) that extends Claude's capabilities with specialized knowledge, workflows, or tool integrations.
---

# Skill Creator

This skill provides guidance for creating effective skills.

## Skill Structure

Every skill consists of a required SKILL.md file and optional bundled resources:

```
skill-name/
├── SKILL.md              (required)
└── Bundled Resources     (optional)
    ├── scripts/          - Executable code (Python/Bash/etc.)
    ├── references/       - Documentation loaded into context as needed
    └── assets/           - Files used in output (templates, icons, fonts, etc.)
```

## Questions to Ask the User

Before creating a skill, gather this information (avoid asking too many questions at once):

1. **Purpose** — "What should this skill do? Can you describe it in a few sentences?"
2. **Trigger phrases** — "What would a user say that should trigger this skill?" / "Can you give examples of how this skill would be used?"
3. **Resources needed** — "Does this skill need any scripts, reference docs, or asset files?"
4. **Existing material** — "Do you have any existing documentation, code, or templates to include?"

Conclude when there is a clear sense of the functionality the skill should support.

## Creation Steps

### Step 1: Plan Resources

Analyze the use cases to identify what reusable resources to include:

- **Scripts** — For tasks that require deterministic reliability or are repeatedly rewritten
- **References** — For detailed documentation Claude should consult while working
- **Assets** — For files used in the output (templates, images, boilerplate)

### Step 2: Create Directory Structure

```bash
mkdir -p .claude/skills/skill-name
touch .claude/skills/skill-name/SKILL.md
# Add only the subdirectories needed:
# mkdir -p .claude/skills/skill-name/{references,scripts,assets}
```

### Step 3: Write SKILL.md

#### Frontmatter (required)

```yaml
---
name: skill-name
description: This skill should be used when the user asks to "specific phrase 1", "specific phrase 2", "specific phrase 3". Be concrete and specific with trigger phrases.
---
```

- Use third-person format ("This skill should be used when...")
- Include specific trigger phrases users would say
- Include all "when to use" information here, not in the body — the body is only loaded after triggering

#### Body

- Write in **imperative/infinitive form** (verb-first), not second person
- Keep SKILL.md lean (target 1,500–2,000 words, under 500 lines) — move detailed content to `references/`
- Cover: purpose, how to use, referencing any bundled resources
- Do NOT create extraneous files (README.md, CHANGELOG.md, etc.)
- Reference supporting files so Claude knows they exist:

```markdown
## Additional Resources
- **`references/patterns.md`** — Detailed patterns
- **`scripts/validate.sh`** — Validation utility
```

### Step 4: Add Bundled Resources

Create the scripts, references, and assets identified in Step 1. This may require user input (e.g., brand assets, existing documentation). Delete any directories not needed for the skill.

### Step 5: Validate and Test

1. Confirm SKILL.md has valid frontmatter with `name` and `description`
2. Confirm description includes specific trigger phrases in third person
3. Confirm body uses imperative form, not second person
4. Confirm all referenced files actually exist
5. Test by verifying the skill triggers on expected queries

### Step 6: Iterate

1. Use the skill on real tasks
2. Notice struggles or inefficiencies
3. Update SKILL.md or bundled resources
4. Test again

## SKILL.md Format Reference

```markdown
---
name: my-skill
description: This skill should be used when the user asks to "do X", "create Y", or "configure Z".
---

# Skill Title

Brief description of what the skill does.

## Core Workflow

Step-by-step instructions in imperative form.

## Additional Resources

- **`references/guide.md`** — Detailed reference material
- **`scripts/example.sh`** — Working utility script
```
