---
name: fork-relay
description: >
  Back up a fork integration branch, replay its commits one-by-one onto upstream main with
  annotated SHAs and conflict notes, refresh open feature PR branches from the replay, and
  maintain a growing relay map for the next catch-up. Use when the user asks to rebase a fork
  on upstream, replay cherry-picks, sync david/* branches, fork-relay, or "back up my branch
  and rebase against upstream."
---

# Fork relay

Relay fork-only work onto current `origin/main` without losing history. The backup branch is the
source of truth for *what* to replay; `relay-map.md` is the source of truth for *which SHAs map
to which* across catch-up runs.

**Canonical in-repo copy:** `fork/project-planning` branch → `planning/fork-relay/` (orphan; never
merge into feature branches). Local agents also load from `~/.codex/skills/fork-relay/`, etc.

## Remotes and branches (David / t3code)

| Remote | Repo | Use |
|--------|------|-----|
| `origin` | pingdotgg/t3code | Upstream main |
| `fork` | davidmashburn/t3code | Personal fork; force-push relay results here |

| Branch | Role |
|--------|------|
| `fork/backup/david-pre-upstream-merge` | Full pre-relay snapshot; never rewrite |
| `david/upstream-plus-features` | Integration branch (all fork features) |
| `fork/project-planning` | Orphan branch; fork-relay skill + relay-map only |
| `feat/*` | Focused PR branches; rebuild as subsets of integration replay |

## Workflow overview

```
backup snapshot  →  reset/rebase onto origin/main  →  replay commits in order
        ↓                        ↓                              ↓
 relay-map (old SHAs)    integration branch            update relay-map (new SHAs)
                                                          ↓
                                              rebuild feature PR branches (subset picks)
                                                          ↓
                         commit relay-map to project-planning; force-push fork/* code branches
```

## Step 1 — Backup (before any destructive step)

If the integration branch still has unreplayed work:

```bash
git fetch origin main fork
git branch -f backup/david-pre-upstream-merge david/upstream-plus-features
git push fork backup/david-pre-upstream-merge   # or fork/backup/... if that naming is in use
```

Record the backup tip SHA in `relay-map.md` under **Backup snapshots**.

Never reset or force-push the backup branch.

## Step 2 — Choose base strategy

**Full replay** (fork point is stale or replay map is incomplete):

```bash
git checkout david/upstream-plus-features
git reset --hard origin/main
```

**Incremental catch-up** (integration branch was already relayed; `origin/main` only moved forward):

```bash
git fetch origin main
git checkout david/upstream-plus-features
git rebase origin/main
```

Prefer incremental rebase when the relay map is current — conflicts are usually limited to
commits that touched the same files as new upstream work (often `ChatComposer.tsx` after
composer drawer refactors).

## Step 3 — Replay commits one-by-one

Read `relay-map.md` for the ordered list of **original** commits (oldest → newest).

For each original commit `ORIG`:

1. Cherry-pick from the backup branch (or `git show` / diff review if pick is empty):
   ```bash
   git cherry-pick ORIG
   ```
2. On conflict: resolve hunk by hunk using the playbooks below. Never `-X theirs`/`-X ours`, and
   never script a bulk "keep one side" resolution — see **Resolving conflicts safely**.
3. Run the parity check (below) before committing.
4. Commit message **must** include:
   - Title from the original (or sensible replay title)
   - Body line: `Replay of ORIG onto upstream (<base-sha>).`
   - Bullet list of what merged, dropped, or renumbered vs upstream
   - Reference to prior replay commit if a hunk was already absorbed
5. Record `ORIG → NEW` in `relay-map.md` after each successful pick.
6. **Skip** empty merge commits (e.g. `c91ac7292`).

Use `git commit --no-verify` only when pre-commit hooks block a large mechanical replay and
the parity check passed.

Keep replay commits **faithful ports**. Bugs you find in the original — even ones you caused
during an earlier replay — belong in separate follow-up commits on top, so the parity check
keeps reporting real drift instead of your own fixes.

## Resolving conflicts safely

A replay conflict means upstream refactored around fork code. The failure mode is resolving in
favor of upstream's structure and quietly dropping fork behavior that lived in the deleted lines.

- Resolve one hunk at a time. If you take upstream's structure, re-apply every fork behavior the
  incoming side carried into it.
- **`rg` lies on files containing NUL bytes.** `apps/web/src/components/chat/ChatComposer.tsx`
  holds upstream `\0` separators around offset 78000; ripgrep treats it as binary and silently
  stops searching there, so a grep-based "did I miss anything?" check sees only the first part of
  the file. Use `rg --text`, or scan with Python.
- Verify by symbol, not by eye. For each identifier the original commit introduced, compare
  occurrence counts and call sites between the original file and the replayed one.

### Parity check (run for every non-clean pick)

```bash
git show --numstat --format= -M <ORIG>   # file set + line counts
git show --numstat --format= -M HEAD     # same for the replay
```

Every difference must be explainable and named in the commit message: deduplicated hunks, a
renumbered migration, a moved doc, a deliberately dropped file. An unexplained shortfall is a
dropped feature. For a conflicted file, also diff the fork-introduced identifier against the
original version:

```bash
git show <ORIG>:<path> | rg --text -c '<identifier>'
rg --text -c '<identifier>' <path>
```

## Step 4 — Rebuild feature PR branches

For each open PR branch that should track upstream:

1. Identify which integration replay commits belong (see **PR subsets** in `relay-map.md`).
2. Rebuild from clean main — do not merge integration wholesale:
   ```bash
   git checkout feat/some-feature
   git reset --hard origin/main
   git cherry-pick <replay-sha-1> <replay-sha-2> ...
   ```
3. Cherry-picks from the integration branch preserve replay messages.
4. Force-push to `fork`:
   ```bash
   git push fork feat/some-feature --force-with-lease
   ```

Upstream PRs against pingdotgg/t3code keep working when head is `davidmashburn:branch`.

## Step 5 — Publish integration branch

```bash
git push fork david/upstream-plus-features --force-with-lease
```

Never force-push to `origin`.

## Conflict playbooks (t3code-specific)

| Area | Rule |
|------|------|
| `ChatComposer.tsx` | Keep upstream composer **drawer** layout (#7150+). Add fork props (`readOnlyReason`, `providerUsage*`) to existing drawer/footer components; delete duplicate pre-drawer footer blocks from incoming. |
| `ProviderRuntimeIngestion.ts` | Merge upstream title-replacement guards with fork `assistantMessageIds` scoping. |
| Desktop deep links | Keep upstream IPC (linux handler, zoom, fullscreen); add `OPEN_THREAD`, `DesktopDeepLinks`, routing queue in `AppSidebarLayout`. |
| Migrations | Renumber to next free migration (mirror used **041**, not upstream's lower numbers). |
| `docs/reference/*` | Upstream moved scripts docs to `docs/internals/scripts.md`. |
| Tests | Prefer `vite-plus/test` workspace imports when replaying test-only commits. |

## Verify before pushing

Typecheck every package the relay touched. The fork carries type errors that upstream CI never
sees, and a rebase can add more when upstream widens an interface the fork also extends:

```bash
vp run --filter web typecheck
vp run --filter contracts typecheck
(cd apps/server && vp run typecheck)     # filters do not match apps/server
(cd apps/desktop && vp run typecheck)
```

Recurring shapes worth expecting:

- A fork-widened service interface breaks an **upstream test mock added after the fork point**
  (e.g. `DesktopWindow.openThread` and `DesktopLifecycle.test.ts`).
- Fork settings fields collide with `exactOptionalPropertyTypes`. Prefer widening the fork's own
  patch schema over making a field required, which would force edits to upstream test fixtures
  and grow the next relay's conflict surface.

Then the tests for what moved:

```bash
vp test run apps/server/src/orchestration/Layers/ClaudeSessionMirror.test.ts apps/server/src/provider/ClaudeTranscript.test.ts
vp check --fix <changed files>
```

`apps/desktop` tests need a working local Electron binary; a missing one fails the suite before
any test runs and is not a relay problem.

## Step 6 — Update relay map

On branch `project-planning`, edit `planning/fork-relay/relay-map.md` and commit:

- Upstream base SHA
- Backup snapshot SHA (if new)
- Table: Original → Replay (this run)
- Notes on skipped commits and PR subset SHAs

Then sync copies to `~/.codex/skills/fork-relay/`, `~/.cursor/skills/fork-relay/`, and
`~/.claude/skills/fork-relay/`, and push:

```bash
git push fork project-planning
```

Next catch-up: use **Replay** column as cherry-pick source for incremental rebase; original SHAs
stay stable for human reference.

## Safety

- Do not `pkill` dev servers by pattern; do not write to `~/.t3/userdata`.
- Do not set `VITE_HTTP_URL` / `VITE_WS_URL` for dev.
- Force-push only `fork`, only branches you relayed.
- Stash unrelated WIP before `reset --hard`.
- Keep fork-relay docs on **`project-planning` only**. Never add `planning/fork-relay/` to feature
  branches — those feed upstream PRs.

## Related files

- `relay-map.md` — growing SHA map and PR subsets (edit every relay run on `project-planning`)
