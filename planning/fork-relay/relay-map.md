# Fork relay map (david / t3code)

**Purpose:** stable lookup from pre-upstream **original** SHAs → latest **replay** SHAs, PR branch tips, and what still needs relay work. Update after every fork-relay run on branch `project-planning`.

---

## Current state (2026-08-19)

| Item | Value |
|------|-------|
| Upstream base | `b2e2ccfdb` — `origin/main` (#7151 tool lifecycle) |
| Backup snapshot | `a31059275` on `fork/backup/david-pre-upstream-merge` |
| Old fork point | `600972084` |
| Integration branch | `david/upstream-plus-features` @ **`a68f44c1f`** (synced to `fork`) |
| Fork integration PR | davidmashburn/t3code **#1** (open) |
| Typecheck | web, contracts, server, desktop all clean |

### PR branch relay status

| PR | Branch | Repo | Relay done? | Tip | Replay commits used |
|----|--------|------|-------------|-----|---------------------|
| **#2424** | `feat/t3-deep-link-protocol` | pingdotgg/t3code | **yes** | **`26cff8f0e`** | picks from integration #2–3 plus the desktop mock fix |
| **#1** | `david/upstream-plus-features` | davidmashburn/t3code | **yes** | **`a68f44c1f`** | all 9 replay commits plus 3 follow-up fixes |

### Follow-up fixes on top of the replay (not part of any original)

Kept as separate commits so the replay commits stay faithful ports and the parity check keeps
working. Fold them into the originals only if you ever rewrite the backup branch.

| SHA | What |
|-----|------|
| `745b8dd6a` | Restores the three `readOnlyReason` guards the mirror replay dropped in `ChatComposer.tsx` |
| `fd041f7f4` | `ClaudeSettingsPatch` optional-vs-optionalKey; `mergeThreadMessageProjection` undefined deref |
| `a68f44c1f` | `openThread` added to the `DesktopLifecycle.test.ts` window mock |

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

Use **Original** when reading backup / old threads. Use **Replay @ b2e2ccfdb** for cherry-picks today. **Integration order** is oldest → newest.

| # | Original | Replay @ b2e2ccfdb | Subject | Conflicts (last run) |
|---|----------|-------------------|---------|----------------------|
| 1 | `8209478f6` | **`cecdf61c7`** | Cursor session resume / assistant ordering | clean |
| 2 | `d0a2c9406` | **`378e7bc9c`** | t3:// deep links + DMG build fixes | clean |
| 3 | `73179447c` | **`2042636f4`** | Deep link routing / Alpha vs Nightly bundle IDs | clean |
| 4 | `7cb4e2920` | **`1e85ee22a`** | Find-in-thread + desktop Alpha install helpers | clean |
| 5 | `8f750e9e1` | **`df1a4e040`** | `scripts/update-local.sh` | clean |
| 6 | `9a27ca8d7` | **`7a93ad67e`** | Codex account usage UI | ChatComposer drawer; replayed identically |
| 7 | `6c57e576a` | **`29003db7e`** | Workspace test imports | clean |
| 8 | `3cf1054b6` | **`b1eb1544d`** | Claude session mirroring | ChatComposer drawer; migration **041**; **dropped 3 guards, fixed in `745b8dd6a`** |
| 9 | `c91ac7292` | — | Empty merge | **skipped** |
| 10 | `a31059275` | **`fcd7588fb`** | Mirrored turns split-assistant fix | clean |

### PR subset → which map rows to cherry-pick

| Target branch | Reset to `origin/main`, then cherry-pick (integration replay SHAs) |
|---------------|---------------------------------------------------------------------|
| `feat/t3-deep-link-protocol` | `378e7bc9c`, `2042636f4`, `a68f44c1f` |
| `feat/find-in-thread` (if reopened) | `1e85ee22a` |
| `fix/cursor-resume-assistant-message-order` (if reopened) | `cecdf61c7` |
| `feat/provider-account-usage` (if reopened) | `7a93ad67e` |
| `david/upstream-plus-features` | all rows 1–8, 10 (skip 9) |

**Note:** Subset branches get **new tip SHAs** when picked directly onto `origin/main` (e.g. #2424 tip `26cff8f0e` ≠ integration replay `2042636f4`). Content matches; parents differ. For PR rebuilds, cherry-pick integration replay SHAs in order — do not copy tip SHA from integration.

---

## Replay SHA lineage (for archaeology)

First full replay was onto `105cd5e0c`. Incremental rebase onto `b2e2ccfdb` rewrote all replay SHAs:

| Original | Replay @ 105cd5e0c | Replay @ b2e2ccfdb |
|----------|------------------|-------------------|
| `8209478f6` | `d06dd9935` | `cecdf61c7` |
| `d0a2c9406` | `1aded91d2` | `378e7bc9c` |
| `73179447c` | `060a8175d` | `2042636f4` |
| `7cb4e2920` | `ac0eee6b3` | `1e85ee22a` |
| `8f750e9e1` | `5ce3cb944` | `df1a4e040` |
| `9a27ca8d7` | `c6b804cc4` | `7a93ad67e` |
| `6c57e576a` | `03ba0cb76` | `29003db7e` |
| `3cf1054b6` | `bf1ae7846` | `b1eb1544d` |
| `c91ac7292` | — | — |
| `a31059275` | `13af83a10` | `fcd7588fb` |

#2424 branch tips: old `75a2103ac` → `9cf9ae298` → rebuilt again as `26cff8f0e` (commits
`10a8d2743`, `b0676cabb`, `26cff8f0e` on top of main). Subset branches get fresh SHAs on every
rebuild because they are picked directly onto `origin/main`; only the integration replay SHAs in
the table above are cherry-pick sources.

---

## Backup snapshots

| Date | Branch | Tip SHA | Notes |
|------|--------|---------|-------|
| 2026-08-19 | `fork/backup/david-pre-upstream-merge` | `a31059275` | 10 commits on fork point `600972084` |

---

## Conflict playbooks (t3code)

| Area | Rule |
|------|------|
| `ChatComposer.tsx` | Keep upstream composer **drawer** (#7150+). Add fork props to drawer/footer; drop duplicate pre-drawer footers. |
| `ProviderRuntimeIngestion.ts` | Merge upstream title guards + fork `assistantMessageIds`. |
| Desktop deep links | Keep upstream IPC; add `OPEN_THREAD` + `DesktopDeepLinks` + sidebar queue. |
| Migrations | Renumber (mirror → **041**). |
| Docs | `docs/internals/scripts.md` not `docs/reference/scripts.md`. |
