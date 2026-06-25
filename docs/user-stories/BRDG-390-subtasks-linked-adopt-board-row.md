# BRDG-390: Subtasks + linked-issues rows share one surface with BoardRow

**Status:** Not Started
**Priority:** Medium
**Type:** Refactoring

## Description

As a developer, I want the **subtasks list** (`SubtasksSection`) and the **linked-issues list** (`LinkedIssuesSection` -> `LinkedIssueRow`) to look like, and stay in sync with, the shared sprint-board row, **without** forcing them onto `BoardRow`.

The goal here is **not** "one row component". It is:
- **goed in elkaar** — a clean separation between the row's *look + state behaviour* and its *per-host content*;
- **op elkaar lijkt** — subtasks/linked rows render the same surface as every other list (board, inbox, epic, compare, refinement, cleanup);
- **één plek aanpassen** — a visual or surface-state change is made once and lands everywhere, instead of being hand-copied per row.

So the chosen approach is: **keep `ChildIssueRow`** (its slots are a feature for these two hosts), but **extract the duplicated row "skin" into one shared source** that both `BoardRow` and `ChildIssueRow` consume.

## Current state (after BRDG-367 / 388 / 389)

The row-unification series is otherwise complete:
- `BoardRow` / `SortableBoardRow` renders the sprint board, inbox, Story Writer landing, epic-children (both views), the **Compare view** (BRDG-388, legacy `TicketRow` deleted) and the **refinement + cleanup** lists (BRDG-389).
- `ChildIssueRow` (~286 lines) is now imported by **only two** hosts: `SubtasksSection` and `LinkedIssueRow`.

These two stayed on `ChildIssueRow` on purpose: they use the slot flexibility `BoardRow` deliberately lacks (per-row Edit/Delete and unlink actions via `actionsSlot`, inline rename on subtasks, and the editable **relation** on linked issues). That flexibility is correct to keep; it is the *visual + state drift* between the two row implementations that this story removes.

## The drift to remove

Both rows hand-maintain the **same surface state machine** (precedence, highest first: selected / context-target > checked > flagged > focus > hover, plus independent opacity fades for deprecated / removed-from-jira / inflight, plus last-in-card rounding). Because it is written twice, it drifts. The 2026-06-17 investigation matrix documented it: `ChildIssueRow` is missing context-target, keyboard-focus, removed-from-jira and live-pulse states, and it uses a different accent mechanism (`box-shadow: inset 3px 0`) than `BoardRow` (`border-l-[3px]`). The recent left-accent tweak (BRDG-367) is a concrete example: it had to be reasoned about separately because the surfaces are separate.

## Approach: extract a shared row surface

1. **Extract `rowSurfaceClasses(state, opts)`** — a pure helper that returns the className string for the row's surface element, given a state object (`{ selected, contextTarget, checked, flagged, focused, deprecated, removed, inflight, lastInCard, hideAccent }`) and options (e.g. `accent`). Lift it from `BoardRow` (the more complete implementation), so the board's surface is unchanged.
2. **`BoardRow` consumes the helper** for its surface `<div>` (inside its `<tr><td>`). No visual change to any existing `BoardRow` host.
3. **`ChildIssueRow` consumes the same helper** for its surface `<div>`. This pulls in the states it was missing (context-target, focus, removed, live-pulse) and makes subtasks/linked match the board.
4. **Standardise the accent mechanism** so the rows actually look alike (pick one: `BoardRow`'s `border-l` is the natural choice; `ChildIssueRow`'s inset shadow goes away).
5. **Drift-guard test** — assert that `BoardRow` and `ChildIssueRow` produce the same surface classes for the same state, so the two cannot silently diverge again.

The element wrapper stays per-component (`BoardRow` is a `<tr><td><div>`, `ChildIssueRow` is a `<div>`); only the **surface classes on that div** are shared, which is exactly the part that drifts.

What stays per-component (unchanged):
- `BoardRow`: its inline metadata cluster (SP/BV/epic/sprint/quality/assignee/warnings/session decorations) and its `SortableBoardRow` DnD.
- `ChildIssueRow`: `metadataSlot` / `actionsSlot` / `dragHandleSlot`, inline rename, lazy hover-data, and the linked-issue relation handling.

## Considered and rejected: merge subtasks/linked into BoardRow

Folding these two onto `BoardRow` (deleting `ChildIssueRow`) was considered and rejected:
- It would require **growing `BoardRow`** with a generic per-row actions overlay and an externally-controlled inline-rename mode, adding surface and regression risk to the most perf-critical, widely-used row in the app.
- The payoff is only "delete a 286-line component" — and with the shared surface above, that component no longer drifts anyway.
- "One component" is explicitly **not** a goal; "consistent + maintainable" is, and the shared surface delivers that at a fraction of the risk.

If a future need makes full merge worthwhile, it is a separate decision; this story deliberately does not pursue it.

## Implementation Plan

> Produced by an Opus Plan agent against the current tree (2026-06-25). File/symbol-level reference.

### Helper: `src/components/sprint-board/row-surface.ts` (new, pure, no React)
`rowSurfaceClasses(state: RowSurfaceState, opts?: { accent?: "border" | "none" }): string` returning ONLY the surface-state classes (base `border-l-[3px]`, bg-tint group, accent-color group, focus outline, opacity fade, rounding, `live-pulse`). Layout classes (`group/row`, `@container/boardrow`, flex/padding/cursor/transition) stay inline per host. `RowSurfaceState` fields: `selected, contextTarget, checked, flagged, focused, removed, deprecated, inflight, lastInCard, firstInCard, hideAccent, livePulse`. It must reproduce BoardRow's CURRENT class strings verbatim (selected/context -> `bg-brand-600/12`; checked -> `bg-brand-500/6 hover:/10`; flagged -> error tint + hover; resting -> `hover:bg-overlay-subtle`; accent group border-l colors with `hideAccent`->transparent; focus outline; removed `opacity-50` > deprecated `opacity-60` > inflight `opacity-70`; `rounded-t/b-[11px]`; `live-pulse`). Keep both `checked` and `selected` accent branches literal (same color, two branches) so the drift-guard stays meaningful.

### Phase 1 (one commit, ZERO board change)
- Add `row-surface.ts` + `row-surface.test.ts` (Layer A: pin the exact output string for every state + precedence combo + `accent:"none"`).
- Re-point `BoardRow.tsx`'s surface `<div>` (lines ~430-452): keep the layout prefix inline, replace the state ternaries with one `rowSurfaceClasses({...})` call (`selected:isSelected, contextTarget:isContextTarget, checked:isChecked, flagged:Boolean(ticket.flagged), focused:isFocused, removed:isRemoved, deprecated:isDeprecated, inflight:isInflight, lastInCard:isLastInCard, firstInCard:isFirstInCard, hideAccent:hideRowAccent, livePulse:liveChangeKinds.size>0`). Base `border-l-[3px]` stays first (no content shift). Existing BoardRow tests (py-/rounded- assertions) prove zero change.

### Phase 2 (one commit) — ChildIssueRow adopts the helper
- Re-point `ChildIssueRow.tsx`'s surface `<div>` (lines ~162-172) at `rowSurfaceClasses`; add `useLiveTicketChange(item.key)`. Prop map: `selected:isActive, checked:isChecked, flagged, deprecated:isDeprecated, inflight:isPending, lastInCard:roundBottom, firstInCard:roundTop`; `contextTarget/focused/removed:false` (gained but inert; `Subtask`/`LinkedIssue` have no `removedFromJiraAt`).
- **Accent standardisation:** drop the `shadow-[inset_3px_0_0_0_...]` accent; the helper's `border-l` wins. Align ChildIssueRow's drag-handle offset to `-left-[3px]` to straddle the new border like BoardRow.
- **Cursor/hover consolidation:** host keeps only `onSelect && !isPending ? "cursor-pointer" : ""`; the resting `hover:bg-overlay-subtle` now comes from the helper (omitted on active/checked/flagged, exactly as before). Preserves the "no hover bg on active row" test.
- Add `row-surface.drift.test.tsx` (Layer B: BoardRow and ChildIssueRow emit the same helper-owned tokens for the same state, across the matrix). Landed in Phase 2 so Phase 1 stays green.
- Update `ChildIssueRow.test.tsx`: active accent `shadow-[inset...brand-300]` -> `border-l-[var(--color-brand-300)]`; checked `bg-brand-500/[0.06]` -> `bg-brand-500/6`; add a pending -> `opacity-70` assertion. Verify flagged / active-beats-flagged / roundTop-bottom / "no hover bg on active" still pass.

### Intended visual deltas for subtasks/linked (flag at PO visual check)
- **+3px constant left border** (was inset shadow reserving no space): all content shifts 3px right uniformly (no per-state jump), matching the board. Fallback if rejected: `-ml-[3px]` compensator (do NOT pre-apply).
- pending fade `opacity-50` -> `opacity-70`; checked alpha `/[0.06]` -> `/6` (identical render). Gains: context-target/focus/removed fields (inert today), resting hover accent, checked accent, and live-pulse.

### Out of scope / future
- `PlaceholderRow.tsx` is a third partial copy of the surface (hover + last-in-card only); it can adopt `rowSurfaceClasses` later with no helper change. Not in this story.

### Risks
- The 3px shift (primary; constant, matches board, confirm visually). `<div>` vs `<tr>` is a non-issue (BoardRow's surface is itself a div; no class is table-dependent). `useLiveTicketChange` added to ChildIssueRow is an unconditional top-level hook (rules-safe).

## Preconditions

- [ ] Clean working tree; commit each phase as its own logical unit.

## Phase 1: Extract the shared surface from `BoardRow`

- [x] Add `rowSurfaceClasses(state, opts)` (its own module, e.g. `src/components/sprint-board/row-surface.ts`). <!-- + row-surface.test.ts (Layer A: pins the exact class string per state, the drift contract) -->
- [x] Re-point `BoardRow`'s surface `<div>` at the helper; confirm **zero** visual/behavioural change for the board / inbox / Story Writer / epic / compare / refinement / cleanup hosts (snapshot + the existing host tests). <!-- BoardRow's existing py-/rounded- assertions pass unchanged -->
- [x] Add the drift-guard test. <!-- Layer A (string-pin) lands in Phase 1; the Layer B both-rows-agree guard lands in Phase 2 alongside the ChildIssueRow change so each commit stays green -->


## Phase 2: Point `ChildIssueRow` at the same surface

- [ ] Re-point `ChildIssueRow`'s surface `<div>` at `rowSurfaceClasses`, standardising on the shared accent (drop the inset-shadow accent).
- [ ] Verify subtasks (`SubtasksSection`) and linked issues (`LinkedIssuesSection`): all surface states (selected / context-target / checked / flagged / focus / hover / deprecated / removed / inflight / last-in-card rounding) now match the board, while Edit/Delete, inline rename, drag-reorder, unlink and relation-change behave exactly as before.
- [ ] Update the affected tests; `npm run verify` + `npm run build` green; PO visual check of the ticket-detail subtasks + linked-issues lists.

## Acceptance Criteria

- [ ] One shared source (`rowSurfaceClasses` or equivalent) defines the row surface state machine, consumed by both `BoardRow` and `ChildIssueRow`.
- [ ] Subtasks and linked-issues rows visually match the board rows across all surface states; a surface change made once applies to both.
- [ ] `ChildIssueRow` keeps its slots, inline rename, lazy hover-data and relation handling; subtasks/linked behaviour is unchanged.
- [ ] A drift-guard test prevents the two surfaces from diverging again.
- [ ] No regression on any `BoardRow` host.
- [ ] `npm run verify` and `npm run build` pass.
- [ ] Explicitly out: subtasks/linked are **not** moved onto `BoardRow`, and `ChildIssueRow` is **not** deleted.

## Out of scope

- Merging subtasks/linked into `BoardRow` or deleting `ChildIssueRow` (rejected above).
- The other row migrations: epic-children (BRDG-367), Compare (BRDG-388), refinement + cleanup (BRDG-389) — all done. Inbox already used `BoardRow`.
- Sharing the gutters (checkbox + grip) and the hover-actions overlay as a `<RowShell>` component. A reasonable later step if drift reappears beyond the surface classes, but not required to meet this story's goal.

## Fallback

If the two surface `<div>`s turn out to diverge too much to share one helper cleanly, the minimum acceptable outcome is the drift-guard test plus a short documented surface-state checklist, so the duplication is at least guarded and the gaps (context-target, focus, removed, live-pulse) are closed by hand once.

## References

- [BRDG-367: Epic-children list adopts the shared BoardRow](completed/BRDG-367-epic-children-adopt-board-row.md) — the precedent; the left-accent tweak that motivated a shared surface.
- [BRDG-388: Compare view](BRDG-388-compare-view-adopt-board-row.md) · [BRDG-389: refinement + cleanup](BRDG-389-refinement-cleanup-adopt-board-row.md) — completed sibling migrations.
- [docs/investigations/2026-06-17-unified-issue-row.md](../investigations/2026-06-17-unified-issue-row.md) — the surface-state comparison matrix (documents the exact drift this story removes).
