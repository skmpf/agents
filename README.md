# agents

Git-versioned config for the [pi](https://pi.dev) agent harness, deployed with
[GNU Stow](https://www.gnu.org/software/stow/).

## Layout

```
AGENTS.md         global agent instructions (single source of truth)
pi/agent/         stow package → ~/.pi/agent/
  AGENTS.md       symlink → ../../AGENTS.md
  settings.json
  models.json
  extensions/
skills/           pi user skills (read natively from ~/.agents/skills)
```

## Install

```
git clone git@github.com:skmpf/agents.git ~/.agents
stow --dir ~/.agents --target ~/.pi pi
```

If `~/.pi/agent/` already contains real files, remove them first — stow won't
overwrite existing files.

Secrets (`auth.json`, sessions, installed packages) are not versioned.
