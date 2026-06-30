# Implementation Performance Log

## BRDG-438 — Inbox new-unread count, all/new filter, digest deep-link (2026-06-29)

Five commits across five checkboxes: `baselineAt` (`MAX(readAt)`) added to the `/api/new-stories` response + route test; the BRDG-434 visit baseline retired (route moved to `deleted/`); `isNewSinceLastViewed` unified into the single shared predicate (digest + dot + count/filter); `newOnly`/`displayRows`/`newCount` wiring + select-all/empty-state repointed; the brand "N new" header chip; `InboxDigestBanner` "Open inbox" → `/inbox?new=1` behind a Suspense boundary. Clean-worktree verify: lint 0 errors, typecheck clean, build green, 7187/7189 tests pass. Browser-verified the chip and the `?new=1` deep-link (chip `aria-pressed=true`, brand-500 fill) in the real app.

| Phase | Notes |
|---|---|
| Plan (Opus) | High value. Surfaced the load-bearing risk before any code: the dot/filter predicate used plain `new Date()` while the digest normalised SQLite `datetime('now')` via `parseStamp`, AND the two disagreed on null-baseline/null-created. Left unfixed, the chip count would not match the digest banner (an explicit AC). |
| Implement | Resolved that risk by collapsing both into ONE dependency-free predicate (`isNewSinceLastViewed`, permissive + UTC-normalised) and having `computeInboxDigest` delegate to it — server and client can no longer drift. Net deletion in the digest (its inline `parseStamp` filter went away). |
| Verify | Two harness snags (below), no product bugs. |

Key bottlenecks / lessons:
- **`ViewHeader` renders through a portal (`createPortal` into `#view-header-portal`), so it returns `null` in jsdom.** The header-chip tests failed with "unable to find button /1 new/" until the test seeded `<div id="view-header-portal">` in `beforeEach`. Lesson: any test asserting on `ViewHeader` content must provide the portal target; existing inbox tests silently never asserted header content, which hid this.
- **Adding `useSearchParams` forced a Suspense split + a `next/navigation` mock.** App Router fails the build if `useSearchParams()` isn't under `<Suspense>`, and the existing inbox tests didn't mock `next/navigation`, so every test would have thrown. Both were one-liners once anticipated (the Plan flagged them).
- **Parallel-session contamination, again.** The shared tree had uncommitted work from another session, and that session's committed `2803cfa7 feat(nav): add New story launcher` left a second red guard (`menu-button-guard`: NavPanel `active:scale-95`) on `dev`, on top of the pre-existing `focus-ring-guard`/StoryWriterChat one. Verified BRDG-438 in a throwaway `git worktree add HEAD` (node_modules symlinked) so neither the uncommitted files nor the unrelated red guards muddied the signal; both failures are logged in `docs/investigations/2026-06-29-focus-ring-guard-failing-storywriterchat.md`. The worktree-at-HEAD pattern is now the reliable way to get a true verify on this machine.
- **Dev data can't demo a small "N new".** The dev-bypass user has 9076 unread and `baselineAt=null` (never triaged), so every row is "new" → chip read "9076 new". A narrow creator filter kept the (non-virtualised) rendered list small for the screenshot while the chip still counted the full unread set; baseline is `MAX(readAt)`, so a realistic small count can't be staged without bulk-marking reads.

## BRDG-434 — Inbox "new since last visit" marker + tidy unassigned rows (2026-06-29)

Four commits across three checkboxes: per-user `inbox_last_viewed` setting route (`createUserJsonSettingRoute`) + pure `isNewSinceLastViewed` helper; two opt-in `BoardRow` props (`isNewSinceLastViewed` dot in a reserved leading slot, `hideEmptyAssignee` collapse); inbox wiring (freeze baseline once via adjust-state-during-render, re-stamp `now` in an effect). Helper + route + BoardRow unit tests green; production build green; browser-verified the dot, the advance-on-revisit cycle, and the collapsed assignee gap.

| Phase | Notes |
|---|---|
| Plan (Opus) | Confirmed the authored plan and pinned the details that mattered: `createUserJsonSettingRoute` returns 400 on schema mismatch (route-test assertion), the dot slot must sit OUTSIDE the tabular-nums pill div, and the inbox passes no `onAssigneeChange` so unassigned rows hit the read-only spacer the collapse targets. |
| Implement | Smooth. One deliberate design call: reserve the dot slot whenever the prop is *defined* (inbox passes a boolean per row) so keys align across new/non-new rows, while leaving it `undefined` keeps the board fully inert — no extra host flag needed. |
| Verify | The blocker was environmental, not the code (see below). |

Key bottlenecks / lessons:
- **Shared dirty tree from a parallel session broke `eslint .` and the full suite signal.** A parallel session's churn produced a transient lint `ENOENT` and its committed `8dcc6aed` left `focus-ring-guard.test.ts` red on `StoryWriterChat.tsx` (unrelated to this story). Verified my work in a throwaway `git worktree add HEAD` (clean of the parallel session's uncommitted files) with `node_modules` symlinked: full lint 0 errors, typecheck clean, 7145/7146 tests pass (the 1 failure pre-exists on dev — logged in `docs/investigations/2026-06-29-focus-ring-guard-failing-storywriterchat.md`), build green. Lesson: when the tree carries parallel work, a worktree at HEAD is the only trustworthy `verify`/`build` signal.
- **Dev-bypass user has ~9075 unread inbox rows and the inbox list is NOT virtualized**, so a naive `/inbox` screenshot risks hanging the page. Set a narrow `inbox_filters` creator list (and an old `inbox_last_viewed` baseline so every row dots) via the settings API with the bypass cookie, screenshotted an 8-row set, then reset the filters. Lesson: stage a small filtered set before screenshotting data-heavy non-virtualized lists.

Eight phases, 5 commits: schema + migration (author columns on `ticket_status_change` + `status_change_seen` table), changelog-author capture in sync (`extractLastStatusChangeAuthor`), read endpoint + per-user seen store + `useStatusChanges` live hook, derived "what's new (24h, not me)" in the query, the `StatusChangeLine` board UI (ported from the variant-1 prototype), a permanent "Finished work" divider in `TicketTable`, and the optimistic move-to-bottom (reusing `spliceKeyIntoOrder` against `poPriorityOrder`, marking seen in the same gesture). Full suite green (6,951) + production build green.

| Phase | Notes |
|---|---|
| Plan (Opus) | Strong. Caught three things that shaped the build: the changelog author shape lacks `accountId` (so changer-vs-assignee is name-based with accountId as refinement — though Jira Cloud does send it, so I added it optionally); the line must stack INSIDE the row's single `<td>` (not a 2nd `<tr>`) or the virtualizer's per-row height desyncs; deploy/pipeline maps + `openSubtaskCount` already reach the row, so no new fetch |
| Implement | Mostly clean. One scoping pivot: `ticket_status_change.sprintName` is stored inconsistently (a name from incremental sync, an id from sprint sync), so I scoped the queue by the active sprint's ticket KEYS instead — robust and exactly "the sprint shown". Mixed timestamp formats (jiraComment ISO vs storyVersion SQLite-default) handled with a coarse date-prefix SQL filter + precise JS 24h refine |
| Verify | Two rounds of test-mock breakage (expected when adding a jira-client export): the new `extractLastStatusChangeAuthor` had to be registered in `upsert-issue.test`, the inline `sync-incremental` mock, and the shared `src/test/mocks/jira-client.ts`; the new `CheckCheck` icon in `TicketTable.test`'s lucide mock. All fixed; suite green |

Key bottlenecks / lessons:
- **Adding an export to `@/lib/jira-client` breaks every test that mocks it.** Three mock sites (one shared, two inline) plus a lucide-mock for the one new icon. Grep `extractLastChangeAuthor:` across tests to find the sibling mocks before running the full suite.
- **Live visual check was BLOCKED by an environmental dev CSS error unrelated to this story.** Untracked parallel-work docs (`BRDG-418`, `BRDG-424`) contain the literal string `bg-[var(--color-surface-*)]` in prose; Tailwind v4's content scanner reads `.md` files and generates an invalid `var(--color-surface-*)` rule, which Turbopack dev refuses to parse (production `build` tolerates it, so the build passed). Clearing `.next` doesn't help — Tailwind re-scans the docs. Tracked by the pre-existing BRDG-418. Did not touch the parallel files. Relied on the component render test + production build + the earlier in-browser prototype render for visual confidence.

## BRDG-396 — Filters for the Link issue modal (2026-06-25)

Added server-side filters (issue type w/ default subtask exclusion, sprint-with-state, epic, last-updated, project, assignee + same-epic/same-sprint presets) to `/api/tickets/search`, threaded through the api-client and `useLinkIssueSearch`, and built `LinkIssueFilterBar` reusing the board's `FilterDropdown`/`FilterChip`. Fixed a latent bug: the subtask exclusion compared `'sub-task'` but the type is `'Subtask'`, so subtasks were leaking in. 4 commits + archive; isolated full suite (6,597) + build green.

| Phase | Notes |
|---|---|
| Plan (Opus) | Strong: caught that sprint state lives in the `appSetting` JSON blob (not `sprintNameCache`), recommended reusing `/api/jira/sprints` + `/api/epics` + server facets over any new endpoint, and correctly flagged the single-project-hide and Jira-fallback-vs-filters edge cases |
| Implement | Mid-flight switched filters from single-value to multi-select (CSV) to match the board's `FilterDropdown` idiom — more consistent and less custom UI than building single-selects; backward compatible with the already-written single-value route tests |
| Verify | Shared tree was non-compiling due to a **parallel session's** in-progress story-writer refactor (`src/types/story-writer.ts` importing a not-yet-existing `RelatedStoryCandidateRow`). Verified my work in a throwaway worktree at HEAD (symlinked `node_modules`): typecheck + build + 6,597 tests all green. Browser-confirmed the filter bar renders correctly in the modal |

Key bottlenecks / lessons:
- **Same dirty-shared-tree hazard as BRDG-343/347/352.** A concurrent session left the working tree non-compiling; `npm run verify` in the main tree failed on *their* files. Confirmed external (the break was entirely in story-writer files I never touched), then verified in an isolated worktree so the contamination couldn't mask or fake my result. Staged only explicit paths throughout.
- **The user's screenshot was the inline link editor, not the modal.** The full `LinkIssueDialog` (where the filter bar lives) opens via the inline editor's "Expand search" (Cmd+Shift+K) control — worth knowing for future link-modal work.
- **Portal-based `FilterDropdown` triggers are awkward to drive via synthetic clicks** (dispatching on the wrapper closed the modal). Render verification + unit-tested behavior was the pragmatic stopping point rather than fighting the automation.

## BRDG-391 (safe parts) + BRDG-393 (Cleanup) — scope fetches / virtualize lists (2026-06-24)

Asked to land the "safe parts of 391" plus 393. Net delivered: BRDG-393 Cleanup virtualization (per-row `<tbody>` window, threshold 40, unit tests + browser-verified scroll). BRDG-391's safe parts were implemented (A1 sibling hook + SessionEndModal swap) and then **backed out**; 391 left open as do-as-a-unit. Full suite (6,499) + build green.

| Phase | Notes |
|---|---|
| Plan (Opus) | Good: confirmed the sibling-hook approach, the SessionEndModal data-loss trap, and correctly called Inbox a non-mechanical defer (nested per-group tbodies) and Cleanup a go |
| Implement 391 | Built A1 + Site 2 with tests (green), then a render-tree check revealed the win is illusory (below) — backed out cleanly via `git checkout <pre>~ -- files` after confirming no parallel edits to those files |
| Implement 393 | Cleanup virtualization; chose per-row `<tbody>` over "measure the row, fold rationale into the estimate" to avoid cumulative scroll drift on the two-`<tr>` rows |
| Verify | Full suite green; browser-verified Cleanup at 280 candidates: windowing live (29→51 tbodies mounted of 280, ~16k px scroll height), rationale lines stay paired, no layout breakage on scroll |

Key bottlenecks / lessons:
- **A "safe slice" can be net-negative if a sibling component holds the same fetch.** Scoping `SessionEndModal`/the session page off `useTickets("__all__")` looked safe, but `useTicketHoverData` (the deferred, risky Site 1) calls `__all__` on the very same pages. So scoping the others keeps `__all__` alive (for hover) AND adds redundant per-key fetches (each triggers a Jira sync) — slower, not faster. Lesson: before scoping a fetch, grep the whole render tree for *other* consumers of the same key; the benefit is gated on the last consumer, not the first.
- **Implemented-then-reverted is the right call when verification invalidates the premise.** Cheaper to back out 2 green commits than to ship a regression. The finding (Site 1 is the linchpin) is more valuable than the code would have been.
- **Two-`<tr>` rows need a per-row `<tbody>` to virtualize without drift.** Measuring only the first `<tr>` (the plan's fold-into-estimate option) undercounts every rationale row and accumulates scroll error; wrapping each logical row in its own measured `<tbody>` keeps `getTotalSize` honest. Browser scroll confirmed the offsets stay correct.

## BRDG-387 — Frontend memory guardrails: bound the SWR cache + stop over-fetching (2026-06-24)

Replaced SWR's unbounded default cache with an access-order LRU provider (soft cap 300, 60s freshness window, `$`-key protection), wired into SWRProvider; scoped 2 of 6 whole-backlog `useTickets("__all__")` fetches to bounded key sets; locked the list-vs-detail payload split with a route test; added the `client-data-and-memory` architecture doc. 6 commits + archive; full suite (6,465) + build green. Oversized remainder split into BRDG-391/392/393.

| Phase | Notes |
|---|---|
| Plan (Opus) | Strong: confirmed SWR 2.4.1's `provider` contract, that subscriber bookkeeping lives in a WeakMap (so eviction is safe), that checkbox 7 was already satisfied, and pre-flagged which `__all__` sites were drop-in vs oversized |
| Implement | The LRU + the 2 clean swaps went smoothly; sites 3/5 turned out to rely on undefined-until-loaded gating that `useTicketsByKeys` (returns `[]`) would silently break, so they were deferred not forced |
| Verify | Full suite (6,465) + build green; the global SWRProvider change broke zero tests |

Key bottlenecks / lessons:
- **A parallel session claimed BRDG-388/389 on `dev` mid-run.** I scanned correctly at the start (max was 386) and picked 388-390 for follow-ups, but a concurrent session committed its own BRDG-388/389 while I worked, duplicating the numbers. Renumbered mine to 391/392/393 after the fact. Lesson: on this shared branch, re-scan ticket numbers immediately before writing follow-up story files, not just at task start.
- **An untracked parallel test file (`DroppableSprintColumn.test.tsx`, a bad `{} as Ticket` cast) failed whole-project typecheck mid-run, then vanished** once the parallel session committed its own fix. A transient, not-mine blocker. Lesson: when a typecheck error points at a file you never touched, check `git status` for `??` parallel churn before reacting.

## BRDG-338 — Live-update an open ticket when its local data changes (2026-06-12)

Typed ticket events (9 change kinds + origin tab id) emitted from every local write path, per-key SSE subscription on the detail page, a new broadcast SSE stream + client bus for the board, opacity-only highlight pulse, self-echo suppression via an X-Bridge-Client header on every apiFetch. 4 commits, ~30 new tests; full suite (5,701) + build green.

| Phase | Notes |
|---|---|
| Plan (Opus) | Strong; found the existing refinement broadcast-stream precedent, the ~6-connections-per-origin cap that rules out per-row EventSources, and that watchers are never stored locally (correctly descoped) |
| Implement | Clean two-halves flow (server emit foundation, then client). Refinement wiring + SidePanel pulse deliberately skipped: those exact files carried BRDG-336/337 uncommitted parallel work |
| Test fallout | The new global X-Bridge-Client header broke 9 exact-match fetch assertions across 4 unrelated test files (bail:5 hid them until two full-suite runs); relaxed to objectContaining |
| Verify | Full suite + build green; browser verification was the bottleneck (below) but did prove the live chain once end-to-end on the real app |

Key bottlenecks / lessons:
- **A parallel `next build` raced mine on the shared `.next-build` dir** — two different ENOENT failures before spotting the other session's build process and waiting for it. Lesson: on this shared tree, check `ps` for a running `next build` before reacting to nonsensical build errors.
- **Browser verification fought the environment, not the feature.** A freshly restarted dev server under open tabs produced stale-chunk failures + a crashed error boundary in one tab; a CDP `Runtime.evaluate` froze a renderer for 45s; and most importantly, 5-7 open Bridge tabs each holding SSE streams exhausted Chrome's ~6-per-origin HTTP/1.1 connection pool so fetches queued forever. That last one is a real product finding, filed as BRDG-342 + investigation doc.
- **Adding a header to a central fetch wrapper is a cross-cutting test change.** Exact-match `toHaveBeenCalledWith(fetch, {...headers})` assertions anywhere in the suite become coupled to the wrapper; with `bail: 5` the failures surfaced in drips across multiple full runs instead of one list.

## BRDG-336 — Drag a ticket onto another refinement session (2026-06-12)

| Phase | Notes |
|---|---|
| Plan (Opus) | Strong; found that the queue IS the active session's ticketKeys, that ChildIssueRow already had a dragHandleSlot, and pre-flagged the non-active-source-session removal ambiguity that became the move-semantics implementation |
| Implement | Clean per-checkbox flow; separate DndContext from the queue's sortable avoided all gesture conflicts by construction |
| Verify | Unit suites green first try; browser verification was the bottleneck (below); full suite (5701) + build green |

Key bottlenecks / lessons:
- **A parallel session's API change (BRDG-337: create requires name or date) silently broke my drop-create path between planning and verification.** Unit tests could not catch it (api-client mocked); only the live browser drop surfaced the 400. Fixed by stamping a default name. Lesson: when a parallel story touches an endpoint you call, re-read the route before final verification.
- **CDP `left_click_drag` cannot activate dnd-kit's PointerSensor** (two silent no-ops). Scripted PointerEvent sequences (pointerdown → stepped pointermoves → pointerup) via javascript_tool work reliably and also let you assert mid-drag state (drop-target/drop-over data attributes).
- **Two agents drove the same Chrome tab group and dev server concurrently.** Renderer froze twice mid-drag (45s CDP timeouts), the dev servers killed each other's port, and an unrelated test session appeared in my session bar mid-verification. The frozen-drag screenshot was accidentally useful: it proved the drag-start affordance visually.
- **Shared-file commits needed sequencing, not splitting.** The parallel session had staged my two shared files; waiting for their commit to land and then committing the now-purely-mine remainder avoided hand-built patches this time.

## BRDG-337 — Schedule a refinement session with a date (2026-06-12)

| Phase | Notes |
|---|---|
| Plan (Opus) | Accurate; pre-identified the five label render sites, the timezone wrinkle in todayDate(), and that route tests require the migration to exist |
| Schema | drizzle-kit generated a broken table-rebuild migration: the INSERT...SELECT referenced the new scheduled_for column on the old table; hand-corrected to SELECT NULL before applying |
| Implement | Clean; nullable name fanned out to ~10 consumers but the sessionLabel helper absorbed nearly all of it |
| Verify | Worktree-at-HEAD verification (per parallel-session hygiene memory) worked well; build + suite green for own scope on first run after one test-assertion fix |

Key bottlenecks / lessons:
- **Another session was actively committing into the same tree (BRDG-336/338) throughout the run.** Required hand-built zero-context patches (`git apply --cached --unidiff-zero`) to stage only own hunks in api-client.ts, RefinementPageContent.tsx and SavedSessionList.tsx; their commit later landed a fixture I had already patched, harmlessly. Two of their committed type errors (Jira comment fixture missing accountId/updated) broke typecheck at HEAD and were fixed here since they were one-liners blocking verification.
- **Their x-bridge-client header refactor broke useStoryWriterDrafts (5) and useJobs (2) test assertions at HEAD.** Left for that session to fix (still in flight); full suite verified green excluding those two files.
- **drizzle-kit generate is not trustworthy for add-column + drop-NOT-NULL combined changes on SQLite.** It rebuilds the table and selects the new column from the old table. Always read the generated SQL before db:migrate.
- Browser verification surfaced a pre-existing render-phase setState (RefinementSessionMenu onOpenChange inside the setOpen updater); one-line fix committed.

## BRDG-335 — Test suite redundancy & obsolescence cleanup (2026-06-12)

Test-only cleanup story (8 dead source+test pairs retired, 1 test retargeted, 4 duplicate-flow tests slimmed). The cleanup itself was mechanical and audit claims all held; every minute of friction came from sharing the working tree with a parallel session running BRDG-336/337/338.

| Phase | Notes |
|---|---|
| Plan (Opus) | Verified all audit claims, corrected the story's drifted line numbers, and pre-flagged the two hidden-dead-import traps (C1 `hasEditIntent` import, C3 `insertComment`/`jiraComment`) — both would have failed lint if missed |
| Section A | Mechanical `git mv`; staged renames were swept into the parallel session's BRDG-341 commit, which then amended itself to give them back — resolved without history surgery |
| Sections B/C | No rework; C2 rewrite gained mode=plan/reconcile coverage the old DB-backed test never had |
| Verify | Blocked twice by parallel work: an in-flight broken migration 0076 failed every `createTestDb` test, then 40+ dirty files broke typecheck. Final verify ran in a throwaway git worktree at HEAD with symlinked `node_modules` — full suite (5614) + build green first try |

Key bottlenecks / lessons:
- **Stage-and-commit must be atomic when a parallel session is active.** A `git mv` left renames staged for ~2 minutes; the other session's commit picked them up. Always `git add <paths> && git commit` in one command.
- **A throwaway worktree at HEAD (with `node_modules` symlinked from the main checkout) is the clean way to run final verification while the shared tree is dirty.** Polling for the tree to settle wasted 5 minutes and the tree only got dirtier; the worktree route took ~3 minutes total including build.

## BRDG-339 — Story Writer footer rework: autosave + wrap up (2026-06-12)

Smooth implementation (server 409 check -> drafts hook -> actions -> UI, committed per layer;
full suite + build green first try). The only friction was browser verification.

| Phase | Notes |
|---|---|
| Plan | Opus Plan agent found the decisive shortcut: the 500ms debounced save path already IS autosave, and `modifiedAt` works as the concurrency token — no migration |
| Implement | Four layers, each lint/typecheck/test-clean before commit; one React Compiler lint trip (ref inside the spread `actions` object flagged all 52 `actions.*` accesses — destructure refs out) |
| Verify | 5,630 tests + build green on first run; browser screenshots unusable (below), fell back to DOM assertions |

Key bottlenecks / lessons:
- **CDP screenshots timed out on every attempt** ("Page.captureScreenshot timed out after 30000ms") while the page itself was healthy — title, navigation, find and JS execution all worked. Lesson: when screenshots wedge, don't keep retrying; `javascript_tool` querying `document.body.textContent` + clicking real buttons verified every AC (panel options, Save-draft removal, overflow push disabled state) faster than screenshots would have.
- **The `find` accessibility-tree tool missed the just-opened popover** (likely a render/snapshot race plus toggle-button double-clicks across separate batches). JS-driven click + 300ms wait + text assert in a single execution was reliable.

## BRDG-304 — Placeholder tickets for forward planning (2026-06-10)

Large, multi-layer feature (new table + service + 3 routes + 2 grouped-view integrations + a
new row component), but no rework. Built backend-first, then the sprint board, then the epic
view, committing per layer. 116 own tests green (66 new + 50 regression for touched shared
files); browser-verified create + distinct row + delete in the live app.

| Phase | Notes |
|-------|-------|
| Plan (Opus) | High-value: caught that BRDG-323's unified `EstimatePicker` and the **server-computed** used-points meter had made the in-file plan stale, and made the key call to route placeholders to a dedicated `PlaceholderRow` rather than fake a `Ticket` (BoardRow assumes a real Jira key everywhere). |
| Implement | Backend (schema/migration/service/routes/promote) → sprint board (TicketTable + useGroupBy seeding + SprintBoard wiring) → epic view (separate `placeholders` prop bucketed per group, outside dnd). Extracted a shared `createTicketWithJira` helper from `POST /api/tickets` so promote reuses one create path. |
| Verify | Targeted typecheck/lint/tests green throughout; full suite 5401 pass; `next build` compiled my code cleanly. Live browser check: planning toggle reveals "Add placeholder", create renders the dashed provisional row with estimate/BV/promote/delete, delete cleans up. |

Key bottlenecks / lessons:
- **Empty-sprint visibility gap.** `useGroupBy` builds groups from tickets, so a future sprint with only placeholders had no group. Fixed by seeding empty groups for placeholder sprint ids (sprint board). The epic view groups by the epic's children, so the same gap there is left as a documented v1 limitation (placeholder still shows on the board).
- **Recurring foreign breakage on `dev`.** `npm run verify`/`build` are blocked by the same pre-existing `ChatMessageParts.tsx` `react-hooks/set-state-in-effect` lint error and 2 untouched story-writer/sidebar test failures — none in files this story touched (build compiled the project cleanly; only the lint gate fails). Proved the work in isolation per the established pattern; left the residual blocker alone. The shared `dev` tree also had concurrent agents' commits interleaved with mine.

## BRDG-324 — Dedicated search improvements (subtasks, shared filters, ticket pill) (2026-06-10)

Smooth, well-scoped run. Extracted three shared filter-option renderers (IssueTypeOption / StatusOption / ReadinessOption) used by both FilterBar and SearchFilterPanel, added default subtask exclusion + readiness to the local engine and Jira route, swapped the search PO Status filter for Readiness, and put TicketStatusPill in the result rows. 5356 project tests green (the only 2 failures are pre-existing, in untouched story-writer files); browser-verified the board + search dropdowns and result pills in the real app.

| Phase | Notes |
|-------|-------|
| Plan (Opus) | Strong; pre-empted the saved-search back-compat (`poStatus` -> `readiness`) and the subtask type-string normalization, both of which landed exactly as planned |
| Implement | A->G in order, one structural decision surfaced at build time (see below); no rework |
| Verify | Own code green in isolation (targeted eslint exit 0, typecheck clean, all touched test files pass); full `verify`/`build` blocked only by pre-existing foreign breakage |

Key bottlenecks / lessons:
- **Nested-anchor constraint forced a row-element change.** `TicketStatusPill` renders its own key `<a>` + dropdown buttons, which cannot legally nest inside the result row's wrapping `<a>`. Converted `LocalResultRow` to a clickable `<div role="link">` (mirroring the Sprint Board's `<tr onClick>` pattern, with the pill wrapped in a `stopPropagation` span). This broke two SearchModal tests that selected `[data-result-row] a` for the row root; updated them to `[role="link"]`. Lesson: embedding the interactive pill in a previously-anchor row is a structural change, not a drop-in — anticipate the selector/keyboard-nav fallout.
- **Recurring foreign breakage on `dev`.** `npm run verify` and `npm run build` both fail on `src/components/story-writer/ChatMessageParts.tsx` (a `react-hooks/set-state-in-effect` error) and 2 failing story-writer tests — all in files this story never touched. `next build` compiled and type-checked the whole project cleanly; only that one untracked lint error blocks the build. Per the established pattern, proved the work in isolation and left the residual blocker documented rather than touching parallel-work files.

## BRDG-318 — Inline subtask assignee + status (2026-06-09)

Smooth, well-scoped UI run; the only friction was the recurring foreign-breakage blocker.

| Phase | Notes |
|-------|-------|
| Plan | Opus Plan subagent confirmed status was already inline-editable (so AC #2 needed only a test), and chose the lowest-risk overlap fix: lift the metadata control above the actions overlay (z-20 + stopPropagation) and offset the overlay off the right edge when a metadata control is present. |
| Implement | Swapped the display-only `<Avatar>` for an interactive `AssigneePicker variant="avatar"` in both row paths (sortable + plain), guarded pending rows, and added `handleAssigneeChange` mirroring the existing `handleJiraStatusChange` `onMutate` pattern. One contained `ChildIssueRow` layout change benefits all consumers (LinkedIssues, EpicChildren). |
| Verify | 57 targeted tests green; full suite 5306 pass; typecheck clean. Browser-verified the picker opens on avatar click and Edit/Delete no longer cover the avatar (stopped short of an actual assign to avoid writing to live Jira). |

Key bottlenecks:
- **Recurring pre-existing broken tree blocks `npm run build`/`npm run verify`**: a committed, unmodified `ChatMessageParts.tsx:290` `react-hooks/set-state-in-effect` lint error fails the build's lint gate, and `story-writer/TitleInput.test.tsx` has one failing test. Both are independent of this story (story-writer module, not subtasks). Verified my work in isolation instead (typecheck clean, my two test files + full suite minus that one foreign failure pass). Documented in `docs/investigations/2026-06-09-prexisting-build-blocker-chatmessageparts.md`.

## BRDG-250 — Epic color management (2026-06-02)

Smooth run overall. The one notable item is a recurring foreign-breakage blocker.

| Phase | Notes |
|-------|-------|
| Plan | Opus Plan subagent picked the registry + `useSyncExternalStore` approach so the pure `getEpicColor(name)` (~10 call sites) resolves a stored color with zero call-site churn, reactive only on the 4 named surfaces. |
| Implement | Reused the BRDG-254 `epic_metadata` store (added a nullable `color` column); curated 9-swatch palette deriving bg/border/text via `color-mix`; name+key indexed registry so name-only surfaces (stakeholder chips) resolve too. |
| Verify | All touched tests green (route, lib, registry, picker, progress + fixtures); browser-verified epic-overview chip/picker, instant + persisted apply, matching sprint-board pills, and reset-to-default. |

Key bottlenecks:
- **Recurring pre-existing broken tree blocks `npm run build`/`npm run verify`**: the same `SessionEndModal.tsx:110` lint error noted previously still fails the build's lint gate, and an untracked foreign `src/app/preview-board-transition/page.tsx` fails `routes.test.tsx`. Both are independent of this story. Verified in isolation instead (typecheck clean, my code "compiled successfully", 3909 suite tests pass with only the foreign route test failing).

## BRDG-232 — Rate limiter hardening (2026-05-29)

Backend/security story. Implementation was straightforward; final verification was
complicated by heavy concurrent activity on `dev` from another agent.

| Phase | Notes |
|-------|-------|
| Plan | Opus Plan subagent; surfaced the sync-vs-async crux and the next.config bodyParser no-op for App Router. |
| Implementation | Made `applyRateLimit` async + per-user keyed; mechanical `await` codemod across 75 call sites via `sed` (avoids the per-edit test hook). Middleware injects `x-bridge-user-id` and enforces a 1 MB body cap. |
| Test verification | Changed test files green (54); mock sites switched `mockReturnValue`→`mockResolvedValue`. |
| Final verification | lint 0 errors; typecheck/build clean once unrelated chat WIP isolated. |

Key bottlenecks:
- **`set -f` for `[key]`/`[id]` route paths**: the first codemod `sed` loop silently
  matched nothing because unquoted bracket paths were glob-expanded. Re-ran with
  globbing disabled.
- **Unrelated WIP blocks `npm run build`**: working tree carried in-progress chat
  components (`ChatLayout.tsx`/`MessageInput.tsx`) that fail typecheck. Verified my
  work by stashing only those two files (stashing everything broke the tree, since the
  WIP components are interdependent).
- **Concurrent branch races**: another agent committed BRDG-234/235 and advanced `dev`
  mid-session, briefly showing a non-awaited `applyRateLimit` in a shared chat route.
  State settled consistently (all calls awaited); my four commits remained reachable.

## BRDG-235 — Hover card on TicketStatusPill (2026-05-29)

Implementation itself was smooth (one component + two call-sites + tests, all green
first try). Final verification hit two unrelated blockers.

| Phase | Notes |
|-------|-------|
| Plan | Opus Plan subagent; clean numbered plan, no rework. |
| Implementation | One edit pass to `TicketStatusPill.tsx` + 2 call-sites; one lint error (setState-in-effect) fixed by deriving visibility instead of an effect. |
| Test verification | Added 7 hover-card tests; affected files 34/34 pass. |
| Final verification | Full suite + build, then browser visual check. |

Key bottlenecks (both pre-existing, neither caused by the change — see
`docs/investigations/2026-05-29-flaky-rate-limiter-and-stale-next-build.md`):

- **Stale `.next` build failure**: `next build` failed on a generated type referencing
  a deleted route (`api/debug/query-stats`). The running dev server held `.next`, so
  `rm -rf .next` also failed. Fix: kill port 3100, clean `.next`, rebuild.
- **Flaky `rate-limiter.test.ts`**: 7 failures in the full suite, 16/16 in isolation —
  time-window/global-state dependent, unrelated to this story.

## BRDG-231 — Fix Dependency Vulnerabilities (2026-05-29)

The dependency bump itself was trivial (one package), but verification hit three
unrelated blockers that required extra diagnosis runs.

| Phase | Notes |
|-------|-------|
| Investigation | Quick — determined both highs trace to one js-cookie/Clerk chain; drizzle-kit/next already at latest stable. |
| Implementation | Single `npm install`; lint/typecheck/build all clean first try. |
| Test verification | 3 full suite runs (~63s each) to diagnose two different failures. |

Key bottlenecks (all pre-existing / external, none caused by the change):

- **Pre-existing Drizzle schema drift**: a clean checkout already emits an index-change
  migration, so the AC's "generate produces no diff" could not be met verbatim. Logged
  in `docs/investigations/2026-05-29-drizzle-schema-drift.md`.
- **Non-deterministic test flakiness**: different unrelated tests fail across full runs
  under parallel workers (e.g. `sync-comments/route.test.ts`), all pass in isolation.
- **External untracked file**: `src/app/(app)/dev/ticket-pills/page.tsx` appeared mid-session
  from an external process and breaks `routes.test.tsx` (not in the route manifest). Left
  untouched as out of scope.

## BRDG-234 — Unify standalone chat with Story Writer chat (2026-05-29)

Frontend consolidation story. Smooth overall; one environment bottleneck.

| Phase | Notes |
|-------|-------|
| Plan | Opus Plan subagent; correctly flagged the StoryWriterChat input fork and the model/codebase send-path gap. Narrowed checkbox 2 to "footer controls only" (not full input migration) to cut regression risk. |
| Implementation | Extracted ModelSelector/CodebaseToggle/QuickActionsPopover to shared/chat-controls; routed /chat through shared ChatInput with footer slots + width; wired model (top-level body field) + codebase (args prefix, applied agent-side only) through submitAndStream and chat-messages route; shared StreamingIndicator across 3 surfaces. |
| Test verification | New tests for the 4 shared components + MessageInput + chat-messages model forwarding. Full suite: 3513 passed; build clean. |

Key bottlenecks:
- **Stale TS build artifacts** (`.tsbuildinfo`, `.next-build/types/**`) produced phantom/cascading `tsc --noEmit` errors (TS18047 in route tests, ghost errors in untouched confluence/workspace-tasks tests) that flip-flopped across runs. Resolved by deleting `*.tsbuildinfo` and `.next-build` before a clean check; `npm run typecheck` then exits 0. Worth clearing these first when typecheck output looks inconsistent.

## BRDG-236 — Draggable Focus-Mode Exit Button (2026-05-31)

Small, self-contained UI enhancement (new `useCornerSnap` hook + wiring in `FocusModeWrapper`). Smooth overall; two minor recurring frictions.

| Phase | Notes |
|-------|-------|
| Plan | Opus Plan subagent; flagged the FLIP/anchor-delta snap math as the trickiest visual piece and the jsdom pointer-capture test limits up front. |
| Implementation | One hook (pointer-events drag, quadrant snap, `useLocalStorage`-backed corner) + button wiring. lint/typecheck clean; 9 new unit tests pass first try. |
| Verification | Full suite 3529 passed; browser-verified drag-to-corner, reload persistence, and click-to-exit. |

Key bottlenecks (both recurring, neither story-specific):
- **Stale `.next-build` artifact**: `next build` failed once with `ENOENT _ssgManifest.js` during trace collection despite a clean compile; `rm -rf .next-build` then a rebuild succeeded. Same pattern logged in BRDG-234.
- **Focus-mode keyboard shortcut after navigation**: `Cmd+.` did not register until clicking into the page to give it keyboard focus. Minor browser-automation quirk, not a product bug.

## BRDG-243 — Outdated-draft warning in the Story Writer (2026-06-01)

Self-contained server-detection + editor-banner feature (story-writer GET flag, push-time baseline rebase, `OutdatedBanner`). Implementation smooth; one notable verification blocker from concurrent work in the shared tree.

| Phase | Notes |
|-------|-------|
| Plan | Opus Plan subagent; resolved the `targetOutdated` baseline gap (derive from target `ticketLocalEdit.baseJiraVersion`, no migration) and confirmed `openApp("diff")` already defaults to editor-vs-latest-Jira. |
| Implementation | GET returns `outdated`/`targetOutdated`; `pushToJira` rebases active session `baseVersionHash`; PATCH `rebaseBaseline`; flag wired through `useStoryWriter` -> WriterContext; shared `OutdatedBanner` in EditorApp + SplitTargetApp. |
| Verification | My changed files all green; full suite (excluding the concurrent-broken file) 372 files / 3583 passed; build clean. |

Key bottlenecks:
- **Concurrent agent in the same working tree**: another process was actively editing/committing unrelated files (TicketRow, SprintBoard, BusinessValuePicker, a `swrFetcher` change to `useSprintBoard`) and interleaved commits (`edb28e0c`, `db7225fd`) between mine. Its `swrFetcher` change broke `EpicChildrenSection.test.tsx` (5 failures), and `bail: 5` in vitest then halted the suite early, masking all other results. Worked around by re-running with `--exclude '**/EpicChildrenSection.test.tsx'` to let the suite complete. Scoped all `git add` to my own paths to avoid sweeping in the other agent's WIP. Live browser verification skipped (the broken sprint-board nav path + needing real Jira version divergence to trigger the banner); covered by component tests instead.

## BRDG-247 — VPL ticket-ref pills in descriptions (2026-06-02)

Linkify bare project-key refs in plain description text into read-only `TicketRefPill`s (borderless list variant, no readiness, eager per-key hover-data fetch). Threading the linkify flag through the shared `renderMarkdown`/`inlineFormat` (so chat/comments stay opt-out and emphasis/code/links are never touched) was the main design care; implementation otherwise smooth.

| Phase | Notes |
|-------|-------|
| Plan | Opus Plan subagent; flagged the bold/italic recursion leak and the shared-parser scope leak up front, both resolved by threading flags (recursion-suppressing default + per-render `linkifyRefs`). |
| Implementation | New `TicketRefPill` + `showReadiness` prop + `NEXT_PUBLIC_JIRA_PROJECT_KEY`; post-process plain-text slices in `inlineFormat`. lint/typecheck clean; 12 new unit tests. |
| Verification | Changed-file tests green; build clean; browser-verified pills render, lazy data resolves (status TODO->DONE), hover card shows info. PO feedback (list variant, no underline, eager load) folded in before archive. |

Key bottlenecks:
- **Dev-server instability during browser verification**: the first backgrounded `npm run dev` exited mid-session (port 3100 went empty), so the ticket page loaded its shell then 404'd on the client fetch — one wasted screenshot attempt before restarting and waiting on the API route to compile. A transient `chrome-extension://` screenshot error also cost one retry.
- **Pre-existing flaky test**: `activity-log/compute-stats.test.ts` (`affectedScopes` ordering) failed once in the full parallel run but passes in isolation and is unrelated to this story; logged in `docs/investigations/2026-06-02-flaky-compute-stats-test.md`.

## BRDG-251 — Move pipeline/deploy badges to hover card (2026-06-02)

| Phase | Notes |
|-------|-------|
| Plan | Skipped the heavyweight Opus Plan subagent; scope was small and already investigated. Wrote the plan inline into the story. |
| Implement | Hover-card rows, font equalization, width/title tweaks, default-hide column. Smooth. |
| Verify | Browser-verified column hidden + hover card rows/fonts/title. Full suite (3805) + build (compiles; only pre-existing SessionEndModal lint error) green. |

Key bottleneck:
- **Wrong persistence layer on first attempt**: I added the "default-hide for existing users" migration to `useSprintBoardFilters` (the `sprint-board-columns` localStorage key), but that code path is dead — `visibleColumns = externalVisible ?? storedColumns` and `externalVisible` is always supplied by `useColumnConfig`, whose visibility is persisted **server-side**. Caught it during browser verification (column still showed despite localStorage being clean). Reverted and re-implemented the one-time migration in `useColumnConfig` against the loaded server config. Lesson: sprint-board column visibility lives in `useColumnConfig` (server-backed), not the `storedColumns` in the filter hook.

## BRDG-239 — Sprint board headerless Jira-style row layout (2026-06-02)

| Phase | Notes |
|-------|-------|
| Plan | Opus Plan subagent surfaced the key risk: `TicketRow` is shared by 4 views (board, compare, epics, refinement). Resolved with PO to scope to the board only → forked a new `BoardRow` instead of mutating the shared row. |
| Implement | New `BoardRow`/`SortableBoardRow`, headerless `TicketTable`, `BoardFieldToggle`, inline-tag field model, `useColumnConfig` rewrite + legacy migration. Kept the `<table>` shell (single fixed-layout column) so virtualization/dnd/grouping survive unchanged. |
| Verify | 288 blast-radius tests green. Browser-verified headerless rows, field toggle, hover card follow star + readiness. |

Key bottlenecks:
- **Layout overflow caught only in the browser**: the first headerless render let the single-column auto-layout table grow past the viewport (epic/SP/BV/assignee clipped off-screen), because the flex title never truncated without a width constraint. Fix was `table-fixed` on the content tables. Unit tests (which mock the row) could not have caught this — visual verification was essential.
- **Pre-existing broken tree blocked full `npm run verify`/`build`**: committed parallel work on `dev` (BRDG-254 `epics/page.tsx` references a non-existent `EpicStatusBucket`; refinement `SessionEndModal.tsx` has a lint error) fails typecheck/lint independently of this change. Verified this story in isolation (typecheck clean for touched files, targeted + blast-radius tests green) rather than the full gates.

## BRDG-267 — Group epic child issues by sprint (2026-06-03)

| Phase | Notes |
|-------|-------|
| Plan | Opus Plan subagent + Explore subagent mapped the data flow. Confirmed the cleanest Phase 2 approach: join sprint metadata client-side from `useJiraSprints` by matching `sprintName === sprint.name`, avoiding any API/DB/schema change. |
| Implement | New pure `epic-children-grouping.ts` util, `EpicChildrenBySprint.tsx` card view, List/By-sprint toggle in `ChildIssueListHeader`, wired into `EpicChildrenSection` with shared filter/columns. |
| Verify | Full suite green (4032 tests); production build clean (dev sketch route removed). |

Key bottleneck:
- **Concurrent-agent git race**: another agent was committing to `dev` in the same working tree throughout the run. Twice my `git add`/`git commit` (issued as separate calls) had my staged files swept into the other agent's `git commit -a`-style commit, and a subsequent history rewrite on their side dropped my files back to the working tree. Recovered by committing with an explicit pathspec (`git commit -- <paths>`) so only my files land regardless of what else is staged. Lesson on a shared tree: never rely on index state across two tool calls; stage and commit in one step with explicit paths. Also note a Bash-tool quirk where an unquoted shell variable holding a space-separated pathspec list was passed to git as a single argument — list paths inline instead.

## BRDG-268 — Move epic children between sprints (drag-drop + right-click) (2026-06-03)

| Phase | Notes |
|-------|-------|
| Plan | Opus Plan subagent confirmed the testable split: a pure `epic-children-move.ts` resolver (targetSprintId / no-op / closed-rejected) plus an optimistic `localMoves` override applied before grouping, reconciled when the refetch lands. |
| Implement | New move util + `onMoveChild`/`onMoveError` props on `EpicChildrenBySprint`; whole-row `useDraggable` + per-group `useDroppable` + DragOverlay; reused `CursorMenu`/`TicketActionMenuContent` for the right-click move; optimistic state + revert in `EpicChildrenSection`. Reused `jira.moveSprint` unchanged. |
| Verify | 4061 tests green; clean build; browser-verified the by-sprint view, right-click menu, and searchable sprint sub-panel (Backlog + all active/future sprints) on epic VPL-7752. No Jira write performed (avoided mutating real data without permission). |

Key bottleneck:
- **Stale `.next` cache from the running dev server failed the production build**: the first `npm run build` reported a phantom `Cannot find name 'MERGE_BRANCH_REGEX'` in an untouched file (`pipeline-sync.ts`) at a line offset that did not match the on-disk source, while `tsc --noEmit` passed. Cause: the backgrounded `next dev` server writes `.next` concurrently, so `next build` read a stale/partial artifact (and `rm -rf .next` raced the live writes). Fix: stop the dev server, clear `.next`, build clean, then restart dev. Lesson: for a trustworthy production build, stop the dev server first rather than building alongside it.

## BRDG-277 — Drag-to-reorder epic children within a sprint (2026-06-04)

| Phase | Notes |
|-------|-------|
| Plan | Opus Plan subagent confirmed the split: server-side rank-sorted load + `jiraRank` on `EpicChild`, a pure `computeReorder`/`applyLocalOrder`/`resolveDragEnd` set, `useSortable` rows inside per-group `SortableContext`, and an optimistic `localOrder` override reconciled against server rank. Reused the sprint board's `jira.rank` flow. |
| Implement | Added `jiraRank` (type + builder query order), `epic-children-reorder.ts` helpers incl. `resolveDragEnd` (extracted so the drag-end branch is unit-testable), converted rows to `useSortable`, branched drag-end (same-group reorder vs cross-group move), wired `handleReorderChild` with optimistic order + revert. |
| Verify | 132 focused tests + full suite (4226) + build all green. Skipped live drag verification: a real reorder calls `/api/jira/rank` and would mutate production Jira ranks (no write-permission), and behaviour is covered by tests. |

Key bottlenecks:
- **jsdom can't drive dnd-kit keyboard reorder**: my first attempt tested `handleReorderChild` end-to-end via the KeyboardSensor (focus grip → Space → ArrowUp → Space). It never fired — dnd-kit's sortable keyboard coordinates need real layout rects, which jsdom returns as zero, so the item never moves. Pivoted to a dedicated test file that mocks `EpicChildrenBySprint` to invoke `onReorderChild` directly, deterministically asserting the rank call, optimistic order, and revert. Lesson: don't test dnd-kit drag *movement* through jsdom; test the pure decision (`resolveDragEnd`/`computeReorder`) and mock the child to fire the callback.
- **SWR timing in the handler test**: the sprint-id resolution reads `useJiraSprints`, so the first reorder click raced the async sprint load and called `jira.rank` without `sprintId`. Fixed by capturing the child's `sprints` prop and waiting for it before triggering.
- **Shared-tree parallel work**: another agent was committing to `dev` and editing the same `EpicChildrenSection.tsx` (a "create child at drafting readiness" change) throughout the run; HEAD advanced under me and a transient `children/route.ts` typecheck error appeared then resolved on their side. Committed only explicit pathspecs (consistent with the BRDG-267/268 lesson) so my commits stayed scoped.

## Backlog Deprecation Review epic (BRDG-297, 283-290) — 2026-06-04

Whole-epic build (9 stories) orchestrated from the main thread via sequential subagents (one per story, dependency-ordered) to keep the orchestrator context small. ~1.0M subagent tokens total. Smooth overall; two notable issues.

| Phase | Notes |
|-------|-------|
| Per-story implementation | 9 subagents, each: plan → implement → co-located tests → lint/typecheck/targeted-vitest → commit. All green per story. |
| Final verification | Full suite 4551 pass (1 unrelated pre-existing TicketSidebar failure); build initially FAILED. |
| Fixups | Route-export refactor + manifest/nav test updates + ticket-number renumber. |

Key bottlenecks / lessons:
- **Build-only failure hidden by per-story gates**: subagents were told not to run `npm run build` (final-only). A `route.ts` exporting non-handler constants (`AUTO_SCAN_ENABLED_KEY`, ...) passes lint+typecheck+vitest but fails the Next.js build ("not a valid Route export field"). Surfaced only at the orchestrator's final build. Lesson: when a story adds an API `route.ts`, either run build for that story or forbid non-handler exports from route files up front (put shared constants in a lib module).
- **Ticket-number collision under concurrent branches**: I scanned at kickoff (max was BRDG-281) and numbered the epic 282-290. During the multi-hour run, parallel work committed its own **BRDG-282** (per-group tranched sync, commit b5acd365) plus BRDG-291-296 (epic-writer), so 282 collided. Resolved by renumbering my foundation story 282 → 297 (next free), surgically preserving the per-group BRDG-282 references. Lesson: on long runs that mint many story numbers, a kickoff scan can go stale; re-check free numbers before archiving, and prefer a reserved contiguous block.
- **New cross-cutting enums need a full run**: stories added activity-log types, a notification type, a queue-source value, and scan-topic keys across shared files; targeted per-story tests passed but the route-manifest and Sidebar-nav tests (which assert the full set of routes/links) only fail under the full suite. Final `npm run verify` is what caught them.

## BRDG-307 — Create an epic from the Epics page (2026-06-07)

Smooth implementation run (API endpoint + modal + page wiring + epic-writer href branch). All five planned checkboxes implemented in two logical commits; 20 new tests (16 API, 4 modal) all green; build passed; visual verification confirmed the button, modal, disabled-state, Escape-close, and the "Epic writer" CTA on an epic single view.

| Phase | Notes |
|-------|-------|
| Plan (Opus) | Grounded, accurate; no rework needed |
| Implement | Backend + frontend, no blockers |
| Verify | Build + targeted tests passed first try |

Key bottleneck / lesson:
- **Pre-existing failures from parallel work muddied final verify**: `npm run verify` reported 5 failing tests (`sync-tickets/route.test.ts` x4 — `extractSprints` mock gap; `TicketSidebar.test.tsx` "displays Jira status" x1). None touched any file in this story. Confirmed pre-existing by running both files at the base commit (BRDG-296, `4f0fad5d`) in a throwaway `git worktree` with `node_modules` symlinked — identical 5 failures there. Lesson: when the integration branch carries unfinished parallel work, the full suite is not a clean baseline; isolate suspected-unrelated failures against the base commit rather than assuming they are yours.

## BRDG-306 — Next-sprint drop zone in epic view (2026-06-08)

Smooth implementation run. BRDG-305's series helpers (`isRegularSprint`/`latestRegularSprint`/`nextSprintName`) already existed, so the "shared helper" criterion was met by reuse rather than new code; the planner flagged the story's "create the helper now" note as stale. Three logical commits (grouping lib + tests, component + tests, archive); 62 targeted tests green; build passed.

| Phase | Notes |
|-------|-------|
| Plan (Opus) | Accurate; caught the stale "create helper" assumption up front |
| Implement | Pure `nextRegularSprintGroup` + extract `sortNamedGroups` + drag-only injection in `EpicChildrenBySprint`; `MeasuringStrategy.Always` so the mid-drag-mounted droppable registers |
| Verify | Targeted tests + build green; full suite 4993 pass, 1 unrelated pre-existing failure |

Key bottlenecks / lessons:
- **Pre-existing failure detour**: full `npm run verify` showed `TicketSidebar.test.tsx` "displays Jira status" failing — untouched by this story. Confirmed pre-existing by checking out HEAD~2 (pre-BRDG-306) and rerunning: identical failure. Same parallel-work baseline noise noted in BRDG-307. `git stash`/checkout/pop round-trip restored the unrelated working-tree changes cleanly.
- **Browser positive-case unverifiable from data**: the drag-only drop zone is correct to hide when the next sprint doesn't exist — and for the request's epic (VPL-43142) the highest sprint is BT:141 with no BT:142 in `sprint_name_cache`, so the live view correctly showed nothing. The positive case (zone appears mid-drag) couldn't be captured live: no epic in local data had a next-sprint gap, the keyboard grip isn't click-focusable for a scripted Space-pickup, and `left_click_drag` can't hold a mid-drag state. Covered fully by jsdom component tests instead. Lesson: for "appears only mid-drag" UI, lean on component tests; live capture of a held drag state is not reliably scriptable.

## BRDG-314 — Theme-aware code blocks (light/dark) + syntax highlighting (2026-06-08)

Smooth implementation. Introduced semantic `--color-code-*` tokens (surface/header-bg/border/fg/line-number/label) that flip per theme, rewired `CodeBlock.tsx` + editor CSS to them, removed the broad `[data-theme="light"] !important` overrides, and added a GitHub-light Prism palette. One feature commit + two doc/archive commits; 21 targeted tests green, full `npm run verify` (5097 tests) and `npm run build` passed.

| Phase | Notes |
|-------|-------|
| Plan (Opus) | Accurate; correctly flagged that the editor `.editor-code-block` has no Prism token spans, so "consistent" means surface/fg/border parity only |
| Implement | CSS tokens + component rewiring, no blockers |
| Verify | Targeted + full suite + build green; visual check both themes |

Key bottlenecks / lessons:
- **Concurrent-build race with parallel work**: the integration branch was being actively committed to by another process during the run. First `npm run verify` failed typecheck on an unrelated, concurrently-edited untracked file (`TicketTable.warning.test.tsx`, `TicketGroup.sortOrder` mismatch) that resolved itself on the next run; first `npm run build` "Compiled successfully" but then failed the static-export step ("Could not find a production build in `.next-build`") because a concurrent `next build` clobbered the output dir — passed cleanly on retry. Lesson: on a shared working tree with live parallel commits, transient verify/build failures in files you never touched are environment races; re-run once and confirm the error is outside your diff before investigating.
- **No real component to verify against**: the sprint board was initially empty (no tickets), so there was no ticket-detail code block to inspect. Built a throwaway `/dev/code-block-preview` page rendering real `renderMarkdown` output (with `ensureLanguages`), screenshotted both themes, then moved it to `deleted/` (gitignored + tsconfig-excluded, so it can't affect build). Lesson: for component-level visual checks when no live data exists, a temporary dev-route harness is faster and more reliable than hunting for qualifying data.

## BRDG-315 — Single-sprint create affordance (+ button, B3d composer, insert-position, max-width) (2026-06-08)

Smooth, well-scoped run after an extended interactive design phase (six `/dev/composer-alignment` mockup rounds before the PO picked "B3d raised inset bar"). New pure helpers (`trailingDoneDepStart`/`interpolateRank`) with co-located tests; a `variant="bar"` gate on the shared `ChildIssueComposer` (epic child views untouched); the optimistic ticket positioned by interpolated `jiraRank` so it lands above the trailing done/dep block with no resort. Five commits (helper, composer, pending-key, board wiring, archive); per-file tests green, full suite (5141) and build passed.

| Phase | Notes |
|-------|-------|
| Plan (Opus) | Accurate; correctly flagged `jiraRank` numeric-vs-LexoRank as the linchpin for "no flicker" (confirmed numeric) and the virtualizer-vs-injected-row conflict (resolved by disabling virtualization while the composer is open) |
| Implement | Composer styling, helpers, pending-key, then the toggle/insert/max-width wiring; no design rework needed |
| Verify | Targeted tests + full suite + build green; live check of + toggle, B3d composer, and insert-position rule |

Key bottlenecks / lessons:
- **Unrelated parallel-work build blocker**: `npm run build` failed only on `src/app/dev/sidebar/page.tsx` (a `react-hooks/static-components` error) — an untracked dev page that appeared mid-session from parallel work (the whole `src/app/dev/` is untracked; the tree also shifted from BRDG-313/314 to BRDG-316 during the run). My earlier standalone lint had passed because that file did not yet exist. Verified my own code builds by temporarily shunting the untracked file aside, building clean, then restoring it. Lesson: on a shared tree, a build failure in a file outside your diff is parallel-work noise; isolate by moving the offending untracked file aside rather than editing it.
- **Stale generated types after removing a route**: deleting the `/dev/composer-alignment` page left `.next-build/types/.../composer-alignment` + a `validator.ts` reference that failed `tsc --noEmit`. Clearing `.next-build/types` (regenerated on next build) resolved it. Lesson: removing an app route mid-session leaves stale typegen that breaks typecheck until `.next-build/types` is cleared or a build regenerates it.
- **Create flow not live-submittable**: submitting the composer calls the real Jira create endpoint, so the optimistic insert/no-flicker behaviour couldn't be exercised live without writing to Jira; covered by component tests (TicketTable insertion-index, ChildIssueComposer Enter-keeps-focus) instead.

## BRDG-316 — Auto-detect language for untagged code fences (2026-06-08)

Clean implementation of the logic itself. New pure `detectFenceLanguage` heuristic reused by both the Prism preload scan (`extractCodeLanguages` now walks bare fences) and the highlight path, plus a loaded-grammar generation folded into renderMarkdown's LRU cache key. 22 new tests (12 detector, 5 prismLoader, 5 renderMarkdown) green; full suite 5141 pass; browser-verified bare JS/JSON highlight + ambiguous fallback in both themes.

| Phase | Notes |
|-------|-------|
| Plan (Opus) | Excellent; independently caught that the module-level `markdownCache` was not generation-aware (latent staleness that would have made highlighting never appear after async grammar load) |
| Implement | Detector + prismLoader + renderMarkdown, no rework |
| Verify | Logic green in isolation; full verify/build repeatedly blocked by parallel work (see below) |

Key bottlenecks / lessons:
- **Concurrent-build race dominated the verify phase.** The shared `dev` working tree was being actively committed to by a parallel process throughout. `npm run verify` failed three separate times on files this story never touched, each a transient parallel-work state: (1) `TicketTable.warning.test.tsx` typecheck mismatch (resolved itself), (2) `SprintBoard.tsx` mid-edit syntax errors (settled after ~25s), (3) `src/app/dev/sidebar/page.tsx` `react-hooks/static-components` lint error that `eslint .` did NOT flag but `next build` did — and which never cleared. Net effect: `npm run build` could not be made green at hand-off despite the story's own code compiling cleanly ("Compiled successfully", only that one untracked page failing next's lint). Lesson: on a live shared tree, treat verify/build failures outside your diff as environment races; prove your work in isolation (targeted typecheck of your files + full vitest), re-run once or twice, and do NOT touch parallel-work files to force a green build — document the residual blocker instead.
- **Standalone `eslint .` vs `next build` lint diverge.** A file can pass `npm run lint` yet fail `next build` (next runs its own ESLint with rules like `react-hooks/static-components` that the project flat config did not surface here). When build fails on lint but `npm run lint` is clean, check whether the failing file is even yours before investigating.
- **Synchronous render + async grammar load needs grammars pre-registered in tests.** `renderMarkdown` highlights synchronously and never awaits `ensureLanguages`, so integration tests must populate `Prism.languages` first. prismjs core ships markup/css/clike/javascript but NOT json; the json component module references a global `Prism`, so it must be loaded in a `beforeAll` after assigning `globalThis.Prism`, via a template-literal dynamic import (a static-string import trips TS7016 — no type declaration).

## BRDG-320 — Header command bar (wordmark menu + NavPanel) (2026-06-09)

Lifted the retired bento-launcher panel into a header-anchored `NavPanel`, made the `bridge_` wordmark the nav trigger inside a brand-tinted command capsule, and dropped the floating launcher. 35 new/ported tests (NavPanel + ViewHeader) plus full suite 5277 green and a clean production build; browser-verified the capsule, caret, dropdown contents and outside-click dismissal in the real app.

| Phase | Notes |
|-------|-------|
| Plan (Opus) | Strong; correctly recommended NavPanel own its own data with `{open,onClose}` to keep portal-rendered ViewHeader thin, and flagged the hero-in-narrow-dropdown sizing question (resolved per story decision: keep full panel, ~360px) |
| Implement | globals caret keyframe → NavPanel lift → ViewHeader capsule/trigger → drop launcher → move Sidebar to deleted/. One design rework (see below) |
| Verify | Targeted tests green, but full suite surfaced a cross-suite ripple; one refactor, then full verify + build green; live browser check passed |

Key bottlenecks / lessons:
- **ViewHeader→NavPanel coupling rippled into page suites, masked by `bail: 5`.** Putting the nav's data hooks (`usePathname`, `useSidebarData`, …) inside the always-rendered ViewHeader meant every page test that mounts the header now needed those mocks. The first full run bailed after 5 failures showing only `stakeholder/page.test.tsx`, hiding how many suites were affected. Fix was also the better design: mount `NavPanel` only while open (`{menuOpen && <NavPanel/>}`), so closed-menu page tests never pull the data hooks and `useSidebarData`'s queries run on-open instead of on every page. Lesson: when a widely-rendered shared component gains data dependencies, prefer lazy/conditional mounting; and remember `bail` can hide the true blast radius — re-run without bail (or read the coupling) before assuming one suite is the whole problem.
- **Parallel automation committed my work mid-run, leaving a broken intermediate HEAD.** The exploration pages and the `Sidebar`→`deleted/` move were committed by a parallel process before I committed the wiring, so HEAD briefly had `FocusModeWrapper` importing a `Sidebar` that no longer existed at its old path. My working tree held the complete, correct version; committing the remaining wiring (NavPanel + ViewHeader + globals + FocusModeWrapper) restored consistency. Lesson (recurring on this `dev` tree): verify HEAD vs working tree with `git cat-file -e HEAD:<path>` before committing; stage explicit paths only and never `git add -A`.

## BRDG-325 — Story Writer landing as the regular ticket table (2026-06-10)

Converted the Story Writer landing from a bespoke `SessionCard` grid to a single-column table of the real `BoardRow`, driven by `useSWR<Ticket[]>` over a `sessionToSessionTicket` mapper so the live `useTicketActions` pickers work unchanged. Added optional, board-inert session decorations to `BoardRow` (resume-on-click, hover discard, time/Jira-changed/split badges). 33 new tests (9 mapper/helper, 5 page, 9 API, 10 BoardRow) green in isolation; browser-verified the table, hover trash, badges, removed-row-shows-normal-pill, and resume navigation in the live app.

| Phase | Notes |
|-------|-------|
| Plan (Opus) | Strong; correctly identified that the SWR key MUST equal `useTicketActions`' `activeListKey` (else `saveTicketMetadata`'s optimistic `globalMutate` misses the cache), and that a `SessionTicket extends Ticket` carries session fields through every optimistic spread without a parallel map |
| Implement | API+type move → shared `buildAssignee` → BoardRow optional props → page rewrite. No rework; one effect-dep fix (depend on stable `syncFromApiTickets`, not the whole `ta` object) |
| Verify | Targeted suites green; full suite + build blocked only by pre-existing parallel work (see below) |

Key bottlenecks / lessons:
- **Recurring shared-`dev`-tree interference.** Parallel automation committed BRDG-324/BRDG-304 work *interleaved with my commits* during the session, and a first full `vitest run` reported "11 failed files | 2 failed tests" — transient thrashing plus files mutating mid-run. A clean re-run showed only 2 real failures, both pre-existing parallel work (`TitleInput.test.tsx`, changed to multi-line by `a86f0bc7`; `useSidebarData.test.ts`). Lesson (again): on this tree, re-run the full suite once before trusting a failed-file count, and attribute failures via `git log -- <file>` rather than assuming they're yours.
- **`npm run verify`/`npm run build` red on pre-existing lint, not my code.** Both gate on ESLint, which fails at `src/components/story-writer/ChatMessageParts.tsx:290` (`react-hooks/set-state-in-effect`) — committed in `951687e3`, unmodified by me, already red at session start. My code "Compiled successfully" and all my files are lint-clean. Per the don't-touch-parallel-work rule, left it and documented the residual blocker instead of forcing green.
- **Field rename ripples.** Renaming the API's `sprintName`→`sprintId` would have silently broken `StoryWriterLauncherModal` (reads `s.sprintName` at runtime off a structurally-typed fetch). Kept the field name `sprintName` (it holds a sprint id) and mapped to `Ticket.sprintId` in the mapper instead — zero blast radius.

## BRDG-331 — Slim epic progress toolbar (2026-06-10)

Replaced the floating `EpicStatsSummary` card on the epic Child issues tab with a single slim toolbar (count · segmented bar · % done · items/SP/BV toggle · ⋯), moved the per-status breakdown onto bar-segment hover tooltips, dropped the redundant "Child Issues" section title (made `ChildIssueListHeader` dual-mode so `SubtasksSection` keeps its collapsible title), folded a single ⋯ menu (View/Filter/Columns + Hide-summary + New), and retired the epic-children section-level collapse. 8 new toolbar tests + 3 integration tests; full suite (5453) + build green; browser-verified layout, single ⋯ menu, and hide/show.

| Phase | Notes |
|-------|-------|
| Plan (Opus) | Strong; correctly flagged that the toolbar must not early-return null (would also hide the menu on an empty epic) and the Tooltip explicit-height pitfall. I overrode its "two ⋯ menus" call with one ⋯ per the story, lifting `hidden` to the parent |
| Implement | New toolbar → strip header → wire section → remove SECTION_KEYS.epicChildren → retire old files to deleted/. One real regression: `ChildIssueListHeader` is shared with `SubtasksSection`, so stripping `title`/`count` broke it → made it dual-mode |
| Verify | Targeted + consumer suites green, full verify + build green, live browser check passed (tooltip via synthetic hover didn't fire React onMouseEnter — covered by unit test) |

Key bottlenecks / lessons:
- **Recurring shared-`dev`-tree interference (again).** A parallel agent committed row-rounding work mid-run; because `git mv` *stages*, that agent's bare `git commit` swept my staged `EpicStatsSummary`→`deleted/` rename into its unrelated commit (`5aa2e1db`). Harmless (the move is correct) but it meant my retirement landed under someone else's message. Lesson: on this tree, `git mv` leaves staged changes a concurrent commit can claim — either commit the move immediately, or defer the `git mv` until just before my own commit.
- **Mid-run transient typecheck failure from parallel work.** A first `tsc` showed `roundBottom`/`isLastInCard` errors in `EpicChildrenBySprint.tsx` (a file I never touched) — the parallel agent's half-saved state. It cleared on its own once that agent committed. Lesson (again): attribute non-mine errors via `git status`/`git log -- <file>` before reacting; don't fix parallel work.
- **Shared component, hidden second consumer.** The plan's Explore pass reported only `EpicChildrenSection` used `ChildIssueListHeader`; `SubtasksSection` also did. Typecheck caught it immediately. Lesson: grep `<Component` usages directly before changing a component's required props, not just its obvious parent.

## BRDG-327 — Double-click a ticket pill to copy title + URL (2026-06-10)

Added an `onDoubleClick` copy handler to `TicketStatusPill` (whole-chip target, both elevated and `list` variants) reusing `formatTicketShare`/`getJiraUrl`, with a title-missing URL fallback, a `pending-` guard, an `e.detail > 1` guard so a double-click never leaves the key dropdown open, and a quiet in-place "Copied" confirmation that fades after 1.2s. 7 new tests; full suite (5460) + build green.

| Phase | Notes |
|-------|-------|
| Plan (Opus) | Tight and accurate for a single-component story; correctly flagged the `e.detail` single-vs-double conflict and the jsdom clipboard-stub wrinkle |
| Implement | Clean, no rework on logic |
| Verify | Unit suite + build green quickly; browser verification was the entire bottleneck (below) |

Key bottlenecks / lessons:
- **Browser verification consumed the bulk of the run; the feature logic was never the problem.** Three compounding issues: (1) the ticket detail header renders a skeleton (`animate-pulse`) for several seconds, so early `double_click`s landed on a skeleton, not the pill — always confirm the real element via `elementFromPoint` before interacting; (2) the Chrome automation `double_click` does not reliably emit a coalesced `dblclick` DOM event (a native listener showed `fired:0`), so it cannot exercise an `onDoubleClick` handler — a one-off `fired:true` early on was a timing fluke; (3) the 1.2s fade window is shorter than batch screenshot latency. Lesson: for `dblclick`/transient-state UI, trust `fireEvent.doubleClick` unit tests for behaviour and verify only the *visual* in-browser by temporarily forcing the state (`useState(true)`) — don't try to drive a real double-click + clipboard gesture through automation.
- **Design caught only in-browser, not by the plan.** The first confirmation placement (floating badge above the pill) clipped off-screen for header pills at the viewport top; moving it below collided with the hover card that opens there. Resolved by overlaying the pill itself (`absolute inset-0`), which is also what the AC literally asked for ("on the pill itself"). Lesson: floating-element placement near viewport edges and against existing portals (hover card) is worth a quick mental check before picking above/below.

## BRDG-334 — Stale UI after mutations (2026-06-10)

Total: roughly one hour of agent time for the remaining scope (refinement wiring, app-wide audit, six confirmed fixes plus one minor, full verification).

| Phase | Notes |
|---|---|
| Pickup | Story was half-done in the working tree; a parallel session committed that work (9d7021de) mid-run while this session was staging the same files, voiding a hand-built partial-staging patch |
| Audit | First Explore agent returned only a summary instead of the full document; a second general-purpose agent re-ran the audit and wrote the report directly (~12 min, 166k tokens) |
| Fixes | Six confirmed bugs fixed bug-by-bug with tests, no failures along the way |
| Verify | Full suite (5,584 tests) + build green on first try |

Key bottlenecks / lessons:
- **Two agent sessions sharing one working tree is the real hazard.** The tree carried another session's uncommitted work the entire run (story-writer routes, ticket-service, hover-data). Consequences: a transient typecheck failure from their half-edited file, two audit fixes (versionCount, chatMessageCount invalidation) deliberately skipped because the write paths live in their dirty files, and the metadata epic-invalidation placed in the route handler instead of ticket-service to avoid touching it. Staging explicit paths only (per standing rule) is what kept the commits clean.
- **Read-only Explore agents cannot deliver a file, and summarise instead.** For "produce a document" audits, use an agent that may write the single output file; instructing it that the investigation doc is its only permitted write worked well.

## BRDG-347 — Drag-and-drop on large virtualized sprint lists (2026-06-15)

Decoupled the DnD gate from the 40-row threshold, made virtualized rows sortable (ref composed with the virtualizer's measureElement, MeasuringStrategy.Always), fixed filter-correct optimistic reorder against the full list, and added Move-to-top/bottom row actions (new rankToBottomOf* Jira-client methods + a `position: "bottom"` route branch). New/updated tests across 3 files; verified green in a clean worktree.

| Phase | Notes |
|---|---|
| Plan (Opus) | Accurate and grounded; correctly flagged the SortableBoardRow/measureElement ref-composition risk and the filter-drops-hidden-rows bug. One simplification found during impl: move-to-top/bottom reuses the existing move-sprint route + `position`, so no rank-route change was needed |
| Implement | Clean, no logic rework; lint/typecheck green per step |
| Verify | Build's first run failed on a stale `.next` generated `routes.js` types file, then passed on re-run (known issue). Full suite isolation required a throwaway worktree (below) |

Key bottlenecks / lessons:
- **Dirty shared tree made the full suite unreadable as a pass/fail signal.** Two suite failures were NOT mine: `SprintAnalytics.test.tsx` (4, pre-existing — fails at clean HEAD) and `push-to-jira/route.test.ts` (passes at my clean HEAD, fails only with another session's uncommitted `schema.ts`/service changes). Confirming this needed a `git worktree add HEAD` + symlinked `node_modules` to run my tests against my commits in isolation (97 passed). Staging explicit paths only kept the commits clean.
- **Browser verification was blocked: the Chrome extension was disconnected.** Logged and skipped per the anti-rabbit-hole rule rather than retrying. Real drag + auto-scroll on a 348-row list is also unreliable to automate; the affordances (sortable rows, Move-to-top/bottom menu items) are covered by unit tests, but live drag/auto-scroll behaviour still needs a manual pass.
- **Build's stale-generated-types failure on first run** is a recurring false negative; a second `npm run build` is the fix, not a code change.

## BRDG-352 — ticket_sprint bridge table (sprint-membership perf) (2026-06-16)

Replaced the un-indexable `json_each` sprint-membership filter on `/api/tickets` with a normalized `ticket_sprint` bridge table (composite PK + `sprint_id` index), backfilled via migration `0078`, and maintained through one shared `syncTicketSprints` helper wired into all writers (upsert-issue in-transaction, create-ticket, move-sprint batch). Route membership is now an index-driven IN-subquery. Tests across 4 files (82 passing).

| Phase | Notes |
|---|---|
| Plan (Opus) | Accurate and grounded; nailed the DbOrTx typing concern, the write-time-vs-query-time fallback shift, and the seed-helper test impact. No rework needed during impl |
| Implement | Clean, lint/typecheck green per step; the 4 affected test files passed on first full run |
| Verify | Worktree build + typecheck + lint green; full suite green except 4 pre-existing failures from parallel HEAD commits |

Key bottlenecks / lessons:
- **Same dirty-shared-tree hazard as BRDG-347, same two culprit files.** `npm run verify` first failed on another session's half-edited `settings/column-config/route.ts` (uncommitted, references `db`/`appSetting` it no longer imports). Verified my work in a throwaway `git worktree add --detach HEAD` + symlinked `node_modules`. There, the only suite failures were again `SprintAnalytics.test.tsx` (lucide-react mock missing a newly-added `ChevronDown`) and `push-to-jira/route.test.ts` (parallel change added a 3rd `pushToJira` arg) — both from other commits already on HEAD, neither touching sprint membership.
- **A `git checkout HEAD~2` to A/B the pre-existing failures was correctly blocked by the no-branch-switch hook.** Not needed: `git status` (files unmodified) + `grep` (no references to changed symbols) + the failure messages themselves proved the failures were external.

## BRDG-343 — account-scoped settings (remaining per-account state) (2026-06-16)

Migrated the rest of the per-account state onto the BRDG-343 foundation: re-scoped 5 global `appSetting` settings to per-account `userSetting` via a `seedUserSettingFromGlobal` seed-on-read helper (`notification_prefs` deferred — sender has no request context), and moved ~18 `localStorage` keys (sprint-board filters/sort/row-fields/po-priority, epic/subtask/activity/stakeholder/chat/pipeline prefs) onto a new `useMigratedAccountSetting` hook. Device-local keys annotated; `theme` deferred (SSR flash). Browser-verified end-to-end (GET/PUT 200, persists across reload, no console errors).

| Phase | Notes |
|---|---|
| Implement | The synchronous-`useLocalStorage` → async-SWR swap was the whole cost. Three real bugs surfaced via tests: (1) an in-flight mount GET could clobber a fresh write; (2) a URL↔state sync effect (stakeholder) looped forever because `setValue` always made a new object; (3) `set-state-in-effect` lint. Fixed in `useAccountSetting` with a sticky local mirror, an unchanged-value no-op guard, and adjust-state-during-render reconciliation |
| Verify | Full suite green except 5 files that are pre-existing/parallel (`push-to-jira`, `jira/sprints`, `SprintAnalytics` ×4, `ChatLayout`) — each confirmed to fail identically at my clean file state |

Key bottlenecks / lessons:
- **Running many jsdom test files at once OOM/hung the 16GB machine repeatedly.** Symptom: one worker pinned at ~100% CPU / 2GB RSS for minutes. Root cause was twofold — a genuine infinite render loop (bug 2 above) AND default file-parallelism. Fix: `--no-file-parallelism` for multi-file local runs, and run heavy files individually. The project's `bail: 5` also masked which failures were mine until raised to `--bail=10000`.
- **Async storage changes ripple into every test that renders the component.** Tests that mocked `@/lib/api-client` without `apiFetch`, asserted `localStorage` directly, or asserted synchronously after an interaction all broke. A global `afterEach` that resets only the `/api/settings/*` SWR cache (not all keys — that starved `/api/jira/sprints`) fixed cross-test bleed.
- **Same dirty-shared-tree hazard as BRDG-347/352.** Distinguished mine from parallel by swapping in `git show HEAD:<file>` versions and re-running — `ChatLayout`/`SprintAnalytics`/`push-to-jira`/`jira-sprints` all failed independently of my changes.

## BRDG-346 — configurable backlog drop target (2026-06-16)

Replaced the hard-coded `BT: Backlog` drop tile with a per-account "default backlog" setting on the BRDG-343 foundation: new `/api/settings/backlog-drop-target` route + `useBacklogDropTarget` hook, a `backlogTargetName` prop on `SprintDropZoneBar` (resolves by name, no `__backlog__` fallback so an absent target hides the tile), and a "Backlog drop target" card on the General settings page. Tests across 2 files (route round-trip/isolation/validation + 10 drag-bar cases incl. graceful fallback). Browser-verified end-to-end (GET default -> PUT GXP -> GET persisted -> restored).

| Phase | Notes |
|---|---|
| Plan (Opus) | Accurate; chose store-by-name + default `BT: Backlog` and the prop-injection shape that kept the component test-only. Flagged the two gaps (string-default support, `useJiraSprints` carries backlogs) which I verified before coding |
| Implement | Clean; one trivial test fix (arrow-count expectation in the absent-target case). Placed the card under a new "Sprint Board" section rather than mislabeling it a Story Writer default |
| Verify | Native `<select>` keyboard change didn't commit (OS popup, screenshot can't see it); pivoted to a same-origin fetch round-trip in the page context to prove persistence through the real route + DB, then restored the original value |

Key bottlenecks / lessons:
- **Same dirty-shared-tree hazard as BRDG-347/352/343** (`jira/sprints`, `push-to-jira`, `ChatLayout`). Confirmed external by stashing only the parallel sprint-cache/route files (`jira/sprints` then passed) and reading the `push-to-jira` failure (a parallel 3rd-arg `pushToJira` signature change with a stale test). None touch this story; my files are isolated and green.

## BRDG-413 — inbox new-ticket digest (twice-daily weekday banner) (2026-06-27)

Per-user inbox digest: a pure computation lib (`inbox-digest.ts` — Amsterdam-tz/weekday/due-window helpers + `computeInboxDigest` reusing `listNewStories` + `classifyInboxRelevance`), a lazy evaluate-on-read delivery store (`inbox-digest-store.ts`, ≤2 weekday windows, per-day cap), `GET/DELETE /api/inbox/digest`, a persistent server-backed banner in the app shell, and flipping the inbox group-by default to Relevance. 4 new test files + 1 edited (39 new tests). All 6951 suite tests green at clean HEAD; build green; banner visually verified live.

| Phase | Notes |
|---|---|
| Plan (Opus) | High-value: verified the draft plan against the codebase and caught three real corrections before any code — `listNewStories` needs a full `NewStoryQueryCtx` (not a bare userId), `classifyInboxRelevance` needs `poNames` (4th input the draft omitted), and no tz util exists (use `Intl.DateTimeFormat`). Zero rework during impl |
| Implement | Clean, lint/typecheck green per checkbox; added `parseStamp` to compare SQLite space-format `readAt` against ISO `jiraCreatedAt` (naive string compare misfires within a day) |
| Verify | Cost was entirely environmental, not the code (see below) |

Key bottlenecks / lessons:
- **The postToolUse test hook collided with manual test runs, producing phantom failures.** `npm run verify` and isolated runs reported `TicketTable.test.tsx` + `sync-incremental` failures that did NOT reproduce in a clean single-process run (final clean full suite: 616 files / 6951 tests / 0 failures). A 6-commit `git worktree` bisect proved every "failure" was concurrent-vitest resource contention on the 16GB box — exactly the "ONE test process at a time" rule in CLAUDE.md. Lesson: on a flaky-looking suite, run ONE clean full suite before bisecting; the hook + a manual run = two processes.
- **`npm run build` corrupted the dev server (`.next`), and a fresh dev compile then 500'd on every route** due to Tailwind v4 scanning `docs/` and generating invalid `var(--color-surface-*)` CSS from parallel-session planning docs (BRDG-418/424 + performance-log). Production build tolerates it; Turbopack dev does not. Unblocked visual verification by temporarily moving the offending docs out of scan + `rm -rf .next` + restart, then restored them. Documented in `docs/investigations/2026-06-27-dev-server-500-tailwind-scans-docs.md`; underlying token hygiene tracked by BRDG-418. Lesson: `rm -rf .next` before restarting dev after a build, not just a restart.
- **Weekend + lazy evaluator meant the banner can't appear naturally on a Saturday.** Seeded an active digest row for the dev-bypass user (`global`) directly in `sqlite.db` (the weekend code path returns an already-active digest unchanged), screenshotted, then removed the seed.

## BRDG-435 — investigate in Story Writer chat, post result as a Jira comment (2026-06-29)

New investigation suggestion flow on top of existing plumbing: render markdown->ADF in `jiraClient.addComment` (reusing `markdownToAdf`), parse a new `<investigation>` tag in `ChatMessageParts`, a new `InvestigationSuggestionCard` (editable body, char-count guard at `JIRA_COMMENT_LIMIT`, posting/posted/error state) that posts via the existing `tickets.addJiraComment`, an "Investigate" quick prompt, and an `INVESTIGATION_INSTRUCTION` tag contract for free-form. 5 logical commits, all new/edited tests green; build green.

| Phase | Notes |
|---|---|
| Plan (Opus) | High-value: mapped the Title-Suggestions pattern end-to-end so the new card mirrored it exactly (parse-on-the-fly, no DB table, prop-drill the handler), and correctly flagged the free-form path as a cross-repo dependency on the `valk-remote-workspace` `write-story-draft` skill prompt |
| Implement | Clean per-checkbox; the only rework was the JSX-attribute `\n` quirk in one card test (string-literal attribute keeps `\n` literal — use the `{expr}` form) |
| Verify | Browser check earned its keep (see below); 2 pre-existing failures triaged out |

Key bottlenecks / lessons:
- **Visual verification caught a real gap unit tests passed over.** The "Investigate" chip was defined and route-tested, but in the live composer it was invisible: `MAX_VISIBLE_CHIPS = 5` plus the leading "Find related" chip sliced off the 5th-ranked default. The `find` tool reporting "no Investigate chip" surfaced it; fix was to rank Investigate 2nd (after "Improve") in every issue type, with a `getVisibleChips` test locking it under the cap. Lesson: a data-driven UI addition can be fully green in tests yet not render — verify the actual composer, not just the config.
- **Stored-vs-default quick prompts is a discoverability footgun.** `/api/settings/quick-prompts` returns a PO's stored custom prompts verbatim when set; defaults (and thus the new chip) only apply with no override. Documented as a NOTE on AC1 — a PO who customized prompts must add Investigate via Settings.
- **Two pre-existing red guard tests on `dev`, neither mine.** `focus-ring-guard` flags `StoryWriterChat.tsx` (documented in `docs/investigations/2026-06-29-focus-ring-guard-failing-storywriterchat.md`, offender present in baseline commit `8c8fe0b5`; my diff only added a prop) and `menu-button-guard` flags `NavPanel.tsx: active:scale-95` (an uncommitted `+` line from parallel work). Confirmed external via `git diff`/`git show`; left untouched per scope + parallel-tree hygiene. My own card press-scale offender (`active:scale-[0.98]`/`scale-100`) was caught by the same guard and fixed to `active:scale-[0.97]`.
- **Browser-tool friction (minor).** `take_screenshot` wasn't loadable this session and `get_page_text` returned empty on the SPA; the `find` natural-language tool was the reliable probe for confirming the chip.

## BRDG-439 — "Added to sprint" statusline on board rows (2026-06-30)

Extended the BRDG-414 review-queue line to also surface sprint-add events, combining with a status change into one sprint-led sentence. New changelog extractor (`extractLastSprintChangeAuthor`, set-diff add detection), 3 nullable actor columns on `ticketScopeChange` (migration 0089), a real-time actor-bearing "added" write in `upsert-issue`, a merged read in `status-changes-query` (union of status-change and sprint-add keys; ignores actor-less backfill rows), 3 render variants in `StatusChangeLine`, and a both-ids dismiss in `useStatusChanges`. 5 test files touched/created; full suite green except a pre-existing parallel-work failure; build green; line visually confirmed live on the board.

| Phase | Notes |
|---|---|
| Plan (Opus) | High-value: surfaced the key constraint up front — `StatusChangeItem.toStatus` is non-null and the query is status-change-driven, so a sprint-only ticket can't ride the existing row; drove the nullable-item + union-of-keys design. Also flagged the seen-callback chain passes a single id end-to-end (needed `(id) -> (item)` rewiring) |
| Implement | Clean. Verified before coding that `ticket.sprintName` stores the sprint *id* (not name), which made the burnup-consistent write and the "still in sprint" gate trivial; and that burnup-seed writes actor-less rows, which became the `changedBy IS NOT NULL` discriminator that kills first-rollout/synthetic noise |
| Verify | Seeded one local `ticket_scope_change` row for an active-sprint TO DO ticket, confirmed the line renders with the elbow connector + "just now" + dismiss check via the `find` tool + screenshot, then deleted the seed |

Key bottlenecks / lessons:
- **Adding an export to `@/lib/jira-client` silently breaks every full-stub mock of it.** The new `extractLastSprintChangeAuthor` was `undefined` in `sync-incremental/route.test.ts` and the shared `src/test/mocks/jira-client.ts` factory, so the real `upsertIssue` threw and those route tests returned an error shape (`data.count` undefined). Cost one verify cycle. Lesson: when adding a jira-client export consumed by `upsert-issue`, update the shared factory + any module-level `vi.mock("@/lib/jira-client", ...)` that lists the extract fns.
- **Full-suite flakiness under memory pressure, again.** A first `npm run verify` reported `TicketHistory.test.tsx` + sync jsdom `EventListener` errors that did NOT reproduce in a clean single-process `vitest run` (final: 638/639 files green). Same "ONE test process at a time" hazard as BRDG-413. Run one clean full suite before chasing a phantom.
- **Pre-existing `menu-button-guard` red on `NavPanel.tsx: active:scale-95`**, from parallel uncommitted work (also noted in commit 7e19d5ec). Confirmed external via `git status` (NavPanel not in my changeset); left untouched per scope + parallel-tree hygiene.
