# AO Pipeline Monitoring Log

**Date:** 2026-03-28
**Duration:** 1 hour monitoring session
**Context:** Issues #16 (app shell) and #17 (view stubs) created, nudge script updated with direct spawning + dependency checks.

## Findings

### 16:42 - Initial state
- **vc-40**: working on `feat/issue-14` (PR #15, changelog). CI passing, 0 reviews. Likely review agent spawned by nudge.
- **vc-41**: just spawned, `session/vc-41`, no branch/PR yet. Possibly spawned for issue #16.
- **PR #15**: CI green (build SUCCESS). No reviews yet.
- **Open issues**: #14 (changelog), #16 (app shell), #17 (view stubs)
- Nudge script fix deployed (direct spawn instead of orchestrator delegation).

### 16:43 - Review completed, workers exited
- **vc-40**: exited. Completed code review on PR #15 (COMMENTED, same-account limitation). Review is thorough with 2 minor issues flagged (unnecessary fetch-depth in ci.yml, aggressive text replacements in changelog generator).
- **vc-42**: spawned and exited with no branch. Possible failed spawn for issue #16.
- **PR #15**: 1 review (COMMENTED). Nudge should pick this up for PO acceptance next cycle (review_count=1 triggers PO stage).
- **Issues #16, #17**: still no workers. Waiting for nudge to spawn.
- **dev branch**: latest commit `d2fcbb5` (CI pipeline expansion, PR #11 merged).
- **Concern**: vc-42 exited immediately without picking up a branch. May indicate spawn failure for issue #16.

### 16:44 - PO agent spawned for PR #15
- **vc-42**: now claimed `feat/issue-14` (PR #15), status "ready" (50s). Nudge spawned it for PO acceptance (review_count=1). Waiting for it to start working.
- **PR #15**: still 1 review. PO review pending.
- **Issues #16, #17**: still no workers. Issue #16 should be picked up once nudge cycle runs and finds no active session for it.

### 16:46 - Issue #16 worker spawned
- **vc-43**: NEW session on `feat/issue-16` (app shell), status "ready" (23s). Direct spawn fix is working correctly.
- **vc-42**: still "ready" on PR #15 for 2+ minutes. PO review not yet submitted (review count still 1). May not have received the PO prompt.
- **PR #15**: 1 review, CI green. PO acceptance pending.
- **Issue #17**: correctly blocked (depends on #16 which is open).
- Nudge fix confirmed working: issue #16 spawned directly without orchestrator delegation.

### 16:48 - vc-42 working, vc-43 still stuck
- **vc-42**: now "working" on PR #15. Message: "The two review issues are still present. Please fix them now". Agent is addressing code review feedback rather than doing PO acceptance. This is acceptable - fixes need to happen before PO sign-off anyway.
- **vc-43**: still "ready" on `feat/issue-16` for 2+ minutes. No PR, no activity. Agent may not have received working context. Possible issue with `ao spawn` not providing enough context for the agent to start autonomously.
- **PR #15**: still 1 review, CI green. vc-42 is working on fixes.

### 16:49 - PR #15 fixes pushed, vc-43 still idle
- **vc-42**: pushed fixes for review feedback on PR #15. CI re-running (IN_PROGRESS, started 15:55:42). Agent back to "ready" after pushing.
- **vc-43**: still "ready" on `feat/issue-16` for 3+ minutes. No PR, no commits. Agent appears stuck. Likely needs a manual prompt via `ao send`.
- **PR #15**: CI pending (new build run after fixes).

### 16:50 - PR #15 CI green again, vc-43 has commits
- **vc-42**: PR #15 CI passed after fixes (SUCCESS 15:56:29). Still 1 review. Agent idle - nudge won't re-trigger PO review because session is already active on the PR. May need manual PO prompt.
- **vc-43**: branch `feat/issue-16` exists on remote with commit `fc3458b feat: add app shell layout with sidebar navigation`. Agent shows "ready" but has done work. Likely finished pushing and is idle. No PR created yet.
- Sent manual prompt to vc-43 at 16:49 to nudge it. Agent may be processing or may need another push to create the PR.

### 16:51 - PR #18 created for issue #16, CI green
- **vc-43**: created **PR #18** "feat: app shell layout with sidebar navigation". CI passed (SUCCESS 15:58:08). Agent is "working", responding to a stale "CI failing" message but CI is actually green. Manual nudge worked.
- **vc-42**: still "ready" at 6m. Not responding to PO prompt. PR #15 still at 1 review. Agent appears unresponsive.
- **PR #18**: CI green, 0 reviews. Nudge should spawn a code reviewer next cycle.
- **PR #15**: CI green, 1 review. PO acceptance blocked by unresponsive vc-42 session.

### 16:52 - Killed stuck sessions, clearing the pipeline
- Both vc-42 and vc-43 idle for 6-7 min, not responding to prompts. Killed both.
- **PR #15** (changelog): CI green, 1 review. Nudge should spawn PO agent next cycle.
- **PR #18** (app shell): CI green, 0 reviews. Nudge should spawn code reviewer next cycle.
- **Learning**: agents go "ready" and stop responding. Active sessions block the nudge from spawning replacements. Consider adding a staleness timeout to the nudge (kill sessions idle > N minutes).

### 16:53 - Fresh session spawned after kill
- **vc-44**: just spawned (4s), `session/vc-44`, no branch yet. Nudge picked up after killing stuck sessions. Likely spawned for PR #15 (PO review) or PR #18 (code review).
- Both PRs still open, CI green. Waiting for vc-44 to claim a PR and start working.

### 16:55 - Pipeline active with 3 sessions
- **vc-44**: claimed PR #18 (`feat/issue-16`), "ready" 1m. Likely code reviewer for app shell PR. May need prompt nudge if stays idle.
- **vc-45**: claimed PR #15 (`feat/issue-14`), "working" (9s). PO acceptance agent active on changelog PR.
- **vc-46**: new session, "working" (7s), no branch yet. Purpose unclear - possibly issue spawn or duplicate.
- Reviews: PR #15 has 1, PR #18 has 0. Both CI green.
- Pipeline moving again after killing stuck sessions.

### 16:56 - PR #15 PO accepted, PR #18 under review
- **PR #15**: now has **2 reviews** (code review + PO acceptance). Pipeline should move to merge stage next nudge cycle. vc-45 exited after submitting PO review.
- **vc-47**: NEW, "working" on PR #18 (`feat/issue-16`), code review in progress.
- **vc-46**: exited without clear purpose (possible duplicate spawn).
- Pipeline progressing well. Merge agent for PR #15 expected next cycle.

### 16:57 - PR #15 merged!
- **PR #15** (changelog): **MERGED** at 16:01:31. Full pipeline completed: code review -> fixes -> PO acceptance -> merge.
- **Issue #14**: still OPEN despite PR merge. PR body may not have had "Closes #14" or issue not auto-closed. Should be closed manually or by the next nudge.
- **vc-47**: actively reviewing PR #18 (app shell), 1m into work.
- **PR #18**: CI green, 0 reviews. Review in progress.

### 16:58 - vc-47 idle, PR #18 still 0 reviews
- **vc-47**: "ready" 2m, was "working" last check. PR #18 still 0 reviews. Same staleness pattern: agent stops without completing task.
- Will kill if still idle next check and respawn.

### 16:59 - Killed vc-47, recurring staleness problem
- **vc-47**: still "ready" at 3m, 0 reviews on PR #18. Killed. Nudge will spawn fresh reviewer.
- **vc-45**: cleaned up (exited, PR #15 already merged).
- **Issue #14**: manually closed (PR #15 merged but didn't auto-close).
- **Pattern confirmed**: agents consistently go "ready" and stop responding after initial spawn. The `send_to_latest_session` with `sleep 8` may be unreliable. Agents may need the review prompt embedded in the spawn command itself, not sent as a follow-up.
- **Root cause identified**: `ao send --no-wait` fires before session is initialized. Fixed: increased sleep to 20s, removed `--no-wait` (waits for idle with 60s timeout), runs in background subshell so nudge loop isn't blocked.

### 17:01 - PR #18 code review submitted
- **PR #18**: 1 review (COMMENTED). Manual prompt to vc-48 worked. Pipeline should advance to PO stage next nudge cycle.
- **vc-49**: on `fix/issue-16-conflicts`, no PR. Possibly spawned by orchestrator to handle merge conflicts. "ready" 1m.
- Nudge script fix applied locally but nudge needs restart to pick up the `send_to_latest_session` change.

### 17:02 - PR #18 new CI run after review fixes
- **PR #18**: CI running (new build started 16:08:46). Agent likely pushed fixes addressing the review. Still 1 review.
- Both vc-48 and vc-49 "ready". Waiting for CI to complete before next pipeline step.

### 17:04 - PR #18 merged! Both features on dev
- **PR #18** (app shell): **MERGED** at 16:09:40. Merged with only 1 review (skipped PO stage). Agent or orchestrator merged directly.
- **PR #15** (changelog): already merged earlier.
- **dev branch** now has: `df2ab71 feat: add app shell layout with sidebar navigation (#18)`, `c3f0a21 feat: add automated changelog page (#15)`.
- **Issue #16**: manually closed (PR didn't auto-close it).
- **Issue #17** (view stubs): now unblocked. Depends on #16 which is now CLOSED. Nudge should spawn a worker next cycle.
- **Note**: PR #18 was merged without PO acceptance. The merge agent or original worker merged it directly after just the code review. The nudge script's review_count gate (>=2 for merge) was bypassed.

### 17:05 - Issue #17 worker spawned
- **vc-50**: NEW, `feat/issue-17` (view placeholder pages), just spawned (3s). Dependency check passed (#16 now closed). Direct spawn working correctly.
- Only open issue: #17. No open PRs.
- Pipeline flowing: #16 closed -> #17 unblocked -> worker spawned.

### 17:06 - vc-50 ghost session, manual respawn for #17
- **vc-50**: ghost session (shows in `ao status` but `ao send` says "does not exist"). Stale entry.
- **Worktree conflict**: `ao spawn 17` failed because `feat/issue-17` was already checked out by stale worktree vc-51. Removed worktree manually with `git worktree remove --force`.
- **vc-53**: successfully spawned for issue #17 after cleanup.
- **Build + tests on dev**: all passing (14 tests, all routes render correctly).
- **Learning**: stale worktrees from crashed/killed sessions block new spawns. The `ao session cleanup` command might help, or the nudge needs worktree cleanup logic.

### 17:08 - Orchestrator created issues #19-#22, spawning out of control
- **New issues created** (by orchestrator or unknown): #19 (Drizzle+SQLite), #20 (Chat UI), #21 (Chat API), #22 (Wire Chat UI to API).
- **Problem 1**: Duplicate sessions for #17 (vc-51 and vc-53).
- **Problem 2**: Workers spawned for #21 and #22 despite having dependencies. The dependency text uses inconsistent format ("Depends on database setup issue" instead of "Depends on #19"), so the `dependencies_met()` check doesn't catch them.
- **Problem 3**: No worker limit. Nudge spawns for every open issue simultaneously.
- **Active sessions**: vc-51 (#17 ready), vc-52 (#22 working), vc-53 (#17 ready), vc-54 (#21 ready).
- Issues #19 and #20 depend on #17 (correct format). Issues #21 and #22 use freetext dependency descriptions (not parseable).

### 17:10 - PR #23 created for issue #17, other workers active
- **PR #23** "feat: view placeholder pages for all routes" created. CI running (started 16:15:59). Both vc-51 and vc-53 show PR #23 (duplicate sessions, one created the PR).
- **vc-52** (#22): "working" 2m. Building chat wiring despite unresolved dependencies.
- **vc-54** (#21): "working" 1m. Building chat API despite unresolved dependencies.
- Issue #17 pipeline on track. Other workers running prematurely but may produce usable code.

### 17:12 - PR #23 CI green, previous workers exited
- **PR #23** (issue #17, view stubs): CI **passed**. 0 reviews. Ready for code review. Nudge should spawn reviewer next cycle.
- All previous workers exited (vc-51 through vc-54 gone).
- **vc-55**: new spawn for issue #22, "ready" 9s. Nudge keeps spawning for issues with freetext deps that aren't caught.
- Pipeline priority: get PR #23 reviewed and merged for #17.
- **Worker limit**: added MAX_CODING_WORKERS=2 to nudge script. Needs nudge restart.

### 17:14 - vc-57 idle on PR #23, manual review prompt sent
- **vc-57**: went "ready" after 1m without submitting review on PR #23. Same `send_to_latest_session` bug (old nudge still running). Sent manual review prompt.
- **vc-56**: "working" on issue #21 (premature, has deps). Will be limited once nudge restarts with worker cap.
- Nudge fix (`send_to_latest_session` + worker limit) not yet active. Needs restart.

### 17:16 - vc-57 zombie, respawned as vc-59
- **vc-57**: zombie session. Accepted `ao send` messages but never processed them. Status stuck on "ready". Killed.
- **vc-59**: fresh session spawned with `--claim-pr 23`. Sending review prompt with 25s delay and `--timeout 60` (no `--no-wait`). Running in background.
- **New finding**: zombie sessions are a significant pipeline blocker. Sessions show "ready" and accept messages but underlying process is dead. Need detection mechanism.

### 17:19 - PR #23 reviewed, PR #24 created
- **PR #23** (issue #17, view stubs): 1 review (COMMENTED, positive). vc-59 completed review and exited. Needs PO acceptance next.
- **PR #24** "feat: add Chat API routes" created by vc-56 (issue #21). CI pending. This issue has unresolved deps but the agent built it anyway.
- **vc-58** (#22): still working on chat wiring.
- The 25s delay + `--timeout 60` approach for `ao send` worked: vc-59 received and completed the review prompt successfully.

### 17:21 - PO agent working after manual prompt, PR #24 CI green
- **vc-61**: went "ready" without PO prompt (old nudge `send_to_latest_session` bug). Sent manual PO prompt with `--timeout 60`, now "working".
- **PR #24** (Chat API, issue #21): CI green. 0 reviews. Premature but built successfully.
- **Summary of `send_to_latest_session` bug**: old nudge uses `sleep 8` + `--no-wait` which consistently fails. Working approach: `sleep 20-25` + no `--no-wait` (let `ao send` wait for idle). Fix is in local nudge script but nudge hasn't been restarted.

### 17:23 - PR #23 merged! Issue #17 complete
- **PR #23** (view placeholder pages): **MERGED** at 16:25:22. PO acceptance submitted by vc-61, then merged (again skipped separate merge agent stage).
- **Issue #17**: manually closed. All original work items (#16 + #17) now complete.
- **PR #24** (Chat API, issue #21): still open, CI green, 0 reviews. Premature but functional.
- **Pipeline summary for #16/#17**: both features built, reviewed, and merged to dev in ~40 minutes with manual intervention for prompt delivery.

### 17:24 - PR #25 created, CI status unclear
- **PR #25** "feat: wire Chat UI to API" created by vc-58 (issue #22). CI statusCheckRollup empty (checks not yet triggered or not running). AO dashboard shows "fail" but may be stale.
- **PR #24**: still open, CI green, 0 reviews. Both premature chat PRs now open.
- **vc-56, vc-58**: both "ready" (idle). Likely zombies.
- Original scope (#16 + #17) complete. Remaining PRs are from uncontrolled orchestrator-created issues.

### 17:26 - Issues #19 and #20 unblocked, more workers spawning
- **vc-62**: spawned for issue #19 (Drizzle ORM), "ready" 29s. Dependency on #17 correctly resolved (closed).
- **vc-63**: spawned for issue #20 (Chat UI), "working" 6s. Same dependency unblocked.
- **4 active sessions** total. Old nudge has no worker limit, spawning freely.
- Dependency check working correctly (#19 and #20 were blocked by #17, now unblocked). But no concurrency control.
- PR #25: CI still showing fail/empty. PR #24: CI green, 0 reviews.

### 17:30 - 3 PRs open, agents productive
- **PR #26** "feat: Drizzle ORM + SQLite setup" created by vc-62 (issue #19). CI running.
- **PR #25** (Chat wiring): new CI run started (vc-58 pushed fixes). CI running.
- **PR #24** (Chat API): CI green, 0 reviews.
- **vc-63** (#20 Chat UI): still working, no PR yet.
- **vc-65**: new session claimed PR #24 for review. Nudge spawned it.
- Despite being uncontrolled, agents are producing functional code. 3 PRs open with CI running.

### 17:32 - All 3 PRs CI green
- **PR #24** (Chat API): CI green. vc-65 claimed for review.
- **PR #25** (Chat wiring): CI **now green** (was failing, vc-58 fixed it and exited).
- **PR #26** (Drizzle ORM): CI green.
- **vc-63** (#20 Chat UI): still working, no PR yet.
- All orchestrator-created features building successfully with passing CI.

### 17:35 - PR #27 created, reviews progressing
- **PR #27** "feat: Chat UI layout" created by vc-63 (issue #20). CI pending.
- **PR #24** (Chat API): **1 review** submitted (manual prompt worked). Needs PO next.
- **vc-66**: actively reviewing PR #26 (Drizzle ORM).
- **vc-67**: NEW, actively reviewing PR #25 (Chat wiring).
- 4 PRs open (#24-#27), all CI green or pending. Pipeline running across all orchestrator-created issues simultaneously.

### 17:38 - All sessions zombies, killed. Monitoring conclusion.
- All 4 sessions (vc-63, vc-65, vc-66, vc-67) were zombies: "ready" state, accepting messages but not processing. Killed all.
- **4 PRs open** with CI green: #24 (Chat API, 1 review), #25 (Chat wiring, 0), #26 (Drizzle ORM, 0), #27 (Chat UI, 0).
- **Root cause**: old nudge script's `send_to_latest_session` uses `sleep 8` + `--no-wait` which doesn't reliably deliver prompts. Sessions become zombies. Fix is in local script but nudge needs restart.

## Monitoring Summary

### What was accomplished
- Issues #16 (app shell) and #17 (view stubs) fully completed: built, reviewed, merged to dev.
- Orchestrator autonomously created issues #19-#22 (DB, Chat UI, Chat API, Chat wiring).
- All 4 additional features built with CI green (PRs #24-#27). Reviews partially completed.

### Key issues found
1. **`send_to_latest_session` broken**: `sleep 8` + `--no-wait` fails consistently. Fix: `sleep 20` + background subshell + `--timeout 60` (no `--no-wait`).
2. **Zombie sessions**: sessions show "ready", accept `ao send` but don't process. No detection mechanism.
3. **No worker limit**: nudge spawns unlimited sessions. Fix: `MAX_CODING_WORKERS=2` added.
4. **Issues not auto-closed**: PRs missing "Closes #N" in body. Manual closure needed.
5. **Freetext dependencies**: "Depends on database setup issue" not caught by regex. Only "Depends on #N" works.
6. **Stale worktrees**: crashed sessions leave worktrees that block new spawns.
7. **Orchestrator creates issues unsolicited**: no control over what issues get created.

### Fixes applied (local, not yet pushed)
- `dependencies_met()` function for direct issue spawning
- `MAX_CODING_WORKERS=2` limit
- `send_to_latest_session` improved (sleep 20, background, timeout 60)
- Direct `ao spawn` for issues instead of orchestrator delegation

### Needs nudge restart to activate fixes

