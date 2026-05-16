---
name: llm-wiki-summarize
description: Ingest content into the LLM Wiki. ONLY use when the user explicitly says `/wiki` or "add to wiki". Do NOT trigger for general summarization requests — those use the default summarize skill. When triggered, handles extraction, summarization with wikilinks, topic page creation, and full wiki maintenance.
user_invocable: true
---

# LLM Wiki — Summarize (Ingest)

Ingests content into the LLM Wiki at `/Users/seb/wiki`. Takes any input — YouTube video, web article, PDF, EPUB book, podcast, lecture — and produces a rich, interlinked source page plus topic pages for every concept mentioned.

## Trigger

**ONLY** activate when the user explicitly says:
- `/wiki` followed by a URL, file, or content
- "add to wiki" or "add this to my wiki"

Do NOT activate for general summarization ("summarize this article", "what's this video about"). Those use the default summarize skill. This skill is specifically for content that should be permanently ingested into the knowledge base.

**Before starting**, read `/Users/seb/wiki/AGENTS.md` for the wiki's full conventions. This skill covers the extraction and summarization mechanics; AGENTS.md covers page structure, naming, and wiki operations.

## What this skill does

1. Extract content from the source using CLI tools
2. Save raw extracted text to `raw/`
3. Discuss key takeaways with the human (mandatory pause)
4. Create a source page in `wiki/sources/`
5. Create/update topic pages in `wiki/topics/` for every wikilinked entity
6. Update `wiki/index.md` and `wiki/log.md`
7. Git commit

## CLI tools

Check for these at the start of each session. Ask before installing.

| Tool | Purpose | Install |
|---|---|---|
| `yt-dlp` | YouTube/podcast download + metadata + subs | `brew install yt-dlp` or `pip install yt-dlp` |
| `defuddle` | Web article extraction | `npm install -g defuddle` |
| `pdftotext` | PDF text extraction | `brew install poppler` |
| `pandoc` | EPUB / DOCX → markdown | `brew install pandoc` |
| `mlx_whisper` (optional) | Local audio transcription fallback | `pip install mlx-whisper` |

Alternative to `mlx_whisper`: set `ELEVENLABS_API_KEY` to use ElevenLabs Scribe for transcription.

## Depth modes

Scan the invocation for mode tokens. If present, use them and skip the prompt:
- **Minimal**: `minimal`, `fast`, `quick`, `--minimal`, `-m` — summary note only, wikilinks left as stubs
- **Detailed** (default): `detailed`, `deep`, `full`, `--detailed`, `-d` — full topic pages for every wikilinked concept, parallel subagents for long content

If unspecified, ask.

| Step | Detailed | Minimal |
|---|---|---|
| Extract text | ✓ | ✓ |
| Save to raw/ | ✓ | ✓ |
| Source page | ✓ | ✓ |
| Depth from word count | ✓ | ✓ |
| Parallel subagents (>3000 words) | ✓ (highest model) | ✓ (Sonnet) |
| Topic pages for all wikilinks | ✓ | ✓ (stubs only) |
| Dangling-link audit | ✓ | ✓ |

## Step 1: Detect content type and extract text

### YouTube video
```bash
# Get metadata
yt-dlp --cookies-from-browser chrome \
  --print "%(id)s|%(title)s|%(duration)s|%(upload_date)s|%(view_count)s|%(channel)s|%(channel_id)s" \
  --no-download "<URL>"

# Try auto-subtitles first (fastest, free)
yt-dlp --cookies-from-browser chrome \
  --write-auto-sub --sub-lang en --sub-format json3 \
  --skip-download -o "/tmp/summarize/%(id)s" "<URL>"
```

If auto-subs exist, extract text from the JSON3 file. If not, or if quality is poor, download audio and transcribe (ask user: local mlx_whisper or ElevenLabs Scribe).

### Web article / blog post
```bash
defuddle parse "<URL>" --md -o /tmp/summarize/article.md
```

### PDF
```bash
pdftotext "<path>" /tmp/summarize/paper.txt
```

### EPUB (books)
```bash
# Extract full text as markdown (preserves chapter structure)
pandoc "<path>" -t markdown --wrap=none -o /tmp/summarize/book.md

# Extract chapter boundaries:
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

**Chapter splitting for books:**
1. Extract full text with pandoc → markdown
2. Identify chapter boundaries from headers
3. Split into one chunk per chapter
4. Dispatch parallel subagents — one per chapter (or batch ~5 chapters per subagent for >30 chapters)

**Book depth requirement:**
- Each chapter gets its own `## Chapter N: Title` section with 300-600 words
- Do NOT batch chapters into brief paragraphs
- Include key arguments, data points, examples, and quotes
- A 10-chapter book → ~3000-6000 words of summary; a 30-chapter book → ~5000-10000 words

### Other files
- `.docx`: `pandoc "<path>" -t markdown --wrap=none -o /tmp/summarize/doc.md`
- Plain text: read directly
- Pasted text: read directly from user message

## Step 2: Save to raw/

Save the extracted text to `/Users/seb/wiki/raw/YYYY-MM-DD-slug.md` where the slug is an ASCII-only rendering of the source title. Include a minimal header with source metadata:

```markdown
---
source_type: youtube
source_url: https://youtube.com/watch?v=...
extracted: YYYY-MM-DD
---
[raw extracted text]
```

## Step 3: Discuss key takeaways

**Mandatory pause.** Present the key takeaways to the human. Discuss what to emphasize, what's important, what to name the topics. Do not write to the wiki until the human approves.

## Step 4: Determine summary depth

Summary length is proportional to source length:

| Source word count | Source examples | Target summary words | Sections | TLDR |
|---|---|---|---|---|
| <1,500 | 5-min video, short article | 200–400 | 1–2 | 2 sentences |
| 1,500–5,000 | 10–20 min video, blog post | 500–1,200 | 3–5 | 3 sentences |
| 5,000–15,000 | 30–60 min video, whitepaper | 1,500–3,000 | 5–8 | 3–4 sentences |
| 15,000–40,000 | 1–3 hr video/podcast | 3,000–6,000 | 8–15 | 4–5 sentences |
| 40,000–80,000 | Short book, multi-hour series | 5,000–10,000 | 15–25 | 5 sentences |
| 80,000+ | Full book (200+ pages) | 8,000–15,000 | 20–40 | 5 sentences |

For videos/podcasts, estimate words from duration: ~150 wpm conversational, ~120 wpm interviews, ~170 wpm scripted.

Per-section depth is proportional to its share of the source material.

## Step 5: Create the source page

Create in `/Users/seb/wiki/wiki/sources/YYYY-MM-DD-slug.md`. ASCII-only filename. Follow the source page format from AGENTS.md:

```markdown
---
type: source
created: YYYY-MM-DD
updated: YYYY-MM-DD
source_type: youtube
source_url: https://...
---

> [!tldr]
> [Overview — sentence count per depth table above]

## Section 1 Title

[Summary paragraphs with [[wikilinks]] to every notable concept, person, product, etc.]

## Section 2 Title
[...]

> [!quote] [[Person Name]] — context
> "Notable quote"

## People Mentioned
- [[Person Name]] — brief context
```

### Formatting rules

1. **No `# Title` heading** — filename is the title
2. **Never repeat frontmatter in the body**
3. **`> [!tldr]`** for the overview
4. **`> [!quote]`** callouts for notable quotes (with speaker wikilink)
5. **Wikilink everything** — people, places, companies, concepts, technical terms, book/film/show titles
6. **One entity = one wikilink target.** Use alias syntax for multiple names: `[[Cobie|Jordan Fish]]`, `[[Facebook|Meta]]`
7. **Use actual characters** for non-English words, not romanization
8. **Timestamps** on section headings and quotes when available (YouTube, podcasts)

## Step 6: Create and update topic pages

### 6a. Extract and audit all wikilinks

After the source page is assembled, extract every unique wikilink programmatically:

```bash
grep -oE '\[\[[^]|#^]+' "<source_page_path>" | sed 's/\[\[//' | sort -u
```

Then check which topic pages are missing:

```bash
cd /Users/seb/wiki
for term in <each extracted term>; do
  slug=$(echo "$term" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//')
  [ -f "wiki/topics/$slug.md" ] || echo "MISSING: $term → wiki/topics/$slug.md"
done
```

**Always run this audit. Do not estimate from memory.**

### 6b. Create missing topic pages

All wikilinked entities become topic pages — people, concepts, companies, products, places, technologies. In this wiki there are no separate people or reference directories. A topic page about "Naval Ravikant" is the same thing as a topic page about "Intermittent Fasting."

#### New topics (stub)
```markdown
---
type: topic
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

> [!tldr]
1-2 sentence explanation of what this is.

## Sources
- [[source-page-slug]] — brief context
```

#### Existing topics — update
Read the existing topic page. Add new information from the source. Update the `## Overview`, add to `## Key Points`, add to `## Sources`, update `## See Also` if new related topics emerged. Update the `> [!tldr]` if the new source changes the high-level picture. Bump `updated` date.

#### For people specifically
- **Public figures**: research and write a substantive bio (career, key facts, notable work)
- **Private individuals**: minimal — only what's known from the source
- The topic page IS the person's page — no separate directory

#### Parallel dispatch
For >10 missing topics, use parallel subagents in batches of ~20.

### 6c. Verify — no dangling links

Re-run the audit from 6a to confirm every wikilink resolves. Fix any remaining gaps.

## Step 7: Update wiki/index.md

Add the new source page and any new topic pages to `/Users/seb/wiki/wiki/index.md`. Follow the index format from AGENTS.md — flat lists by page type, one-line summaries.

## Step 8: Update wiki/log.md

Prepend to `/Users/seb/wiki/wiki/log.md`:

```markdown
## [YYYY-MM-DD] ingest | Source Title
- Saved source to `raw/YYYY-MM-DD-slug.md`
- Created source page [[YYYY-MM-DD-slug]]
- Created topics: [[topic-1]], [[topic-2]], ...
- Updated topics: [[topic-3]], [[topic-4]], ...
```

## Step 9: Git commit

```bash
cd /Users/seb/wiki
git add -A
git commit -m "ingest: Source Title"
```

## Model usage

| Task | Detailed | Minimal |
|------|----------|---------|
| Content extraction | CLI tools | CLI tools |
| Section summarization | Highest available model | Sonnet |
| Topic page creation | Highest available model | Sonnet (stubs) |

Never use the cheapest/fastest model for summarization or topic creation.

## What this skill does NOT do

- Does not handle call recordings (that would be a separate skill)
- Does not create comparison pages unprompted (suggest only, per AGENTS.md)
- Does not archive binary files (text-only wiki)
- Does not update daily notes or Obsidian Bases (not used in this wiki)
- Does not handle lint operations (that's a separate workflow in AGENTS.md)
