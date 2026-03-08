---
name: write-a-skill
description: Create new agent skills with proper structure, progressive disclosure, and bundled resources. Use when user wants to create, write, or build a new skill.
---

# Writing Skills

## Process

1. **Gather requirements** - ask user about:
   - What task/domain does the skill cover?
   - What specific use cases should it handle?
   - Does it need executable scripts or just instructions?
   - Any reference materials to include?

2. **Draft the skill** - create:
   - `SKILL.md` with required YAML frontmatter at the very top of the file
   - Additional reference files if content exceeds 500 lines
   - Utility scripts if deterministic operations needed
   - Frontmatter must be delimited by `---` and include both:
     - `name: <skill-folder-name>`
     - `description: <what it does>. Use when <specific triggers>.`

3. **Validate the skill file** - before considering the skill complete, verify:
   - The file starts with YAML frontmatter delimited by `---`
   - `name` matches the skill directory name
   - `description` is present and includes an explicit `Use when ...` trigger sentence
   - The Markdown body begins after the closing `---`

4. **Review with user** - present draft and ask:
   - Does this cover your use cases?
   - Anything missing or unclear?
   - Should any section be more/less detailed?

## Skill Structure

```
skill-name/
├── SKILL.md           # Main instructions (required)
├── REFERENCE.md       # Detailed docs (if needed)
├── EXAMPLES.md        # Usage examples (if needed)
└── scripts/           # Utility scripts (if needed)
    └── helper.js
```

## SKILL.md Template

```md
---
name: skill-name
description: Brief description of capability. Use when [specific triggers].
---

# Skill Name

## Quick start

[Minimal working example]

## Workflows

[Step-by-step processes with checklists for complex tasks]

## Advanced features

[Link to separate files: See [REFERENCE.md](REFERENCE.md)]
```

## Description Requirements

The description is **the only thing your agent sees** when deciding which skill to load. It's surfaced in the system prompt alongside all other installed skills. Your agent reads these descriptions and picks the relevant skill based on the user's request.

**Goal**: Give your agent just enough info to know:

1. What capability this skill provides
2. When/why to trigger it (specific keywords, contexts, file types)

**Format**:

- Max 1024 chars
- Write in third person
- First sentence: what it does
- Second sentence: "Use when [specific triggers]"

## Hard Requirements

- Every `SKILL.md` must start with YAML frontmatter delimited by `---`
- Frontmatter is not optional, even for very small skills
- `name` should match the folder name exactly
- `description` must tell the agent both capability and trigger conditions
- Do not ship a skill until you have checked those fields explicitly

**Good example**:

```
Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDF files or when user mentions PDFs, forms, or document extraction.
```

**Bad example**:

```
Helps with documents.
```

The bad example gives your agent no way to distinguish this from other document skills.

## When to Add Scripts

Add utility scripts when:

- Operation is deterministic (validation, formatting)
- Same code would be generated repeatedly
- Errors need explicit handling

Scripts save tokens and improve reliability vs generated code.

## When to Split Files

Split into separate files when:

- SKILL.md is getting long enough that the main workflow stops being easy to scan; as a rule of thumb, split before it grows much past 150 lines
- Content has distinct domains (finance vs sales schemas)
- Advanced features are rarely needed

## Review Checklist

After drafting, verify:

- [ ] File starts with YAML frontmatter delimited by `---`
- [ ] Frontmatter includes `name` and `description`
- [ ] `name` matches the skill folder name
- [ ] Description includes triggers ("Use when...")
- [ ] SKILL.md stays concise; split rarely used detail into references before it grows much past 150 lines
- [ ] No time-sensitive info
- [ ] Consistent terminology
- [ ] Concrete examples included
- [ ] References one level deep
