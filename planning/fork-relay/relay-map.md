# Fork relay map (david / t3code)

**Purpose:** stable lookup from pre-upstream **original** SHAs → latest **replay** SHAs, PR branch tips, and what still needs relay work. Update after every fork-relay run on branch `project-planning`.

---

## Current state (2026-08-20)

| Item | Value |
|------|-------|
| Upstream base | `f708f63fa` — `origin/main` (#7633 timestamp assertion cleanup) |
| Backup snapshot | `e1189ed53` on `fork/backup/david-pre-upstream-merge-20260820` |
| Old fork point | `600972084` |
| Integration branch | `david/upstream-plus-features` @ **`f3ecd3e82`** (synced to fork) |
| Fork integration PR | davidmashburn/t3code **#1** (open) |
| Typecheck | web, contracts, server, desktop all clean |

### PR branch relay status

| PR | Branch | Repo | Relay done? | Tip | Replay commits used |
|----|--------|------|-------------|-----|---------------------|
| **#2424** | `feat/t3-deep-link-protocol` | pingdotgg/t3code | **yes** | **`edd18aace`** | picks from integration #2–3 plus the desktop mock fix |
| **#1** | `david/upstream-plus-features` | davidmashburn/t3code | **yes** | **`f3ecd3e82`** | all 9 replay commits plus 4 follow-up fixes |

### Follow-up fixes on top of the replay (not part of any original)

Kept as separate commits so the replay commits stay faithful ports and the parity check keeps
working. Fold them into the originals only if you ever rewrite the backup branch.

| SHA | What |
|-----|------|
| `55a41b68b` | Restores the three `readOnlyReason` guards the mirror replay dropped in `ChatComposer.tsx` |
| `a6a9622bb` | `ClaudeSettingsPatch` optional-vs-optionalKey; `mergeThreadMessageProjection` undefined deref |
| `30a3c1c1e` | `openThread` added to the `DesktopLifecycle.test.ts` window mock |
| `f3ecd3e82` | Repairs settled-thread columns after the pre-replay migration `33` collision |

| PR | Branch | Repo | Status | Notes |
|----|--------|------|--------|-------|
| #3779 | `feat/find-in-thread` | pingdotgg | closed | absorbed → integration #4 |
| #3642 | `fix/cursor-resume-assistant-message-order` | pingdotgg | closed | absorbed → integration #1 |

**Not relayed (no open PR):**

| Branch | Tip | Notes |
|--------|-----|-------|
| `feat/provider-account-usage` | `27b5cfe80` | stale local; old base; superseded by integration #6 — delete or ignore |

---

## Canonical commit map (original → latest replay)

Use **Original** when reading backup / old threads. Use **Replay @ f708f63fa** for cherry-picks today. **Integration order** is oldest → newest.

| # | Original | Replay @ f708f63fa | Subject | Conflicts (last run) |
|---|----------|-------------------|---------|----------------------|
| 1 | `8209478f6` | **`a85a8718c`** | Cursor session resume / assistant ordering | clean |
| 2 | `d0a2c9406` | **`60a8be5fc`** | t3:// deep links + DMG build fixes | clean |
| 3 | `73179447c` | **`94a5fef39`** | Deep link routing / Alpha vs Nightly bundle IDs | clean |
| 4 | `7cb4e2920` | **`6598c1b16`** | Find-in-thread + desktop Alpha install helpers | merged search state with upstream collapsed tool-group layout; one blank separator absorbed |
| 5 | `8f750e9e1` | **`17428c121`** | `scripts/update-local.sh` | clean |
| 6 | `9a27ca8d7` | **`da26d09e9`** | Codex account usage UI | clean |
| 7 | `6c57e576a` | **`5b898fee3`** | Workspace test imports | clean |
| 8 | `3cf1054b6` | **`48cc54a19`** | Claude session mirroring | clean; prior migration renumber remains **041** |
| 9 | `c91ac7292` | — | Empty merge | **skipped** |
| 10 | `a31059275` | **`63fa69670`** | Mirrored turns split-assistant fix | clean |

### PR subset → which map rows to cherry-pick

| Target branch | Reset to `origin/main`, then cherry-pick (integration replay SHAs) |
|---------------|---------------------------------------------------------------------|
| `feat/t3-deep-link-protocol` | `60a8be5fc`, `94a5fef39`, `30a3c1c1e` |
| `feat/find-in-thread` (if reopened) | `6598c1b16` |
| `fix/cursor-resume-assistant-message-order` (if reopened) | `a85a8718c` |
| `feat/provider-account-usage` (if reopened) | `da26d09e9` |
| `david/upstream-plus-features` | all rows 1–8, 10 (skip 9) |

**Note:** Subset branches get **new tip SHAs** when picked directly onto `origin/main` (e.g. #2424 tip `26cff8f0e` ≠ integration replay `2042636f4`). Content matches; parents differ. For PR rebuilds, cherry-pick integration replay SHAs in order — do not copy tip SHA from integration.

---

## Replay SHA lineage (for archaeology)

First full replay was onto `105cd5e0c`. Incremental rebases onto `b2e2ccfdb` and then `f708f63fa` rewrote all replay SHAs:

| Original | Replay @ 105cd5e0c | Replay @ b2e2ccfdb | Replay @ f708f63fa |
|----------|------------------|-------------------|-------------------|
| `8209478f6` | `d06dd9935` | `cecdf61c7` | `a85a8718c` |
| `d0a2c9406` | `1aded91d2` | `378e7bc9c` | `60a8be5fc` |
| `73179447c` | `060a8175d` | `2042636f4` | `94a5fef39` |
| `7cb4e2920` | `ac0eee6b3` | `1e85ee22a` | `6598c1b16` |
| `8f750e9e1` | `5ce3cb944` | `df1a4e040` | `17428c121` |
| `9a27ca8d7` | `c6b804cc4` | `7a93ad67e` | `da26d09e9` |
| `6c57e576a` | `03ba0cb76` | `29003db7e` | `5b898fee3` |
| `3cf1054b6` | `bf1ae7846` | `b1eb1544d` | `48cc54a19` |
| `c91ac7292` | — | — | — |
| `a31059275` | `13af83a10` | `fcd7588fb` | `63fa69670` |

#2424 branch tips: old `75a2103ac` → `9cf9ae298` → `26cff8f0e` → rebuilt as `edd18aace` (commits
`97f5e841e`, `d69a4496d`, `edd18aace` on top of `f708f63fa`). Subset branches get fresh SHAs on every
rebuild because they are picked directly onto `origin/main`; only the integration replay SHAs in
the table above are cherry-pick sources.

---

## Backup snapshots

| Date | Branch | Tip SHA | Notes |
|------|--------|---------|-------|
| 2026-08-19 | `fork/backup/david-pre-upstream-merge` | `a31059275` | 10 commits on fork point `600972084` |
| 2026-08-20 | `backup/david-pre-upstream-merge-20260820` | `e1189ed53` | Integration tip with migration repair before incremental rebase onto `f708f63fa` |
| 2026-08-20 | `backup/feat-t3-deep-link-protocol-20260820` | `26cff8f0e` | #2424 tip before subset rebuild onto `f708f63fa` |

---

## Conflict playbooks (t3code)

| Area | Rule |
|------|------|
| `ChatComposer.tsx` | Keep upstream composer **drawer** (#7150+). Add fork props to drawer/footer; drop duplicate pre-drawer footers. |
| `ProviderRuntimeIngestion.ts` | Merge upstream title guards + fork `assistantMessageIds`. |
| Desktop deep links | Keep upstream IPC; add `OPEN_THREAD` + `DesktopDeepLinks` + sidebar queue. |
| Migrations | Renumber (mirror → **041**). |
| Docs | `docs/internals/scripts.md` not `docs/reference/scripts.md`. |
