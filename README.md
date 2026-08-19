# agents

Cross-harness agent config, cloned to `~/.agents`. `AGENTS.md` and `skills/`
are read by most harnesses by default; the `pi/` tree holds pi-specific config.

```
AGENTS.md     global agent instructions
skills/       agent skills
pi/agent/     pi config — symlink ~/.pi/agent → here
```

## pi

```
ln -s ../.agents/pi/agent ~/.pi/agent
```

Makes `~/.pi/agent` a single symlink into this repo, so the repo _is_
`~/.pi/agent`. Remove an existing real `~/.pi/agent` first — `ln -s` won't
replace an existing directory.

Local/offline LLM work (LM Studio, MLX, `lm-studio/*` models): see
[docs/local-qwen-pi.md](docs/local-qwen-pi.md) — memory budget, gotchas,
measured performance.

Secrets, dependencies, and runtime state are gitignored (see `.gitignore`).
