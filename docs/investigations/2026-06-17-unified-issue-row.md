# Unifying `BoardRow` and `ChildIssueRow`

**Date:** 2026-06-17
**Story:** BRDG-347 (investigation only, no production code changes)
**Question:** Can the sprint board's `BoardRow` and the ticket-detail `ChildIssueRow` be merged into one shared row, so visual/behavioural parity stops relying on hand-copying treatments across two files?

## TL;DR

**Recommendation: (b) partial extract.** Pull the row *surface state machine* (background tint + left accent + opacity fades + focus ring + last-row rounding, with their precedence) into a single shared helper/wrapper that both rows consume, parameterised by an `accent: "border" | "inset"` variant. Add a small drift-guard test on top.

Do **not** attempt a full merge. The two rows are already separately-evolved shared components with different container elements (`<tr>` vs `<div>`) and opposite metadata philosophies (baked-in cluster vs host-filled slot). A single composite would re-create exactly the tension BRDG-208 hit when it deliberately skipped the unified `ChildIssueList`. The drift the story cites (flagged tint, selected highlight) lives entirely in the surface layer, so extracting only that layer removes the drift at its source for a fraction of the cost and risk of a full merge.

## What these components actually are today

Both are **already shared, reused row components** — this reframes the story. The choice is not "two bespoke rows -> one shared row"; it is "two *different styles* of shared row -> can they share a core?".

| | `BoardRow` (~814 lines) | `ChildIssueRow` (~286 lines) |
|---|---|---|
| Reuse model | Fat row, ~40 optional props that self-hide when absent | Thin shell, host fills `metadataSlot` / `actionsSlot` / `dragHandleSlot` |
| Container element | `<tr><td><div>` (table row) | plain `<div>` (flex list item) |
| Memoised | `memo(forwardRef(...))`, perf-critical | plain function component |
| Data in | full `Ticket` | `Subtask` + separate props |
| Live hosts | Sprint board (`TicketTable`), Story Writer landing, New-story inbox | `EpicChildrenSection`, `SubtasksSection`, `LinkedIssueRow`, `EpicChildrenBySprint`, `RefinementTicketList`, cleanup page |

The `<tr>` vs `<div>` split is structural, not cosmetic: the board renders inside a `<table>` because its virtualizer (`measureElement` composed onto the `<tr>` in `SortableBoardRow`) and sticky behaviour need it. The detail sections are plain flex lists of dozens of items, no virtualization.

## `TicketRow.tsx` scope (AC)

**Legacy, excluded.** `TicketRow.tsx` (~686 lines) is imported only by `DroppableSprintColumn.tsx`, which is used only by `MultiSprintView.tsx` (the Compare / multi-sprint view). Per the project memory note it is being phased out; the live board row is `BoardRow`. It should **not** fold into a shared core now — doing so would couple the shared row to a component slated for removal. When Compare is migrated off `TicketRow`, it should adopt whatever `BoardRow`/shared-shell ends up as, not the reverse.

## Feature / state comparison matrix

### Surface state machine (background + accent + fades)

Precedence in both, highest first: **selected/active > context-target > checked > flagged > focus > hover**, with independent opacity fades for removed / deprecated / inflight.

| State | `BoardRow` | `ChildIssueRow` |
|---|---|---|
| selected / active | bg `brand-600/12` + `border-l brand-300` | bg `brand-600/12` + `inset 3px shadow brand-300` |
| context-target (open menu) | same as selected | **missing** |
| checked | bg `brand-500/6`, hover `/10` + `border-l brand-300` | bg `brand-500/6` (no accent) |
| flagged | bg `error/6`, hover `/8` + `border-l error` | bg `error/6`, hover `/8` + `inset 3px shadow error` |
| focused (keyboard) | `outline brand-500/40` | **missing** (no keyboard nav here) |
| hover (resting) | bg `overlay-subtle` + `border-l brand-400/25` | bg `overlay-subtle` (no accent) |
| deprecated | `opacity-60` | `opacity-60` |
| removed-from-jira | `opacity-50` | **missing** (no removed state here) |
| inflight / pending | `opacity-70` | `opacity-50` (pending) |
| live-pulse (BRDG-338) | `live-pulse` class | **missing** (no per-row live subscription) |
| insert-line (DnD) | `inset` top/bottom `brand-500` | handled by parent |
| last-in-card rounding | `rounded-b-[11px]` | `rounded-b-[11px]` |

**Key divergence — accent mechanism:** `BoardRow` uses a real `border-l-[3px]` (always reserves 3px of width, only the colour changes). `ChildIssueRow` uses `box-shadow: inset 3px 0` (consumes no layout width). This difference is *intentional* and must survive any extraction as a variant, not be normalised away.

### Gutters, content, actions

| Aspect | `BoardRow` | `ChildIssueRow` |
|---|---|---|
| Drag grip | absolute grip in left gutter, hover-revealed, hidden during multiselect; whole row is the activator | same grip pattern, but wraps a host-passed `dragHandleSlot`; `useSortable` lives in the host wrapper |
| Checkbox gutter | built-in checkbox, `hideCheckbox` to drop | `selectable` toggle + `onCheckboxClick` + `inlineCheckbox` variant |
| Leading pill | `TicketStatusPill` (always full: readiness, edit dots) | `TicketStatusPill` with `showTypeIcon/showKey/showStatus/showReadiness` toggles |
| Edit-state dot | `EditStateDot` (local_edits / conflict) | identical |
| Title | truncating, `text-primary`, inline edit via **textarea** + save/cancel buttons + autosize + outside-click | truncating, `text-secondary`, inline edit via **single-line input** + Enter/Esc/blur |
| Metadata | **hardcoded ordered cluster**: OpenSubtasks indicator, split badge+title, warning labels (BRDG-313), epic placeholder/chip, SP+BV placeholder/value with `HoverRevealSlot` + frozen-slot logic (BRDG-323), notes, refinement gem, "Jira changed" badge, sprint chip, flag, quality badge, reporter, assignee picker, sessionTimeAgo, createdAt | flag + a single host-filled `metadataSlot` |
| Actions overlay | built-in `onDiscard` / `onMarkRead` buttons, gradient fade from **`surface-elevated`** | generic `actionsSlot`, gradient fade from **`surface-base`** |
| Click | cmd/ctrl -> new tab; `onActivate` -> resume; else `onSelectTicket` toggle; 200ms hover prefetch | cmd/ctrl -> new tab; else `onSelect(key, e)` (event forwarded for shift-range); `onMouseEnter` lazy prime; no prefetch |

### Drift the story warned about (found in the matrix)

Real inconsistencies surfaced, separate from intentional differences:

- Actions-overlay fade colour differs (`surface-elevated` vs `surface-base`) — should be aligned.
- `ChildIssueRow` lacks context-target / focus-ring / removed / live-pulse treatments. Most are genuinely N/A for child rows (no keyboard nav, no removed state, no per-row live subscription), so this is *expected* divergence, not a bug — but it is exactly the kind of thing that gets hand-copied wrong later.
- Title colour `text-primary` (board) vs `text-secondary` (child) appears to be an intentional hierarchy choice; worth confirming, not changing here.

## Answers to the six questions

1. **Shared vs view-specific.** Genuinely shared: the surface state machine, the grip + checkbox gutters, the leading `TicketStatusPill`, the truncating title + inline edit, the trailing actions overlay with gradient fade, last-row rounding, and the cmd/ctrl/context-menu click handling. View-specific: `BoardRow`'s entire metadata cluster (warning labels, epic/SP/BV placeholders with freeze logic, refinement gem, quality badge, sprint chip, reporter, session badges, live-pulse, prefetch) **and** the `<tr>` vs `<div>` container.

2. **Single `IssueRow` core with slots?** The shared part is real but **thin** — it is essentially the shell. The divergence is concentrated in (a) the container element and (b) the metadata philosophy. `ChildIssueRow` already proves the slot model for the thin shell. But `BoardRow`'s cluster is *not* slot-shaped today; merging would mean lifting ~250 lines of hover/placeholder/frozen-slot logic out of the row and into a board-specific wrapper that fills `metadataSlot`. That is a large, risky move (the freeze + hover-reveal logic is intimate with the row's own hover state) for little payoff. This is the BRDG-208 lesson restated: the shell is shareable, the composite is not.

3. **State model expressible once?** Yes. The full precedence (selected > context > checked > flagged > focus > hover, plus the opacity fades and last-row rounding) is pure class-string computation and can live in one helper. The only wrinkle — border-l vs inset-shadow accent — is handled by an `accent: "border" | "inset"` parameter. This is the highest-value, lowest-risk extraction.

4. **Minimal common data interface.** `{ key, title, jiraStatus, type?, flagged?, readiness?, editState?, isDeprecated, isRemoved }`. `BoardRow` already has all of this on `Ticket`; `ChildIssueRow` has it on `Subtask` + props. The surface helper needs only the boolean *states* (selected/checked/flagged/focused/...), not the data object, so the adapter cost for option (b) is essentially zero — each row keeps its own data shape and just feeds booleans into the helper.

5. **Risk.** A full shared *component* is risky: it would wrap the perf-critical board row in extra layers (threatening the `memo` boundary, the `measureRef` composition, and per-row `live-pulse`/prefetch), and it must reconcile `<tr>` vs `<div>` (a polymorphic `as` prop complicates the table/virtualization path). A shared *class helper* (option b) carries none of this risk: it returns strings, changes no element, adds no component layer, and touches no perf path. React Compiler constraints (no setState-in-effect, no ref-access-in-render) are already satisfied by both rows and are unaffected by a pure-function helper.

6. **Effort & payoff.**
   - **(a) Full merge** — large effort, high risk, low payoff. Not recommended.
   - **(b) Partial extract** — small/medium effort, low risk, directly kills the cited drift. **Recommended.**
   - **(c) Keep separate + drift-guard test** — cheap, but only *detects* drift after the fact. Option (b) makes the drift *structurally impossible*, which is strictly better; keep a small test as a bonus, not the primary measure.

## Recommendation: (b) partial extract + drift guard

Extract a single source of truth for the row surface:

- A helper `rowSurfaceClasses(state, { accent })` (or a thin `<RowSurface>` wrapper) returning the background + accent + opacity + focus + rounding classes for a given state, with `accent: "border" | "inset"`.
- Both `BoardRow` and `ChildIssueRow` call it instead of carrying their own ternary ladders.
- Align the actions-overlay gradient (single fade-colour token, or a documented per-host token).
- Add a drift-guard test asserting both rows emit equivalent surface classes for each shared state (modulo the accent variant).

This removes the flagged-tint and selected-highlight drift permanently, keeps the two rows' bodies (metadata cluster vs slots) exactly as they are, and never touches the board's performance path.

## Proposed follow-up story (draft)

**BRDG-XXX: Extract a shared row-surface state machine**

- [ ] Add `rowSurfaceClasses(state, { accent })` (or `<RowSurface>`) covering selected, context-target, checked, flagged, focus, hover, deprecated, removed, inflight, last-in-card rounding
- [ ] Support `accent: "border"` (BoardRow, reserves 3px) and `accent: "inset"` (ChildIssueRow, inset shadow)
- [ ] Migrate `BoardRow` to consume it (no visual change; verify board, Story Writer landing, inbox)
- [ ] Migrate `ChildIssueRow` to consume it (no visual change; verify subtasks, epic children, linked issues, refinement list, cleanup page)
- [ ] Align the actions-overlay gradient fade colour (or document the per-host token)
- [ ] Add a drift-guard test: both rows emit equivalent surface classes per shared state (accent variant excepted)
- [ ] `npm run verify` + `npm run build` green

Scope: surface layer only. Explicitly out of scope: merging the metadata cluster, changing the `<tr>`/`<div>` containers, touching the data model or any shared primitive.

## Out of scope (confirmed, no code changed in this story)

- Implementing the merge (the draft above)
- Changing the data model, API routes, or any shared primitive
- Visual redesign of either row beyond describing the shared contract
