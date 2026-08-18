---
description: Two parallel subagent reviews — code-review (standards/spec) + ponytail-review (over-engineering)
argument-hint: "[current PR | current changes | <commits>]"
---
Resolve the diff from the argument:

- `current PR` → `gh pr diff`
- `current changes` → staged + unstaged (`git diff HEAD`)
- no argument → all commits since the base: `b=$(for r in upstream/main upstream/master origin/main origin/master; do git rev-parse --verify -q "$r" && break; done); git diff "${b:?no remote base found}"...HEAD`
- commit list → exactly those commits (`git show <commits>`)

Then launch ONE foreground workflowScript (`async: false`) with `runs.all`, two fresh-context children:

1. key `code-review`, `skill: ["code-review"]`, task:
   Run the code-review skill against the resolved diff. One override: you cannot spawn subagents, so review BOTH axes yourself — Standards (repo standards sources + the skill's smell baseline) and Spec (originating issue/spec) — following the skill's process for each. Under 400 words.

2. key `ponytail`, `skill: ["ponytail-review"]`, task:
   Run the ponytail-review skill against the resolved diff. One line per finding in the skill's format, ending with the net-lines metric.

Output both reports verbatim under `## Code review` and `## Over-engineering` headings, each with a one-line summary. Keep lanes separate; no fixes.
