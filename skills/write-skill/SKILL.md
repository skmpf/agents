---
name: write-skill
description: Create, revise, and evaluate agent skills in a way that is portable across harnesses and agent runtimes. Use this whenever the user wants to turn a workflow into a skill, write a new SKILL.md, improve an existing skill, add eval prompts, or run a harness-agnostic skill review loop. Prefer this as the default skill-authoring workflow for any agent or harness.
---

# Write Skill

Use this skill to create or revise agent skills in a **harness-agnostic** way.

This skill is intended to be the default skill-authoring workflow for any agent or harness. It keeps the strongest general ideas from older skill-writing workflows — intent capture, realistic trigger descriptions, eval prompts, iterative review, and benchmark-style thinking — but it does not assume any one runtime as the source of truth.

## What this skill is for

Use it when the user wants to:

- create a new skill from scratch
- turn an existing workflow into a reusable skill
- rewrite a harness-specific skill so it works across agent systems
- improve a skill's trigger description without relying on runtime-specific trigger benchmarks
- add eval prompts or review criteria for a skill
- run a manual or harness-agnostic skill evaluation loop
- make a skill easier to port between different agent harnesses

## What this skill is not for

This skill is not a runtime-specific auto-trigger benchmarking tool.

If the user explicitly wants to know whether one particular harness auto-triggers a skill, say that this requires that harness's own tooling and is outside the normal workflow here.

This skill focuses on:
- skill content quality
- workflow clarity
- output expectations
- portability
- human review and harness-agnostic evaluation

## Core principle

Write the skill so that another competent agent system could follow it even if it knows nothing about a private harness runtime.

That means:
- avoid harness-specific assumptions unless clearly labeled
- separate **skill content** from **integration details**
- explain the user's intent and the why behind the workflow
- include examples and review prompts that can be used manually or in any harness
- prefer real commands and real repo paths when the skill is repo-specific

## Workflow

### 1. Capture intent

Before writing, extract or ask for:

1. What should this skill help an agent do?
2. When should it trigger?
3. What should the output look like?
4. What should it explicitly avoid doing?
5. Is the skill tied to one repo/toolchain, or should it be portable?
6. Does the user want eval prompts, a review loop, or just the skill file?

Prefer using conversation context first so the user does not have to repeat themselves.

### 2. Clarify scope and boundaries

Push for a clean boundary.

A good skill should make it easy to answer:
- when to use it
- when not to use it
- what neighboring skill or workflow should be used instead

If the workflow competes with another skill, spell out the distinction explicitly.

### 3. Research the local ecosystem

Before drafting the skill:
- inspect neighboring skills in the repo
- match naming conventions and tone where useful
- avoid duplicating an existing skill with only cosmetic differences
- reuse proven command paths, scripts, file locations, and terminology
- look for existing docs or examples that should be referenced instead of copied inline

When relevant, mention the exact local commands and files that make the workflow real.

### 4. Write the skill file

Create `SKILL.md` with:

- YAML frontmatter
  - `name`
  - `description`
- concise but specific trigger description
- clear scope
- concrete commands / file paths when repo-specific
- explicit non-goals
- reporting/output guidance

## Writing guidance

### A. Make the description do real work

The frontmatter description is the first and most important trigger surface.

It should say:
- what the skill does
- when to use it
- adjacent phrases that should still trigger it
- what it should be preferred over

Be a little pushy. Undertriggering is more common than overtriggering.

### B. Explain the why

Do not fill the skill with brittle MUST-style rules if a short explanation would teach the intent better.

Prefer:
- why the workflow exists
- why a cheaper path is preferred first
- why one tool/path is safer than another

### C. Separate portable instructions from harness-specific notes

If a workflow has harness-specific details, isolate them.

Good pattern:

```markdown
## Core workflow
...portable guidance...

## Harness-specific notes
### Agent / Harness A
...
### Agent / Harness B
...
```

This keeps the core skill reusable.

### D. Prefer realistic commands and file references

If the skill is repo-specific, reference real commands and real files.

If the skill is intended to be portable, avoid overfitting to one command runner.

### E. Include explicit non-goals

A lot of skill confusion comes from overlap. Add a short "do not use this for" section whenever neighboring skills or workflows exist.

### F. Keep SKILL.md readable

Do not bury the model in a giant wall of text if a small hierarchy would help.

When a skill gets large:
- keep the trigger surface in the top of `SKILL.md`
- move detailed references into sibling files when needed
- point clearly to those files and explain when to read them

## Skill file anatomy

A good skill directory usually looks like:

```text
skill-name/
├── SKILL.md
└── evals/
    └── evals.json
```

Optional additions when needed:

```text
skill-name/
├── SKILL.md
├── evals/
│   └── evals.json
├── references/
│   └── extra-docs.md
└── scripts/
    └── helper-script.ext
```

Use helper files only when they deepen clarity rather than scatter it.

## Eval prompts

When the user wants stronger validation, create `evals/evals.json`.

Use this schema:

```json
{
  "skill_name": "example-skill",
  "evals": [
    {
      "id": 1,
      "prompt": "Realistic user prompt",
      "expected_output": "What good behavior looks like",
      "files": []
    }
  ]
}
```

Write prompts that test:
- correct workflow choice
- boundary discipline
- command/tool choice
- output quality
- non-goals and anti-drift behavior

Prompts should sound like real users, not abstract test data.

## Harness-agnostic evaluation loop

If the user wants evaluation and no runtime-specific trigger benchmark is available, use this loop.

### 1. Structural validation

Check:
- `SKILL.md` exists
- frontmatter has `name` and `description`
- commands/files mentioned in the skill actually exist
- neighboring skills do not overlap ambiguously without explanation
- `evals/evals.json` parses and matches the expected structure

### 2. Behavioral review

For each eval prompt, ask:
- would the skill choose the correct workflow?
- would it avoid the wrong neighboring workflow?
- are the instructions actionable?
- is the output format clear?
- does the skill say enough to succeed without overfitting to the prompt?

### 3. Optional execution review

If the current harness can simulate use of the skill, run the prompt through that harness and review:
- path chosen
- commands chosen
- whether the skill drifted into a neighboring workflow
- whether the final report/output matched expectations

If the harness cannot simulate triggering, say so clearly. Do not fake a trigger benchmark.

### 4. Summarize pass / fail by dimension

Use a simple rubric:
- structural validation
- workflow choice
- boundary discipline
- instruction clarity
- output quality

### 5. Improve and rerun

If the skill is weak:
- tighten the description
- sharpen the non-goals
- add missing commands or file references
- improve eval prompts
- rerun the structural + behavioral review

## Workspace and iteration guidance

When a task is large or the user wants a real review loop, organize work like this:

```text
<skill-name>-workspace/
  iteration-1/
  iteration-2/
```

Each iteration can contain:
- copied outputs
- review notes
- grading summaries
- comparison notes

Do not invent a heavy benchmark format unless the user wants it. Simple, clear iteration notes are usually enough.

## Updating an existing skill

When editing an existing skill:
- preserve the original skill name unless the user explicitly wants a rename
- keep the directory name aligned with the skill name where possible
- preserve neighboring conventions unless they are actively harmful
- if the installed/original location is read-only, copy it to a writable path before editing

## Manual review format

When reporting a harness-agnostic eval, use a concise format like:

```text
Skill: example-skill
Eval mode: structural + behavioral review

Checks:
- Structural validation: pass
- Workflow choice: pass
- Boundary discipline: pass
- Output/report guidance: needs improvement

Notes:
- Description is strong enough to distinguish this from X
- Missing explicit non-goal for Y
- Add one eval prompt for the common edge case Z
```

## Output expectations

When finishing a skill-writing task, provide:

- the created or updated file paths
- the purpose of the skill
- the key trigger boundary
- whether eval prompts were added
- whether harness-agnostic validation was performed
- any follow-up suggested for runtime-specific trigger testing

## Example completion summary

```text
Created:
- .agents/skills/example-skill/SKILL.md
- .agents/skills/example-skill/evals/evals.json

Purpose:
- Guides the agent through ...

Boundary:
- Use this for X, not Y

Validation:
- Structural validation done
- Behavioral review done
- Runtime-specific trigger testing not run
```
