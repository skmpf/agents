# Local Qwen3.8-27B on pi (LM Studio + MLX)

Verified 2026-08 on M5 / 32 GB: Qwen3.8-27B MLX 4-bit served by LM Studio on
`localhost:1234`, wired into pi as `lm-studio/qwen3.8-27b-mlx` (provider in
`pi/agent/extensions/lm-studio.ts`, scoped in `settings.json`). Three agentic
evals passed — real edits, real verification, clean tool calls throughout, and
it caught deliberately contradictory instructions instead of silently picking.

**Verdict: capable offline/privacy fallback, not a daily driver.** Quality is
frontier-adjacent; speed is the cost — ~7–8 tok/s output, 3–20× slower
wall-clock than cloud. Reach for it when offline or privacy matters, not when
you're in a hurry.

## Fresh-machine checklist

The repo (`extensions/lm-studio.ts` + `enabledModels`) is fully portable —
no paths, no machine specifics. Per machine, once:

1. ~32 GB unified memory required (16 GB weights + KV cache).
2. Install LM Studio; open once; enable the server on port 1234.
3. Download `lmstudio-community/Qwen3.8-27B-MLX-4bit` via the GUI (clean
   download; avoids the curl trap below). Serves as `qwen3.8-27b-mlx`.
4. Set the model's context length to 65536 in the GUI — **not** via
   `lms load --context-length` (silently hangs) and not LM Studio's
   `defaultContextLength` (8192). JIT auto-fit lands ~42K, below what pi
   declares, so long sessions overflow late and confusingly.

## Why 4-bit, and why 42K context not 65K

32 GB unified memory forces it: 8-bit ≈ 28 GB of weights dies before context
allocates. 4-bit ≈ 16 GB weights leaves ~8 GB for KV cache under the default
~24 GB GPU wired limit. 42K is the honest budget: the model's 262K native
window is fiction here, and 65K is rejected outright by LM Studio's resource
guardrails — weights + 65K KV ≈ 21 GiB, past what it will commit with macOS
resident.

## Gotchas (each one cost a debug cycle)

- **`lms load` hangs silently** — the load usually succeeds anyway; confirm
  with `lms ps` or just send a request (JIT load: the server loads the model
  on first request, ~15 s cold). Keep LM Studio running; the server rides the
  app.
- **The model dir must NOT contain `special_tokens_map.json`.** The upstream
  repo omits it. HF answers a fetch for it with a 200 + "Entry not found"
  body; saved as a file, that body crashes the tokenizer with
  `JSONDecodeError` and LM Studio reports only "Failed to load model."
- **Thinking is always on.** LM Studio ignores `chat_template_kwargs.enable_thinking`
  and `enable_thinking`, so pi's `:off` suffix is a no-op. To think less, put
  `/nothink` in the prompt text itself — the chat template honors it in-band.
- **`lms get <repo>` can fail to resolve known-good repos.** Direct curl to
  `huggingface.co/<repo>/resolve/main/<file>` works; 15 GB in ~4 min with 3
  parallel shard downloads into `~/.lmstudio/models/`.

## Where things live

Model: `~/.lmstudio/models/lmstudio-community/Qwen3.8-27B-MLX-4bit` (15 GB) ·
Server logs that actually show load errors: `~/.lmstudio/server-logs/` ·
pi provider: `pi/agent/extensions/lm-studio.ts`.
