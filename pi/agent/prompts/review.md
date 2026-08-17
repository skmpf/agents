---
description: Two parallel subagent reviews — code-review (standards/spec) + ponytail-review (over-engineering)
argument-hint: "[current PR | current changes | changes | <ref>]"
---
Resolve the diff from the argument (default: `changes`):

- `current PR` → `gh pr diff`
- `current changes` → `git diff HEAD` (staged + unstaged)
- `changes` → `git diff @{upstream}...HEAD`
- anything else → `git diff <ref>...HEAD`

Then launch ONE foreground workflowScript (`async: false`) with `runs.all`, two fresh-context children:

1. key `code-review`, `skill: ["code-review"]`, task:
   Run the code-review skill against the resolved diff. One override: you cannot spawn your own subagents, so review BOTH axes — Standards (repo standards sources + the skill's smell baseline) and Spec (originating issue/spec) — yourself, following the skill's process for each. Under 400 words.

2. key `ponytail`, `skill: ["ponytail-review"]`, task:
   Run the ponytail-review skill against the resolved diff. One line per finding in the skill's format, ending with the net-lines metric.

Aggregate the two reports verbatim under `## Code review` and `## Over-engineering` headings, each with a one-line summary. Do not merge or rerank findings across lanes, and do not apply fixes.
