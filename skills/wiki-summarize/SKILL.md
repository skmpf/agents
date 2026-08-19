---
name: wiki-summarize
description: Ingest content into the LLM Wiki at ~/wiki. Fires only on explicit "/wiki <URL>" or "add to wiki" — plain "summarize this" is the default summarize skill. Handles extraction, wikilinked summaries, topic page creation, and wiki maintenance.
user_invocable: true
---

# Wiki — Ingest

Ingests any content — YouTube video, web article, PDF, EPUB, podcast, lecture — into the LLM Wiki at `~/wiki` as a source page plus topic pages.

**Read `~/wiki/AGENTS.md` before starting.** It is the source of truth for the ingest workflow, page formats, naming, and wiki rules. This skill covers only the extraction and summarization mechanics.

## Tools

Check at start; ask before installing.

| Tool                     | Purpose                                  | Install                   |
| ------------------------ | ---------------------------------------- | ------------------------- |
| `yt-dlp`                 | YouTube/podcast download, metadata, subs | `brew install yt-dlp`     |
| `defuddle`               | Web article extraction                   | `npm install -g defuddle` |
| `pdftotext`              | PDF text extraction                      | `brew install poppler`    |
| `pandoc`                 | EPUB / DOCX → markdown                   | `brew install pandoc`     |
| `mlx_whisper` (optional) | Local transcription fallback             | `pip install mlx-whisper` |

Transcription fallback: local `mlx_whisper`, or ElevenLabs Scribe via `ELEVENLABS_API_KEY`. Ask the user which.

## Depth modes

From invocation tokens: **minimal** (`minimal`, `fast`, `quick`, `-m`) — topic stubs only, Sonnet. **detailed** (`detailed`, `deep`, `full`, `-d`) — full topic pages, highest available model. No token → ask the user; fallback detailed.

Summary length scales with source word count:

| Source words  | Example                       | Target summary | Sections | TLDR          |
| ------------- | ----------------------------- | -------------- | -------- | ------------- |
| <1,500        | 5-min video, short article    | 200–400        | 1–2      | 2 sentences   |
| 1,500–5,000   | 10–20 min video, blog post    | 500–1,200      | 3–5      | 3 sentences   |
| 5,000–15,000  | 30–60 min video, whitepaper   | 1,500–3,000    | 5–8      | 3–4 sentences |
| 15,000–40,000 | 1–3 hr video/podcast          | 3,000–6,000    | 8–15     | 4–5 sentences |
| 40,000–80,000 | Short book, multi-hour series | 5,000–10,000   | 15–25    | 5 sentences   |
| 80,000+       | Full book (200+ pages)        | 8,000–15,000   | 20–40    | 5 sentences   |

Estimate from duration: ~150 wpm conversational, ~120 wpm interviews, ~170 wpm scripted. Per-section depth proportional to its share of the source.

## Step 1: Extract

### YouTube

```bash
# Metadata
yt-dlp --cookies-from-browser chrome \
  --print "%(id)s|%(title)s|%(duration)s|%(upload_date)s|%(view_count)s|%(channel)s|%(channel_id)s" \
  --no-download "<URL>"

# Auto-subs first (fastest, free)
yt-dlp --cookies-from-browser chrome \
  --write-auto-sub --sub-lang en --sub-format json3 \
  --skip-download -o "/tmp/summarize/%(id)s" "<URL>"
```

Auto-subs exist → extract text from the JSON3 file. Otherwise download audio and transcribe (see Tools).

### Web article

```bash
defuddle parse "<URL>" --md -o /tmp/summarize/article.md
```

### PDF

```bash
pdftotext "<path>" /tmp/summarize/paper.txt
```

### EPUB

```bash
# Full text as markdown (preserves chapter structure)
pandoc "<path>" -t markdown --wrap=none -o /tmp/summarize/book.md

# Chapter boundaries
pandoc "<path>" -t json | python3 -c "
import json, sys
doc = json.load(sys.stdin)
for block in doc['blocks']:
    if block['t'] == 'Header':
        level = block['c'][0]
        text = ''.join(
            item['c'] if item['t'] == 'Str' else ' ' if item['t'] == 'Space' else ''
            for item in block['c'][2]
        )
        print(f'L{level}: {text}')
"
```

Split one chunk per chapter. Each chapter gets its own `## Chapter N: Title` section of 300–600 words — never batched into brief paragraphs. Totals per the depth table.

### Other

- `.docx`: `pandoc "<path>" -t markdown --wrap=none -o /tmp/summarize/doc.md`
- Plain text / pasted text: read directly

## Step 2: Save to raw/

`~/wiki/raw/YYYY-MM-DD-slug.md` — ingestion date (today), ASCII-only slug from the source title. Minimal header:

```markdown
---
source_type: youtube
source_url: https://youtube.com/watch?v=...
extracted: YYYY-MM-DD
---

[raw extracted text]
```

## Step 3: Discuss

Present key takeaways — what to emphasize, what to name the topics. Mandatory pause: no wiki writes before the human approves.

## Step 4: Source page

Create `wiki/sources/YYYY-MM-DD-slug.md` (same ingestion date as the raw file) following the source page format in AGENTS.md. Additions: TLDR sentence count per the depth table; timestamps on section headings and quotes when available; actual characters for non-English words, never romanization.

## Step 5: Topic pages

Every entity is a topic page — people, companies, places, concepts alike. After the source page is assembled, audit all wikilinks programmatically — never estimate from memory:

```bash
grep -oE '\[\[[^]|#^]+' "<source_page_path>" | sed 's/\[\[//' | sort -u
```

Then check which topic pages are missing:

```bash
cd ~/wiki
for term in <each extracted term>; do
  slug=$(echo "$term" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//')
  [ -f "wiki/topics/$slug.md" ] || echo "MISSING: $term → wiki/topics/$slug.md"
done
```

New topics get stub pages:

```markdown
---
type: topic
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

> [!tldr]
> 1-2 sentence explanation of what this is.

## Sources

- [[source-page-slug]] — brief context
```

Public figures: research and write a substantive bio (career, key facts, notable work). Private individuals: only what the source says.

Existing topics: add new information to `## Overview` / `## Key Points` / `## Sources`, update `## See Also` and the TLDR if the high-level picture changed, bump `updated`.

### Parallel dispatch — batches of ~20

- > 10 missing topics → subagents create the stubs/pages
- Books → one subagent per chapter (~5 chapters per subagent beyond 30)
- Long content (>3,000 words) → parallel section summarization

Summarization and topic creation use the highest available model (minimal mode: Sonnet). Never the cheapest model for either.

Re-run the audit; every wikilink must resolve before you finish.

## Step 6: Index, log, commit

Update `wiki/index.md` (format in AGENTS.md), append the log entry (format in AGENTS.md), commit `ingest: Source Title`.
