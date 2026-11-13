# Fork relay map (david / t3code)

**Purpose:** stable lookup from pre-upstream **original** SHAs → latest **replay** SHAs, PR branch tips, and what still needs relay work. Update after every fork-relay run on branch `project-planning`.

---

## Current state (2026-11-13)

| Item | Value |
|------|-------|
| Upstream base | `b63d3c5923` — `origin/main` at relay time. `origin/main` later moved to `41e69ffa06` (303 commits); this integration was not rebased onto that tip |
| Backup snapshot | `12d02a8ee2` on published `fork/backup/david-pre-upstream-merge-20261113` |
| Integration branch | `david/upstream-plus-features` at `2795c7bfdd` — 10 selected commits on `b63d3c5923` |
| Fork integration PR | davidmashburn/t3code **#1** now points at this tip |
| Left out | D `focused-browser-zoom` and J `desktop-thread-deep-links` (upstream already has them). M `local-upstream-refresh` stays on `david/relay-m-local-upstream-refresh-20261112` at `2d9333e6e2`. N dropped |
| Checks | contracts and server typecheck clean aside from existing Effect schema suggestions. Migration repair and Codex provider tests passed (21) |

Selective replay onto `b63d3c5923`, oldest first:

| Feature | Replay | Subject | Conflict notes |
|---------|--------|---------|----------------|
| B `draft-startup-loop-fix` | `d1bc679761` | prevent draft startup render loops | clean on this base |
| C `open-panel-loop-fix` | `856e4f12aa` | prevent open panel render loops | clean on this base |
| G `watch-approval-restart-coverage` | `5ba7055128` | approval wakes and watcher recreation | test-only; upstream reactor, not the central watch list |
| A `fork-migration-history-repair` | `4a9029f18b` | reconcile fork migration collisions | kept upstream per-migration transactions; reconcile runs first |
| E `codex-fast-opt-in` | `be02189ca7` | require opt-in for Fast service tiers | kept upstream Cyber Access selection |
| F `central-pr-watches` | `76e856dcfc` | central pull request watch list | clean on this base |
| H `composer-usage-ring` | `fb0f644220` | provider usage beside context usage | clean on this base |
| L `alpha-safe-rebuild` | `0d3702d26e` | safe local Alpha rebuild | fork-local |
| K `bottom-first-active-workflow` | `1a7ca2dda1` | work the active list from the bottom | fork-local |
| I `claude-session-mirroring` | `2795c7bfdd` | mirror external sessions on V2 | kept upstream title-regeneration fields |

## Previous state (2026-10-02)

| Item | Value |
|------|-------|
| Upstream base | `54084ae1e` — fetched `origin/main` |
| Backup snapshot | `ab6d68795` on published `fork/backup/david-pre-upstream-merge-20261002` |
| Old fork point | `935c55b37` |
| Integration branch | `david/upstream-plus-features` at `00b979961` — 21 commits replayed plus compatibility follow-up and Mermaid preview |
| Fork integration PR | davidmashburn/t3code **#1** (open) |
| Typecheck | server, web, desktop, contracts, client-runtime clean after relay compatibility fixes |
| Publication | pushed 2026-10-02 with the approved exact force-with-lease; Mermaid preview is a separate feature commit |

### PR branch relay status

| PR | Branch | Repo | Relay done? | Tip | Replay commits used |
|----|--------|------|-------------|-----|---------------------|
| **#1** | `david/upstream-plus-features` | davidmashburn/t3code | published | `00b979961` | 21 replay commits plus compatibility follow-up |

### Follow-up fixes on top of the replay (not part of any original)

Kept as separate commits so the replay commits stay faithful ports and the parity check keeps
working. Fold them into the originals only if you ever rewrite the backup branch.

| SHA | What |
|-----|------|
| `75b568102` | Restores the three `readOnlyReason` guards the mirror replay dropped in `ChatComposer.tsx` |
| `928f3cf12` | `ClaudeSettingsPatch` optional-vs-optionalKey; `mergeThreadMessageProjection` undefined deref |
| `4a50e6366` | `openThread` added to the `DesktopLifecycle.test.ts` window mock |
| `90436df6e` | Repairs settled-thread columns after the pre-replay migration `33` collision |
| `5fdc1129d` | Resolves earlier upstream contract, formatter, generated-type, and migration-order collisions |
| `9d64f93df` | Repairs shipped migration collisions for settlement and auth client metadata |
| `6fa75b9b0` | Selects session ownership in runtime context queries |
| `dd734fa3b` | Repairs shipped 53/54 collisions, renamed mirror handlers, fixtures/APIs, and usage UI tokens |
| `00b979961` | Renders Mermaid diagrams in Markdown document previews; separate from relay compatibility work |

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

Use **Original** when reading backup / old threads. Use **Replay @ 54084ae1e** for cherry-picks today. **Integration order** is oldest → newest; follow-ups retain their actual interleaved order in git history.

| # | Original | Replay @ 54084ae1e | Subject | Conflicts (last run) |
|---|----------|-------------------|---------|----------------------|
| 1 | `8209478f6` | **`58322282d`** | Cursor session resume / assistant ordering | retain reasoning namespace and queued diff ingestion |
| 2 | `d0a2c9406` | **`7d5540b26`** | t3:// deep links + DMG build fixes | clean |
| 3 | `73179447c` | **`b77131184`** | Deep link routing / Alpha vs Nightly bundle IDs | clean |
| 4 | `7cb4e2920` | **`6b7c1ae27`** | Find-in-thread + desktop Alpha install helpers | retain main-app location tracking, backdrop, and Tiptap CSS |
| 5 | `8f750e9e1` | **`96a42172b`** | Local upstream update workflow | clean |
| 6 | `9a27ca8d7` | **`8ce14aa66`** | Codex account usage UI | retain upstream native usage probe and managed-auth behavior |
| 7 | `6c57e576a` | **`b239004ab`** | Workspace test imports | clean |
| 8 | `3cf1054b6` | **`eca59d78a`** | Claude session mirroring | preserve upstream 53; fork ownership reapplied by compatibility 56 |
| 9 | `c91ac7292` | — | Empty merge | **skipped** |
| 10 | `a31059275` | **`c34663d12`** | Mirrored turns split-assistant fix | clean |
| 11 | `421a28f03` | **`4aa976f7e`** | Never send Codex Fast/priority tier | also hide new ultrafast tier |
| 12 | `1088fe6b8` | **`9dcc52251`** | Gate Codex Fast behind a setting | keep runtime config guards and merge fast setting |
| 13 | `ad69379d7` | **`b4fe5250d`** | Hide Codex spend while rolling limits remain | clean |
| 14 | `2952bb759` | **`09fadb95e`** | Safe Alpha desktop rebuild command | clean |
| 15 | `434de4311` | **`abf961d35`** | Claude account usage limits | retain upstream reset-credit coordinator |

### PR subset → which map rows to cherry-pick

| Target branch | Reset to `origin/main`, then cherry-pick (integration replay SHAs) |
|---------------|---------------------------------------------------------------------|
| `feat/t3-deep-link-protocol` (if reopened) | `7d5540b26`, `b77131184`, `4a50e6366` |
| `feat/find-in-thread` (if reopened) | `6b7c1ae27` |
| `fix/cursor-resume-assistant-message-order` (if reopened) | `58322282d`; include relay streaming fixture adaptations when picking tests |
| `feat/provider-account-usage` (if reopened) | `8ce14aa66`, `b4fe5250d`, `abf961d35`, `5fdc1129d`; include usage popover compatibility from relay follow-up |
| `david/upstream-plus-features` | all rows 1–8 and 10–15 (skip 9), then all follow-up fixes |

**Note:** Subset branches get **new tip SHAs** when picked directly onto `origin/main` (e.g. #2424 tip `26cff8f0e` ≠ integration replay `2042636f4`). Content matches; parents differ. For PR rebuilds, cherry-pick integration replay SHAs in order — do not copy tip SHA from integration.

---

## Replay SHA lineage (for archaeology)

### 2026-10-02 incremental relay parity

All 21 pre-relay commits were compared by file set and numstat. Eight intentional differences are recorded below; no fork feature was intentionally dropped. New compatibility commit `dd734fa3b` repairs the shipped 53/54 schema collision, updates renamed shell-query handlers, adapts test fixtures/APIs and usage UI tokens, and adds mirror takeover/release coverage.

| # | Pre-relay SHA | Replay SHA | Parity / intentional difference |
|---|---------------|------------|--------------------------------|
| 1 | `44ced9914` | `58322282d` | Keep upstream reasoning namespace and queued diff ingestion; assistant-ID fixtures adapted in compatibility follow-up. |
| 2 | `5263f50c2` | `7d5540b26` | File sets and numstat unchanged. |
| 3 | `07cc36b24` | `b77131184` | File sets and numstat unchanged. |
| 4 | `d2908fc8e` | `6b7c1ae27` | File sets and numstat unchanged. |
| 5 | `8e823fd9a` | `96a42172b` | File sets and numstat unchanged. |
| 6 | `184b5b0e3` | `8ce14aa66` | Keep upstream native usage and managed-auth guard; normalize fork account usage. |
| 7 | `b7a02e634` | `b239004ab` | File sets and numstat unchanged. |
| 8 | `356107bdb` | `eca59d78a` | Keep upstream manifest 53; reapply fork ownership through compatibility 56. Preserve upstream reasoning ingestion. |
| 9 | `f5734a48b` | `c34663d12` | File sets and numstat unchanged. |
| 10 | `cc442dcc3` | `75b568102` | File sets and numstat unchanged. |
| 11 | `d6ee7fbc4` | `928f3cf12` | File sets and numstat unchanged. |
| 12 | `2ba140362` | `4a50e6366` | File sets and numstat unchanged. |
| 13 | `2cfb978bc` | `90436df6e` | Keep upstream manifest 54; reapply fork settled repair through compatibility 56. |
| 14 | `bb1350194` | `4aa976f7e` | Hide upstream's newly added ultrafast tier as well as fast. |
| 15 | `c8d6e2a4c` | `9dcc52251` | Preserve upstream resolved configuration merge; formatter-only fixture difference. |
| 16 | `67fe57772` | `b4fe5250d` | File sets and numstat unchanged. |
| 17 | `f328eb990` | `09fadb95e` | File sets and numstat unchanged. |
| 18 | `23e58fb09` | `abf961d35` | File sets and numstat unchanged. |
| 19 | `7e4dedbb0` | `5fdc1129d` | Native usage overlaps upstream; keep failure guard and new coordinator signature. |
| 20 | `27b540a11` | `9d64f93df` | File sets and numstat unchanged. |
| 21 | `ab6d68795` | `6fa75b9b0` | Preserve upstream snapshot structure; formatter differences in ownership query. |

Validation: affected package typechecks passed (server, web, desktop, contracts, client-runtime). Focused server tests passed after fixture repairs, including 73 reactor and two migration collision tests; desktop 60 tests passed; web 455 tests passed across initial run and corrected settings rerun. Changed-file lint has warnings but no remaining errors after compatibility fixes. Two failures reproduced on untouched upstream `54084ae1e`: ProviderRegistry binary-path re-probe and cross-architecture Windows packaging.

A read-only VACUUM snapshot of real state migrated through 56 without changing shipped migration history; all 301 visible runtime contexts decoded, and integrity remained `ok`. Rebuilt CLI project creation succeeded against an isolated copy, with persisted project/event verified and no fresh CLI runtime errors. Browser/UI, native/mobile, installed Alpha, and full local CI checks were not run. Mermaid work is committed separately as `00b979961`; 104 focused Markdown/file-preview tests, web typecheck, and production web build passed. Mermaid lint has existing warnings and no errors. Its safety stash is retained. Build-only macOS arm64 packaging produced `release/T3-Code-0.0.44-arm64.dmg` and ZIP; DMG checksum verification passed. Nothing was installed or relaunched. GitHub code checks remain queued; PR-size labeling failed with `spawnSync git ENOBUFS`.


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
| 2026-10-02 | `fork/backup/david-pre-upstream-merge-20261002` | `ab6d68795` | Published before rebase of all 21 commits onto `54084ae1e` |
| 2026-11-13 | `fork/backup/david-pre-upstream-merge-20261113` | `12d02a8ee2` | Previous `david/upstream-plus-features` tip, including the node-pty pin, before replacement by `2795c7bfdd` |

---

## Conflict playbooks (t3code)

| Area | Rule |
|------|------|
| `ChatComposer.tsx` | Keep upstream composer **drawer** (#7150+). Add fork props to drawer/footer; drop duplicate pre-drawer footers. |
| `ProviderRuntimeIngestion.ts` | Keep upstream reasoning IDs, segment reuse and queued diff handling; scope assistant IDs by turn using fork `assistantMessageIds`. |
| Desktop deep links | Keep upstream IPC; add `OPEN_THREAD` + `DesktopDeepLinks` + sidebar queue. |
| Migrations | IDs are persisted data. Never renumber shipped fork IDs 53/54 or rewrite history. Upstream owns manifest slots 53/54; compatibility 56 idempotently reapplies both sides and auth repair 55. Test collision history and a real snapshot before installing. |
| Docs | Local update/rebuild operations live in `docs/operations/development.md`. |
