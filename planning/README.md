# Project planning (orphan branch)

This branch has **no shared history** with `main` or any feature branch. It holds personal
fork-maintenance notes that must not ride into upstream-facing PRs.

## Contents

| Path | Purpose |
|------|---------|
| `planning/fork-relay/SKILL.md` | Agent skill: backup → replay onto upstream → rebuild PR subsets |
| `planning/fork-relay/relay-map.md` | Durable SHA map (original → replay → branch tips) |

## Usage

```bash
git fetch fork project-planning
git show fork/project-planning:planning/fork-relay/relay-map.md
```

After each relay run, commit updates here and push to `fork/project-planning`. Copy skill files to
`~/.codex/skills/fork-relay/`, `~/.cursor/skills/fork-relay/`, and `~/.claude/skills/fork-relay/`
for local agent discovery.

Do **not** merge this branch into `david/upstream-plus-features` or open PRs against upstream from it.
