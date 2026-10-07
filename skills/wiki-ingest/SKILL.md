---
name: wiki-ingest
description: Ingest content into the LLM Wiki at $WIKI_PATH (default ~/wiki). Fires on "add to wiki" and on extraction requests routed from the wiki skill (/wiki <URL> lands there first) — plain "summarize this" is the default summarize skill.
user_invocable: true
---

# Wiki — Ingest

Extracts a source — YouTube video, web article, PDF, EPUB, podcast, lecture — into the LLM Wiki and updates its pages.

**Wiki root:** `WIKI="${WIKI_PATH:-$HOME/wiki}"` — resolve once per session; same variable the `wiki` skill uses. Every `$WIKI/…` path below resolves against it.

**Read `$WIKI/SCHEMA.md` and `$WIKI/index.md` before starting.** SCHEMA is the authority for raw file anatomy and frontmatter, the entity/concept rule, tag taxonomy, page thresholds, and citation wikilinks; the `wiki` skill owns the surrounding workflow. This skill covers only what neither carries: extraction mechanics and the ingest sequence below.

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

From invocation tokens: **minimal** (`minimal`, `fast`, `quick`, `-m`) — digest header plus updates to existing pages; new pages only for entities/concepts already in 2+ raw sources. Sonnet. **detailed** (`detailed`, `deep`, `full`, `-d`) — full page thresholds per SCHEMA; highest available model. No token → ask the user; fallback detailed.

The depth table bounds the **digest header** (Step 2). Page updates scale with each page's share of the source; SCHEMA's 200-line split rule caps page growth.

| Source words  | Example                       | Digest length | Sections | TLDR          |
| ------------- | ----------------------------- | ------------- | -------- | ------------- |
| <1,500        | 5-min video, short article    | 200–400       | 1–2      | 2 sentences   |
| 1,500–5,000   | 10–20 min video, blog post    | 500–1,200     | 3–5      | 3 sentences   |
| 5,000–15,000  | 30–60 min video, whitepaper   | 1,500–3,000   | 5–8      | 3–4 sentences |
| 15,000–40,000 | 1–3 hr video/podcast          | 3,000–6,000   | 8–15     | 4–5 sentences |
| 40,000–80,000 | Short book, multi-hour series | 5,000–10,000  | 15–25    | 5 sentences   |
| 80,000+       | Full book (200+ pages)        | 8,000–15,000  | 20–40    | 5 sentences   |

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

**Pitfall — full MP4 per segment:** If yt-dlp reports multiple segments but the CDN serves the *entire* 26.5 MB file per segment, do NOT extract from each segment. The init segment alone contains the complete file. Extract audio from the full MP4 for Whisper, not per-segment.

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

Split one chunk per chapter. Each chapter gets its own `## Chapter N: Title` digest section of 300–600 words — never batched into brief paragraphs. Totals per the depth table.

### Other

- `.docx`: `pandoc "<path>" -t markdown --wrap=none -o /tmp/summarize/doc.md`
- Plain text / pasted text: read directly

## Step 2: Save to raw/ — digest header + source text

Write `$WIKI/raw/<subdir>/YYYY-MM-DD-slug.md` — subdir by source kind (`articles/` web articles, clippings, book notes; `papers/` PDF extractions; `transcripts/` video/podcast/meeting transcripts), date = today, ASCII slug from the source title. **The basename is the citation key**: unique across `raw/`, spelled exactly as pages will cite it, never renamed after ingest.

File anatomy (writing order; SCHEMA holds the spec):

```markdown
---
source_url: https://…          # original URL or local path, when one exists
ingested: YYYY-MM-DD
sha256: <hex of the source text — everything below the digest block>
---

## Digest

> [!tldr]
> TLDR sentences per the depth table.

## Section summaries
Per the depth table — prose, wikilinks, timestamped quotes.

---

## Source text

[extracted text]
```

- **sha256 over the source text only** (below the digest block), so re-ingest compares like with like: recompute over the fresh extraction, skip if identical, flag drift if changed.
- **Digest content**: `> [!tldr]` callout, then section-by-section summary per the depth table; timestamps on section headings and quotes when the source has them; actual characters for non-English words, never romanization.
- **Wikilinks in the digest** point only at pages that exist (or that this ingest creates, after Step 3 approval) — sub-threshold mentions stay plain text. This is the one permitted write into a raw file; it happens at creation time only.
- **Digest block boundary:** The sha256 runs from the `## Source text` line (included) to end of file — the digest header and `---` separator above it are excluded. `tools/lint.py` implements exactly this: strip frontmatter, slice from `## Source text` to EOF, hash the rest.

Completion: file saved; recomputing sha256 over the source text reproduces the frontmatter value.

## Step 3: Present the ingest preview — mandatory pause

Present two things and stop for human approval:

1. **The digest header as written** — it is immutable once this step passes.
2. **The page plan**: every entity/concept page to update or create, the specific claims each receives, tags, `sources:` additions, and the resulting confidence per SCHEMA's deterministic rule.

Both depth modes pause.

## Step 4: Apply the page plan

Classify, distribute, and gate per SCHEMA:

- **Classify** each new page by SCHEMA's entity/concept tests; file under `entities/` or `concepts/`.
- **Distribute claims**: each claim lands on its best page, cited `— [[<raw-basename>]]`. Update the tldr and body where the high-level picture changed; bump `updated:`.
- **Frontmatter**: merge `sources: [raw/<subdir>/<file>.md]`; tags from the taxonomy; confidence per SCHEMA's rule.
- **Thresholds gate creation**: create a page when SCHEMA's thresholds are met (detailed mode) or the entity/concept already has 2+ raw sources (minimal mode); otherwise the mention stays plain text. Definition stubs are a lint-survival rule, never an ingest-time creation.

Public figures: research and write a substantive bio (career, key facts, notable work). Private individuals: only what the source says.

**Audit links programmatically** — never estimate from memory. Collect every wikilink from each changed page, check each resolves to an existing page or raw file, and turn any that don't into plain text:

```bash
grep -oE '\[\[[^]|#^]+' <changed-page-paths> | sed 's/\[\[//' | sort -u
```

### Parallel dispatch — batches of ~20

- > 10 pages to create → subagents create them
- Books → one subagent per chapter (~5 chapters per subagent beyond 30)
- Long content (>3,000 words) → parallel section summarization

Summarization and page creation use the highest available model (minimal mode: Sonnet).

Completion: every planned claim placed, every wikilink resolves, audit clean.

## Step 5: Index, log, commit

- Add new pages to `$WIKI/index.md` under the correct section (Entities / Concepts / Comparisons / Queries), alphabetically; update the total-pages count and last-updated date in its header.
- Append to `$WIKI/log.md` (newest first): `## [YYYY-MM-DD] ingest | Source Title`, listing every file created or updated.
- Commit `ingest: Source Title`.

Completion: `git status` clean in `$WIKI`; the log entry names every touched file.
