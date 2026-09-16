# Fork relay map (david / t3code)

**Purpose:** stable lookup from pre-upstream **original** SHAs → latest **replay** SHAs, PR branch tips, and what still needs relay work. Update after every fork-relay run on branch `project-planning`.

---

## Current state (2026-09-15)

| Item | Value |
|------|-------|
| Upstream base | `935c55b37` — `origin/main` |
| Backup snapshot | `434de4311` on `fork/backup/david-pre-upstream-merge-20260915` |
| Old fork point | `f708f63fa` |
| Integration branch | `david/upstream-plus-features` @ **`7e4dedbb0`** |
| Fork integration PR | davidmashburn/t3code **#1** (open) |
| Typecheck | web, contracts, desktop clean; server has unrelated Effect/orchestration baseline errors, with no errors in the touched provider files |

### PR branch relay status

| PR | Branch | Repo | Relay done? | Tip | Replay commits used |
|----|--------|------|-------------|-----|---------------------|
| **#1** | `david/upstream-plus-features` | davidmashburn/t3code | **yes** | **`7e4dedbb0`** | all 14 replay commits plus 5 follow-up fixes |

### Follow-up fixes on top of the replay (not part of any original)

Kept as separate commits so the replay commits stay faithful ports and the parity check keeps
working. Fold them into the originals only if you ever rewrite the backup branch.

| SHA | What |
|-----|------|
| `cc442dcc3` | Restores the three `readOnlyReason` guards the mirror replay dropped in `ChatComposer.tsx` |
| `d6ee7fbc4` | `ClaudeSettingsPatch` optional-vs-optionalKey; `mergeThreadMessageProjection` undefined deref |
| `2ba140362` | `openThread` added to the `DesktopLifecycle.test.ts` window mock |
| `2cfb978bc` | Repairs settled-thread columns after the pre-replay migration `33` collision |
| `7e4dedbb0` | Resolves upstream contract, formatter, generated-type, and migration-order collisions found during verification |

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

Use **Original** when reading backup / old threads. Use **Replay @ 935c55b37** for cherry-picks today. **Integration order** is oldest → newest.

| # | Original | Replay @ 935c55b37 | Subject | Conflicts (last run) |
|---|----------|-------------------|---------|----------------------|
| 1 | `8209478f6` | **`44ced9914`** | Cursor session resume / assistant ordering | clean |
| 2 | `d0a2c9406` | **`5263f50c2`** | t3:// deep links + DMG build fixes | desktop IPC conflict resolved with upstream lifecycle changes |
| 3 | `73179447c` | **`07cc36b24`** | Deep link routing / Alpha vs Nightly bundle IDs | clean |
| 4 | `7cb4e2920` | **`d2908fc8e`** | Find-in-thread + desktop Alpha install helpers | kept upstream composer drawer and replayed search behavior |
| 5 | `8f750e9e1` | **`8e823fd9a`** | Local upstream update workflow | docs moved to `docs/operations/development.md` |
| 6 | `9a27ca8d7` | **`184b5b0e3`** | Codex account usage UI | merged with upstream provider usage-limit contracts |
| 7 | `6c57e576a` | **`b7a02e634`** | Workspace test imports | clean |
| 8 | `3cf1054b6` | **`356107bdb`** | Claude session mirroring | migration renumbered to **053** |
| 9 | `c91ac7292` | — | Empty merge | **skipped** |
| 10 | `a31059275` | **`f5734a48b`** | Mirrored turns split-assistant fix | clean |
| 11 | `421a28f03` | **`bb1350194`** | Never send Codex Fast/priority tier | clean |
| 12 | `1088fe6b8` | **`c8d6e2a4c`** | Gate Codex Fast behind a setting | settings conflict resolved against upstream schema changes |
| 13 | `ad69379d7` | **`67fe57772`** | Hide Codex spend while rolling limits remain | clean |
| 14 | `2952bb759` | **`f328eb990`** | Safe Alpha desktop rebuild command | clean |
| 15 | `434de4311` | **`23e58fb09`** | Claude account usage limits | reused upstream capability probe result |

### PR subset → which map rows to cherry-pick

| Target branch | Reset to `origin/main`, then cherry-pick (integration replay SHAs) |
|---------------|---------------------------------------------------------------------|
| `feat/t3-deep-link-protocol` (if reopened) | `5263f50c2`, `07cc36b24`, `2ba140362` |
| `feat/find-in-thread` (if reopened) | `d2908fc8e` |
| `fix/cursor-resume-assistant-message-order` (if reopened) | `44ced9914` |
| `feat/provider-account-usage` (if reopened) | `184b5b0e3`, `67fe57772`, `23e58fb09`, `7e4dedbb0` |
| `david/upstream-plus-features` | all rows 1–8 and 10–15 (skip 9), then all follow-up fixes |

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
| 2026-09-15 | `backup/david-pre-upstream-merge-20260915` | `434de4311` | Integration tip before incremental rebase onto `935c55b37` |

---

## Conflict playbooks (t3code)

| Area | Rule |
|------|------|
| `ChatComposer.tsx` | Keep upstream composer **drawer** (#7150+). Add fork props to drawer/footer; drop duplicate pre-drawer footers. |
| `ProviderRuntimeIngestion.ts` | Merge upstream title guards + fork `assistantMessageIds`. |
| Desktop deep links | Keep upstream IPC; add `OPEN_THREAD` + `DesktopDeepLinks` + sidebar queue. |
| Migrations | Use the next free ID; mirror is now **053**, repair is **054**. |
| Docs | Local update/rebuild operations live in `docs/operations/development.md`. |
