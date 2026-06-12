# BRDG-340: Detail-View Editing — Autosave-First, Two-State Edit Model, Cross-Tab Safeguard

**Status:** Ready to implement
**Priority:** TBD
**Type:** Story
**Builds on:** BRDG-339 (Story Writer footer rework: autosave + wrap up, version-token 409 on `local-edits`)

## Problem

BRDG-339 made the Story Writer autosave-first, but the edit flows outside it still follow the old model. The shared inline editor (`EditableDescription`, used on the ticket detail page, the refinement session view and the board side panel) already autosaves drafts every 800ms, yet still leads with a **Save** button whose only real meaning is "promote my autosaved draft to a deliberately-kept edit and close the editor".

That promotion feeds a three-tier edit model that is now half-orphaned:

1. typing → autosaved **draft** (`isDraft=true`, amber "Unsaved changes" badge)
2. Save → **saved local edit** (`isDraft=false`, teal "Local edits" badge)
3. Push to Jira → clean

Since BRDG-339 the Story Writer never writes tier 2 (its Save button is gone), so the amber/teal distinction only exists for tickets edited via the detail view. As the single user, the PO has to remember a distinction that no longer answers any real question. The meaningful states are "differs from Jira" and "in Jira".

Two more gaps:

- **No concurrency safeguard.** Detail-view saves are still blind upserts; they do not send the `baseModifiedAt` token introduced in BRDG-339. The realistic collision is now detail view ↔ Story Writer on the same ticket, both autosaving.
- **Conflict detection has a hole.** `computeTicketEditState` only reports "conflict" when a *saved* (tier 2) edit sits on an outdated Jira base. Drafts on an outdated base show no conflict at all.

## Goal

As the PO, I want every edit surface to behave like the new Story Writer: typing just saves, the UI tells me quietly that it did, the only decisions left are Discard or Push, and concurrent edits can never silently overwrite each other.

## Design

### 1. Autosave-first editor (Save button removed)

- `EditableDescription` (all three surfaces inherit): remove the **Save** button. The toolbar actions become: quiet **Saving… / ✓ Saved** indicator (same microcopy and icons as the Story Writer footer) + **Discard** (ghost) + **Push to Jira** (primary, only when the content differs from Jira).
- Closing the editor (Escape, clicking outside, switching tickets) never loses work: the pending debounce is flushed on close/unmount (the sendBeacon flush already exists for navigation/unload).
- `EditableTitle`: same model — its save on commit stays, but it no longer writes a different tier than the description (see 2).
- The expandable diff badge under the description keeps its Discard / Push actions.

### 2. Collapse the edit model to two states (+ conflict)

- `TicketEditState` becomes `clean | local_edits | conflict` — the `draft` member is removed.
- `computeTicketEditState`: any local edit → `local_edits`; any local edit whose `baseJiraVersion` differs from the latest Jira version → `conflict` (this now also covers what used to be drafts on a stale base — the hole above).
- Clients stop distinguishing `isDraft` on writes (all client saves may keep sending `isDraft=true`; the flag becomes an internal storage detail with no UI meaning). The promote-on-save logic in `EditableDescription` and the `promoteDrafts` PATCH flow lose their purpose and are removed where they only served the badge split.
- UI: one badge ("Local edits", current teal treatment) replaces the amber "Unsaved changes" / teal "Local edits" pair, everywhere `editState` is surfaced: detail page badge + diff, `TicketStatusPill`, board rows (`BoardRow`, legacy `TicketRow`), `SidePanel`, `FilterBar` (merge the draft/local-edits filter options into one), `SprintInsights` counts, refinement queue/list items, `TicketSyncBridge`.
- The `draftsOnly=true` DELETE param keeps working server-side (other callers exist) but the detail editor's cosmetic-draft cleanup switches to plain semantics consistent with the collapsed model.

### 3. Cross-tab/cross-surface safeguard (version token)

- `EditableDescription` and `EditableTitle` saves send `baseModifiedAt` (the `modifiedAt` from the last load/save of that field) and adopt the returned `modifiedAt`, exactly like the Story Writer drafts hook.
- On a 409: pause autosave and show the same banner — "This draft was changed in another tab. Autosave is paused." with **Reload draft** / **Overwrite**. Extract the token-tracking save helper from `useStoryWriterDrafts` into a small shared lib so both surfaces use one implementation.
- The unload sendBeacon stays blind (fire-and-forget cannot handle a 409); the next interactive save reconciles. Unchanged from BRDG-339.

## Implementation Plan

Order: the `TicketEditState` type collapse goes FIRST (compile-breaking, fans out to ~10 consumers — the red typecheck is the worklist), then the shared saver extraction (additive), then the editor rework, then the banner wiring.

1. **Type collapse** — `src/types/ticket.ts` (`TicketEditState` = `clean | local_edits | conflict`), `src/lib/ticket-state.ts` (`computeTicketEditState`: any edit → `local_edits`; stale `baseJiraVersion` → `conflict`, no more `hasSaved` gate). Fix all red consumers: `TicketTableCells` `EDIT_STATE_CONFIG`, `BoardRow`, legacy `TicketRow`, `SidePanel` (drop `isDraftOnly`), refinement x3 (`SortableQueueItem`, `RefinementTicketList`, `RefinementQueuePanel`), `TicketStatusPill`, `filter-bar-types` (one merged option "Local changes"), `useSprintBoardFilters` (map legacy persisted `"draft"` filter value → `local_edits` on read). Server callers (`ticket-detail-builder`, `/api/tickets` route, `deleteLocalEdits` broadcast) need no code change; their returned states shift per the new rule.
2. **Shared saver** — new `src/lib/local-edit-saver.ts`: `useLocalEditSaver()` hook owning the `${key}:${field}` → `modifiedAt` token map, conflict/pause refs + `conflict` state, the PUT choke point (`persistLocalEdit(key, field, value, {isDraft, blind})`), a `lastRejected` map recorded on 409 so `overwrite()` can re-save blind, plus `setToken`/`clearTokens`/`clearConflict`/`setExternalPause`. Refactor `useStoryWriterDrafts` onto it with its public API unchanged (`draftSaveState`, `draftConflict`, `resolveDraftConflict`, `setAutosavePaused`) so BRDG-339 tests pass without churn.
3. **EditableDescription rework** — remove the Save button, `editIsDraft` state and the promote-on-save path; single flush path (`flushPending`) used by Escape/outside-click/Cmd-S/unmount; Saving…/Saved indicator (same microcopy as Story Writer footer) in the toolbar actions; badge always the teal "Local edits" treatment; autosave routed through the saver (sends `baseModifiedAt`); built-in amber conflict banner (shown on `saver.conflict`) so every surface that embeds the editor gets it. Optional `saver` prop: the detail page passes a page-level instance shared with the title editor; other surfaces fall back to an own instance (Reload button only shows when an `onConflictReload` handler is provided; Overwrite always works via `saver.overwrite()`).
4. **EditableTitle** — commit-save routed through the shared (page-level) saver so it carries `baseModifiedAt`; a title 409 raises the same shared conflict, surfaced by the description editor's banner.
5. **Detail page wiring** — `useTicketDetailPage` creates the saver, provides `onConflictReload` (revalidate + `draftDiscardKey` bump remounts both editors and reseeds tokens); `TicketTabContent` passes saver + handler down.
6. **Tests** — `ticket-state` rewrite (incl. stale-base draft → conflict), new `local-edit-saver` tests, `EditableDescription` churn (no Save button, indicator, Escape-flush, token round-trip, 409 pause), `EditableTitle` token test, `useStoryWriterDrafts` unchanged-API run, filter option merge, consumer dot tests, server fixtures expecting `"draft"`.

Decisions on plan ambiguities: Reload resolves via remount (existing `draftDiscardKey` primitive; in-flight keystrokes in the other editor are dropped — acceptable, Reload means "take the other tab's version"); Overwrite re-saves the 409-rejected values recorded in the saver (covers simultaneous title+description conflicts); legacy persisted `"draft"` filter values map to `local_edits`; `isDraft` keeps being written (`true` for autosaves) but has no UI meaning; the saving indicator lives in the editing toolbar only (the collapsed diff card has no live editor).

## Acceptance criteria

- [ ] Save button is gone from `EditableDescription`; toolbar shows Saving…/Saved indicator + Discard + Push to Jira
- [ ] Closing the editor (Esc/outside click/unmount) flushes pending changes; nothing is lost without an explicit Discard
- [x] `TicketEditState` no longer has `draft`; `computeTicketEditState` returns `local_edits` for any edit and `conflict` for any edit on a stale Jira base (including former drafts)
- [x] All `editState` UI surfaces show the single "Local edits" treatment; the amber "Unsaved changes" state is gone (board rows, status pill, side panel, filter bar, sprint insights, refinement lists, detail badge)
- [x] FilterBar draft/local-edits filter options are merged into one
- [ ] Description and title saves send `baseModifiedAt`; a 409 pauses autosave and shows the Reload/Overwrite banner on the detail page
- [ ] Token-tracking save logic is shared between `useStoryWriterDrafts` and the detail editors (one lib implementation)
- [ ] Refinement session view and board side panel inherit the new behavior via the shared component
- [ ] Tests cover: autosave flush on close, collapsed editState computation (incl. stale-base draft → conflict), 409 pause + reload/overwrite in the detail editor, merged filter option, badge rendering
- [ ] `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` pass

## Out of scope

- The Story Writer footer (done in BRDG-339)
- Epic writer push flow (separate surface; follow-up if wanted)
- Jira-side conflict handling on push (existing baseline system unchanged)

## Risks

- The collapsed conflict rule surfaces conflict badges on tickets that previously showed a quiet draft state — intended, but expect a few previously-hidden conflicts to light up after deploy.
- `isDraft` remains in the DB schema; removing the column is deliberately NOT part of this story (cheap to keep, risky to migrate now).
