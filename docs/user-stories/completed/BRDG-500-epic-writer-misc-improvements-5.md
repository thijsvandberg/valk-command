# BRDG-500: Epic Writer miscellaneous improvements (round 5)

**Status:** To Do
**Priority:** Medium
**Type:** Feature

## Description

As the PO, a fifth batch of Epic Writer refinements found while promoting breakdown cards to Jira. Today, every "Create in Jira" press on the breakdown board opens a dropdown to pick backlog / a sprint / the global default sprint (see `SprintPlacementMenu`) - repetitive when an epic's children should all land in the same place. This round adds an epic-level placement setting so that choice is made once, plus three "do it for every card" bulk actions (Create all, Deepen all, Confirm all) mirroring the board's existing "Collapse all / Expand all".

Related: [BRDG-487](completed/BRDG-487-epic-writer-misc-improvements-2.md), [BRDG-490](completed/BRDG-490-epic-writer-misc-improvements-3.md), [BRDG-491](completed/BRDG-491-epic-writer-misc-improvements-4.md) (same "misc improvements" series, same components). Design origin: `docs/plans/2026-06-04-epic-writer.md` (original Create-in-Jira placement sketch).

## Current Behaviour

- Each DRAFT breakdown card renders its own `SprintPlacementMenu` ("Create in Jira" + chevron) in the card footer (`ChildStoryCard.tsx:539-551`). Opening it always shows: "To be planned" (backlog), "Default sprint" (reads the **global** `default_sprint_id` app setting via `settingsApi.getDefaultSprint()`), then a divider and the list of active/future sprints (`SprintPlacementMenu.tsx:119-176`).
- There is no per-epic placement setting today - only the one global default sprint (`src/app/api/settings/default-sprint/route.ts`, `appSetting` key `default_sprint_id`), used app-wide (chat quick-launch, command palette, epic writer alike).
- Promoting a card hits `POST /api/epics/[key]/writer/create-in-jira` (`create-in-jira/route.ts`), which creates the Jira issue and, via `resolvePlacementSprintId()` (lines 45-57), resolves the chosen placement (`__backlog__` / `__default__` / a concrete sprint id) before moving the new issue into a sprint.
- The Deepen/Improve button is already a split button (`ChildStoryCard.tsx:489-536`): a primary label segment that stages the prompt in chat, plus a trailing paper-plane arrow that sends it now. "Create in Jira" is not built this way - it is dropdown-only.
- Each card's `suggestedLinks` (AI-proposed inter-story links) shows its own "Confirm" button, enabled only once both the source and target card are created in Jira (`canConfirm`, `ChildStoryCard.tsx:374-426`). There is no bulk confirm.
- The board header already has one bulk/master control: "Collapse all / Expand all" (`BreakdownBoard.tsx:202-218`), which drives a `Set<cardId>` shared by every card's own collapse chevron. This is the pattern to extend, not a new one to invent.
- Per-epic settings that Jira does not hold already live in `epicMetadata` (`src/db/schema.ts:269-282`, keyed by `epicKey`, no FK - e.g. PO-assigned color, team codes), with a matching `src/lib/epic-metadata.ts` (sanitize + batched-read helpers) and a dedicated PUT route per field (`/api/epics/[key]/color`, `/api/epics/[key]/teams`). This is the natural home for a new per-epic placement field.
- The compact phase control (`PhaseRail.tsx`, BRDG-491 #2: `< 3 Breakdown >` plus an icon-only "all steps" button) is folded into the `ViewHeader` row right after the epic title, separated from it by a `ViewHeaderDivider` (`EpicWriterLayout.tsx:274-278`). Because it sits directly after the title in the header's left-aligned cluster (`ViewHeader.tsx:63-97`), its horizontal position shifts with the epic title's length, and it currently uses the same plain icon-button styling as the rest of the header chrome rather than a treatment of its own.

## Proposed Approach

### 1. Epic-level child placement setting
Add a per-epic default placement for newly-created child stories, so the PO configures it once instead of choosing every time.
- Extend `epicMetadata` with a nullable `childPlacement` column storing the same value shape `SprintPlacementMenu` already uses (`"__backlog__"` / `"__default__"` / a concrete sprint id / `null` = not configured). <!-- src/db/schema.ts:269-282, mirrors color/teams columns -->
- Add `sanitizeChildPlacement` + a getter alongside `sanitizeColor`/`getEpicColorMap` in `src/lib/epic-metadata.ts`, and a `PUT /api/epics/[key]/placement` route mirroring `/api/epics/[key]/color/route.ts`.
- Expose the setting as a compact control in the Breakdown board header (`BreakdownBoard.tsx`, next to "Collapse all / Expand all"), reusing `SprintPlacementMenu`'s existing option list (backlog / default sprint / concrete sprint) so the picker UI is not rebuilt - only its target changes (persist to the epic setting instead of promoting a card).
- `null` (not configured) keeps today's behaviour byte-for-byte: every card's "Create in Jira" stays a full dropdown.

### 2. "Create in Jira" becomes a direct action once configured
- When the epic's `childPlacement` is set, each DRAFT card's "Create in Jira" follows the same split-button pattern already used for Deepen/Improve (`ChildStoryCard.tsx:496-536`): the main segment creates immediately with the epic's configured placement (no dropdown), and a small trailing chevron still opens `SprintPlacementMenu` for a one-off override on that single card (does not change the epic setting).
- When `childPlacement` is `null`, the button renders exactly as it does today (full dropdown, no split).

### 3. "Create all" button
- A board-header button (next to the placement control) that promotes every remaining DRAFT card to Jira, sequentially, using the epic's configured placement (or `"__default__"` if the epic setting is unset, so it always works without forcing configuration first). <!-- loops over useStoryWriter.createCardInJira, epic-writer-prompts.ts style single source of truth for the placement fallback -->
- Skips cards already created (idempotent, same guard `create-in-jira/route.ts:109-113` already applies per card). Hidden or disabled when no DRAFT cards remain.

### 4. "Confirm all" button
- A board-header button that confirms every pending `suggestedLinks` entry across all cards where both ends are already created in Jira (the existing `canConfirm` condition, `ChildStoryCard.tsx:380`), looping over `useStoryWriter.confirmCardLink`. Links whose target is not yet created are left pending (not confirmable yet - this button does not create cards). Hidden or disabled when there is nothing confirmable.

### 5. "Deepen all" button
- A board-header button that works out every not-yet-full card (title/bullets depth) in one chat turn, rather than one turn per card - the `break-down-epic` skill can already detail multiple cards per turn when asked (see `docs/architecture/story-writer.md:57` and the existing `deepenCardPrompt` pattern). Add a `deepenAllPrompt()` next to `deepenCardPrompt` in `src/lib/epic-writer-prompts.ts` and a `deepenAllCards()` action in `useStoryWriter.ts` (same phase-bump-to-"refine" behaviour as `deepenCard`). Already-"full" cards are left alone (bulk "Deepen" is not bulk "Improve"). Hidden or disabled when every card is already full.

### 6. Restyle the phase rail control
The compact phase control (`< 3 Breakdown >` + all-steps button, `PhaseRail.tsx`) looks like an afterthought bolted onto the header - plain icon buttons, no visual identity of its own.
- Give it a more deliberate visual treatment (e.g. a subtle bounded container instead of bare icon buttons floating in the header row) rather than a strict redesign spec - a visual polish pass for the implementer/PO to eyeball once built.
- Center it horizontally in the epic writer header, independent of the epic title's length, instead of trailing the title in the left-aligned cluster. This is local to `EpicWriterLayout.tsx` (the header's inner content wrapper is already `relative`, `ViewHeader.tsx:63`); it does not require changing the shared `ViewHeader` component.
- Once centered, drop the `ViewHeaderDivider` currently placed before it (`EpicWriterLayout.tsx:277`) - centering itself separates it from the title, so the divider is redundant.

## Out of Scope
- Bulk actions on the separate "Related stories" tab (`RelatedStoriesPanel`, `find-related` candidates) - confirmed out of scope with the PO; "Confirm all" here only covers the per-card `suggestedLinks` (inter-story link suggestions), which is what the PO's screenshot/request refers to.
- Changing the global `default_sprint_id` app setting or its use elsewhere (chat quick-launch, command palette) - unaffected by this story.
- Re-architecting the writer beyond what each item needs.

## Implementation Plan

Build in dependency order (DB → server → hook → components → styling → tests). `BreakdownBoard` is used only by `EpicWriterLayout`; `SprintPlacementMenu` only by `ChildStoryCard` — both can gain props without touching other callers.

1. **Schema + migration** — add nullable `childPlacement: text("child_placement")` to `epicMetadata` after `color`; `npm run db:generate` emits `drizzle/0094_*.sql` (`ALTER TABLE epic_metadata ADD child_placement text;`), applied by `migrate()` at runtime.
2. **Helper** (`src/lib/epic-metadata.ts`) — `sanitizeChildPlacement(value)` accepts `__backlog__` / `__default__` / a numeric sprint id, else `null`; `getEpicChildPlacement(epicKey)` single read.
3. **Route** (`src/app/api/epics/[key]/placement/route.ts`, new) — GET/PUT mirroring `color/route.ts`; PUT upserts (preserving color/teams), rejects a bad non-null shape with 400. No progress-cache invalidation (placement does not feed progress).
4. **Session route** (`writer/session/route.ts`) — add `childPlacement: getEpicChildPlacement(key)` to the GET response (and `null` on POST) so no extra client fetch is needed.
5. **api-client** (`epics`) — `setPlacement(key, placement)` → PUT `/placement`.
6. **Prompt** (`epic-writer-prompts.ts`) — `deepenAllPrompt()` alongside `deepenCardPrompt`, one turn detailing every not-yet-full card.
7. **useStoryWriter** — `childPlacement` state (from session init + `refreshSession`), `setChildPlacement` (optimistic + PUT), `deepenAllCards()` (bump phase to `refine`, send `deepenAllPrompt()`); export all three. Create-all / Confirm-all stay board-level loops over existing `createCardInJira` / `confirmCardLink` (per test spec).
8. **SprintPlacementMenu** — add additive `variant="setting"` (+ `selectedPlacement` marking, a "Not set" clear option, resolves a concrete sprint name for its trigger) and a `chevronOnly` trigger mode for the split-button override; `create`/`reassign` render unchanged.
9. **ChildStoryCard** — export `cardIsFull` helper for the board's Deepen-all test; add `childPlacement` prop. When unset: today's full dropdown. When set: split button — main segment creates immediately with the configured placement, trailing chevron (`chevronOnly` menu) is a one-off per-card override.
10. **BreakdownBoard** — new props `childPlacement`, `onSetChildPlacement`, `onDeepenAll`. Header (next to Collapse all) gains: the placement control (`setting` menu), **Create all** (loops DRAFT cards → `onCreateInJira(i, childPlacement ?? "__default__")`, skips created), **Deepen all** (`onDeepenAll`, hidden when every card full), **Confirm all** (loops confirmable `suggestedLinks`). Local `bulkAction` state disables during the create/confirm loops; each button hides/disables per its condition. Pass `childPlacement` down to cards.
11. **EpicWriterLayout** — wire the three new board props; drop the leading `ViewHeaderDivider`; absolutely-center `PhaseRail` in the header (verify visually, no `ViewHeader` change).
12. **PhaseRail restyle** — bounded container (subtle border + `bg-overlay-subtle`) around the existing controls; presentational only, existing tests stay green.
13. **Tests** — `epic-metadata.test.ts` (sanitize + getter), `placement/route.test.ts` (clone color test), `ChildStoryCard.test.tsx` (dropdown vs split + override), `BreakdownBoard.test.tsx` (bulk loops + hide/disable + placement control), `useStoryWriter.test.ts` (`deepenAllCards` prompt + phase), `EpicWriterLayout.test.tsx` (rail centered, no leading divider).

**Risk flagged:** true header-centering — `ViewHeader` nests children inside `relative` sub-containers, so an absolutely-centered rail anchors to the view-context group, not the full header. The `flex-1` truncating title keeps that group's width stable regardless of title length (satisfying the AC's "independent of title length"); exact header-center would need a `ViewHeader` change, which is out of scope. Verify visually and accept the stable near-center.

## Acceptance Criteria
- [x] The PO can set, per epic, where new child stories are created: backlog, a specific sprint, or the global default sprint. <!-- epicMetadata.childPlacement + PUT /api/epics/[key]/placement -->
- [x] With no epic placement configured, every "Create in Jira" button behaves exactly as today (full dropdown). <!-- ChildStoryCard.tsx, SprintPlacementMenu default path -->
- [x] With an epic placement configured, "Create in Jira" is a split button: the label creates immediately with the configured placement; a small chevron still allows a one-off override for that card only. <!-- ChildStoryCard.tsx, mirrors the Deepen/Improve split button -->
- [x] A "Create all" button promotes every remaining DRAFT card to Jira with the resolved placement, skipping already-created cards. <!-- BreakdownBoard.tsx header, loops useStoryWriter.createCardInJira -->
- [x] A "Confirm all" button confirms every pending inter-story link suggestion whose both ends are already created in Jira. <!-- BreakdownBoard.tsx header, loops useStoryWriter.confirmCardLink -->
- [x] A "Deepen all" button works out every not-yet-full card into a full description + AC in one chat turn. <!-- useStoryWriter.deepenAllCards + epic-writer-prompts.ts DEEPEN_ALL_PROMPT -->
- [x] Each new bulk button is hidden or disabled when there is nothing for it to do (no DRAFT cards / no confirmable links / no cards left to deepen). <!-- BreakdownBoard.tsx -->
- [x] The phase rail control has a more deliberate visual treatment, is horizontally centered in the header independent of the epic title's length, and no longer has a divider before it. <!-- PhaseRail.tsx, EpicWriterLayout.tsx:274-278 -->
- [x] Shared-component changes do not regress the Story Writer (single-story mode); new/changed behaviour is covered by tests; `npm run test` and `npm run build` pass. <!-- ViewHeader gained an additive optional centerSlot (renders nothing when unused); full suite 8063 tests + build green -->

<!-- Implementation note (#6): the phase rail is centered via an additive, optional `centerSlot` overlay on ViewHeader (rendered only when passed, so no other view's DOM changes). The story assumed this could be done purely in EpicWriterLayout, but the header's children nest inside `relative` sub-containers, so an EpicWriterLayout-only absolute wrapper anchored to the title cluster and overlapped the title (verified in-browser). The centerSlot anchors to the full-width capped header instead; the epic title is capped (max-w-[22rem]) so it truncates before the centered rail. -->


## Tests
- [x] Epic placement setting: persists and reads back via the new route/helper. <!-- src/lib/epic-metadata.test.ts, src/app/api/epics/[key]/placement/route.test.ts -->
- [x] `ChildStoryCard`: renders the plain dropdown when unset, the split button + override chevron when set. <!-- src/components/epic-writer/ChildStoryCard.test.tsx -->
- [x] `BreakdownBoard`: Create all / Confirm all / Deepen all call the right per-card actions and hide/disable correctly when nothing is actionable. <!-- src/components/epic-writer/BreakdownBoard.test.tsx -->
- [x] `useStoryWriter`: `deepenAllCards` sends the multi-card prompt and bumps phase to "refine", matching `deepenCard`. <!-- src/hooks/useStoryWriter.test.ts -->
- [x] `EpicWriterLayout`: phase rail renders centered without the leading divider. <!-- src/components/epic-writer/EpicWriterLayout.test.tsx -->

## Related
- [[BRDG-490-epic-writer-misc-improvements-3]] - "Collapse all / Expand all" is the master-control pattern this story extends.
- [[BRDG-491-epic-writer-misc-improvements-4]] - the send/stage split-button model reused for "Create in Jira".
- `docs/architecture/story-writer.md` (Epic Writer reuse section) - update after implementation.
