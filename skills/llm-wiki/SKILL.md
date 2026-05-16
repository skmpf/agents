---
name: llm-wiki
description: Points to the LLM Wiki at `/Users/seb/wiki`. Use when the user asks to query their knowledge base ("what do I know about X"), lint the wiki, browse their wiki, or do research that should be saved to the wiki. Do NOT trigger for summarization — that's the llm-wiki-summarize skill. This skill is for wiki-level operations that don't involve ingesting a specific source.
---

# LLM Wiki

A personal wiki at `/Users/seb/wiki` — an interconnected collection of markdown pages maintained by the agent. The agent reads sources, writes wiki pages, and keeps everything current.

## How to use

1. Read `/Users/seb/wiki/AGENTS.md` — it contains the full schema: directory structure, page conventions, workflows for ingest/query/lint, and all rules.
2. Follow the AGENTS.md instructions for the current operation.

Every session that touches the wiki starts by reading AGENTS.md. It is the source of truth for all wiki conventions.
