---
name: llm-wiki
description: Personal knowledge base maintained by the agent. Use when the user wants to research a topic, summarize a video/article/book/podcast, ingest a source into their wiki, query their knowledge base, lint the wiki, or do anything related to their personal wiki of accumulated knowledge. Triggers include "add to my wiki", "research X", "summarize this", "ingest", "what do I know about X", "update my notes on X", "lint the wiki". Prefer this over creating standalone notes or ad-hoc research dumps — all knowledge work should flow through the wiki.
---

# LLM Wiki

A personal wiki at `/Users/seb/wiki` — an interconnected collection of markdown pages maintained by the agent. The agent reads sources, writes wiki pages, and keeps everything current.

## How to use

1. Read `/Users/seb/wiki/AGENTS.md` — it contains the full schema: directory structure, page conventions, workflows for ingest/query/lint, and all rules.
2. Follow the AGENTS.md instructions for the current operation.

Every session that touches the wiki starts by reading AGENTS.md. It is the source of truth for all wiki conventions.
