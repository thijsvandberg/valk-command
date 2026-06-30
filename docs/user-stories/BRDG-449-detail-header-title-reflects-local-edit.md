# BRDG-449: Ticket detail header title reflects a local title edit instantly

**Status:** Done
**Priority:** Medium
**Type:** Bugfix

## Description
On the single ticket view, editing the title does not immediately show the new value where the PO expects it. The single ticket page shows the title in **two** places:

1. The **big editable heading** in the body (the `<h1>` you click to edit).
2. The **slim title in the top bar** (the `ViewHeader`), plus the **browser tab title**.

When you edit the title it is saved as a **local draft** (not pushed to Jira yet). The big heading updates instantly because it tracks what you typed. But the top-bar title and the browser tab read the **raw Jira title**, which never carries your local draft, so they keep showing the old title. The result is a visible mismatch right after an edit: the body heading shows the new title while the top bar (and browser tab) still show the old one.

The fix is display-only: make the top-bar header title and the browser tab title show the **effective** title (the local draft if one exists, otherwise the Jira title), updating in lockstep with the body heading. No change to how drafts are saved, pushed, diffed, or discarded.

## Current Behaviour
- The page renders the title in the slim header at `src/app/(app)/tickets/[key]/page.tsx:637-639` as `{ticket.title}` inside `ViewHeader`. `ticket.title` comes straight from `useTicketDetailPage` (`src/hooks/useTicketDetailPage.ts:27`, `apiData.title`).
- The detail payload's `title` is the **raw Jira title** and is never overlaid with the local edit: `ticketBase.title = t.title` at `src/lib/ticket-detail-builder.ts:145`. The local edit is exposed separately as `localEdits` at `ticket-detail-builder.ts:217` (`{ title: { value, isDraft, modifiedAt } }`). This separation is by design: the draft/diff/conflict/push machinery relies on raw-Jira `title` and `localEdits.title` being distinct (see Non-goals).
- The body heading is `EditableTitle` (`src/components/ticket-detail/EditableTitle.tsx`). It shows `displayValue = localValue ?? initialTitle` (line 58) and sets `localValue` to the typed draft **before** the network round-trip (line 123, the BRDG-340 / f0c68492 anti-flicker behaviour), so it updates instantly on save and re-seeds from `serverLocalEdit?.value` on mount (line 45). It is rendered twice by `TicketTabContent`: the content tab at line 305 and the epic children tab at line 411, both with `initialTitle={ticket.title}` and `serverLocalEdit={localEdits?.title}`.
- The live typed value already exists in `TicketTabContent` as `liveTitle` state (`src/components/ticket-detail/TicketTabContent.tsx:189`), set by its local `handleTitleLocalEdit` (lines 195-198). But that wrapper **drops the value** when forwarding to the page: it calls `onTitleLocalEdit(has)` (line 197), not `onTitleLocalEdit(has, value)`. So the value never reaches the page header.
- In the hook, `handleTitleLocalEdit` (`useTicketDetailPage.ts:175-178`) stores the value in `latestTitleEditRef` (a ref, used only by push at line 308) and toggles `hasLocalTitleEdit`. Because `TicketTabContent` drops the value, the ref is effectively `null` for plain draft edits. A ref does not trigger a re-render anyway, so even if it were set, the header would not update.
- The local-edits `PUT` invalidates the detail cache (`src/app/api/tickets/[key]/local-edits/route.ts:62`), so a post-save `mutateTicket()` does refetch fresh `localEdits` — but the header reads `ticket.title` (raw), so it still does not reflect the draft.

**Reproduced (dev, VPL-1337):** after editing the title via the heading, the `<h1>` shows the new title immediately while the top-bar span and `document.title` keep the old title. After a full page refresh the `<h1>` shows the draft again (re-seeded from `serverLocalEdit`), but the top-bar span and browser tab **still** show the old Jira title (they never overlay the local edit).

**Gap:** the live edited title is tracked in the editor but is not surfaced to the page, so the persistent header and the browser tab title never reflect a local title edit.

## Proposed Approach
Surface the editor's live title value up to the page and use an effective title for the header and tab. Display-only, in lockstep with the body heading.

1. **Forward the value in `TicketTabContent`.** Change the wrapper at `TicketTabContent.tsx:197` from `onTitleLocalEdit(has)` to `onTitleLocalEdit(has, value)`, and widen the `onTitleLocalEdit` prop type to `(has: boolean, value?: string | null) => void`. `TicketTabContent` already computes this value for its own `liveTitle`.
2. **Track the live value as state in the hook.** In `useTicketDetailPage`, add a `liveTitleValue` state set inside `handleTitleLocalEdit` (alongside the existing `latestTitleEditRef`, keeping push's behaviour). Reset it to `null` wherever a draft ends: `handleDiscardDraft` (lines 265-289), `handlePushToJira` success (lines 298-323), `handleConflictResolved` (lines 400-412), and `handleRestored` (lines 420-440). The setState happens in event callbacks, not in render or an effect, so it stays clear of the React Compiler rules ([[project_react_compiler_lint]]).
3. **Expose and use an effective title.** Compute `effectiveTitle = liveTitleValue ?? localEdits?.title?.value ?? ticket.title` (live draft first, then the persisted draft from the refetched payload, then raw Jira). Use it in the `ViewHeader` span at `page.tsx:638` instead of `ticket.title`. This is correct live (via `liveTitleValue`), after refresh (via `localEdits.title.value`), after push (cache patches `title` and clears `localEdits` at `useTicketDetailPage.ts:316`, and `liveTitleValue` resets), and after discard (`localEdits` cleared, `liveTitleValue` reset).
4. **Browser tab title.** The document title (`"VPL-XXX - {title} | Bridge"`) is server-rendered from the raw Jira title and so lags the same way. Update `document.title` from a client effect on the detail page keyed to `effectiveTitle` so the tab matches the header live and after refresh. (Confirm the existing metadata source during implementation; the client effect overrides it.)

**Non-goals / out of scope:**
- **Do not** overlay the local edit onto `title` server-side in `ticket-detail-builder.ts:145`. That would conflate raw-Jira `title` with the draft and break the diff/badge/conflict logic, which deliberately compares `titleInitial` (raw, `ticket.title`) against `titleLocalValue` (draft) in `EditableDescription` (`src/components/ticket-detail/EditableDescription.tsx:397,475`). `localEdits` stays a separate field (`ticket-detail-builder.ts:217`). The epic-children title overlay (`ticket-detail-builder.ts:233-317`) is a different surface and stays as-is.
- No change to draft save, autosave, push, discard, or conflict handling.
- The body `<h1>` (`EditableTitle`) already updates correctly and is unchanged.
- Other surfaces that show this ticket's title from the raw Jira value (board rows, side panel) are out of scope; they show the pushed Jira title by design.

## Implementation Plan
(From the Opus Plan run; order is 1 -> 2 -> 3, all land together.)

1. **`TicketTabContent.tsx` — forward the value (prerequisite).** Widen the `onTitleLocalEdit` prop type (line ~80) to `(has: boolean, value?: string | null) => void`. Change the wrapper at line 197 from `onTitleLocalEdit(has)` to `onTitleLocalEdit(has, value)`. `liveTitle`/`titleLocalValue` stay as-is (they still drive the EditableDescription badge + diff).
2. **`useTicketDetailPage.ts` — live-title state + `effectiveTitle`.** Add `liveTitleValue` state set inside `handleTitleLocalEdit` (keep `latestTitleEditRef` for push). Compute `effectiveTitle = liveTitleValue ?? localEdits?.title?.value ?? ticket?.title` (note `ticket?.title` — undefined during load). Reset `setLiveTitleValue(null)` in `handleDiscardDraft`, `handlePushToJira` success, `handleConflictResolved`, `handleRestored`. Export `effectiveTitle` (and `liveTitleValue`) in the return object.
3. **`page.tsx` — consume `effectiveTitle`.** Line 638: render `{h.effectiveTitle ?? ticket.title}` in the ViewHeader span. Line 122: pass `${key} - ${h.effectiveTitle ?? h.apiData.title}` to `usePageTitle` (keep the `h.apiData ?` gate).

**Edge cases (verified safe by the fallback chain):**
- `draftDiscardKey` remount of `EditableTitle`: `liveTitleValue` is reset in the same handlers that bump the key, so the remounted editor re-derives from `serverLocalEdit` and `effectiveTitle` falls through to the new `ticket.title`. The `liveTitleValue` must NOT survive the remount.
- Initial-load draft: the mount notify in `EditableTitle` fires `onLocalEdit(true, serverLocalEdit.value)` once -> sets `liveTitleValue`; even before that, `effectiveTitle` already falls back to `localEdits.title.value`. Double-covered.
- Revert-to-original (`draft === initialTitle`): `onLocalEdit(false)` -> `liveTitleValue = null` -> falls to `localEdits.title.value` (stale persisted draft until refetch) then `ticket.title`. Pre-existing behaviour shared with the "Local edits" badge; out of scope to also clear the server draft here.
- Failed persist / 409: `onLocalEdit(previous!==null, previous)` propagates so `effectiveTitle` reverts in lockstep with the heading.

**Test split (the page mock makes some assertions impossible in `page.test.tsx`):**
- `page.test.tsx`: header renders `effectiveTitle`. Add `effectiveTitle: baseTicket.title` to `resetHook` defaults so existing tests keep rendering the Jira title. `ViewHeader` is stubbed -> assert via `within(getByTestId("view-header")).getByText(...)`.
- `useTicketDetailPage.test.ts`: `effectiveTitle` computed from `localEdits`/live value, and reset to the Jira title on discard/push.
- `TicketTabContent.test.tsx`: `onTitleLocalEdit` is called with the forwarded value.
- Tab title: `usePageTitle` is mocked to `() => null` in `page.test.tsx`, so assert the passed string via a capturing spy on the mock if covered there.

## Acceptance Criteria
- [x] Editing the title on the single ticket view updates the **top-bar header title** immediately, in lockstep with the body heading (no mismatch window). <!-- page.tsx:638 uses effectiveTitle; value forwarded via TicketTabContent -> hook liveTitleValue -->
- [x] On page load/refresh of a ticket that has a local title draft, the top-bar header shows the draft title, not the old Jira title. <!-- effectiveTitle falls back to localEdits.title.value -->
- [x] The **browser tab title** reflects the effective title both live and after refresh. <!-- usePageTitle(page.tsx:122) fed effectiveTitle; usePageTitle already sets <title> + document.title -->
- [x] After **pushing** the title to Jira, the header shows the pushed title; after **discarding** the draft, the header reverts to the Jira title. <!-- liveTitleValue reset in push/discard/conflict/restore handlers + cache patch -->
- [x] No regression to the "Local edits" badge, the title diff view, conflict detection, or push for the title field. <!-- titleInitial (raw) vs titleLocalValue (draft) kept distinct; latestTitleEditRef preserved for push; full suite green -->

## Tests
- [x] The detail page header renders the effective title when a local title edit exists in the payload (`localEdits.title`). <!-- src/app/(app)/tickets/[key]/page.test.tsx: "renders the effective (local-edit) title in the header" -->
- [x] The header updates when the title editor reports a live edit (value forwarded from the editor), without waiting on a refetch. <!-- TicketTabContent.test.tsx: forwards value to onTitleLocalEdit; useTicketDetailPage.test.ts: effectiveTitle reflects live typed value -->
- [x] The header reverts to the Jira title after discard/push (liveTitleValue reset path). <!-- useTicketDetailPage.test.ts: clears the live title back to the Jira title on discard / on push -->

## Related
- [[project_local_edit_refresh_pattern]] — optimistic patch + `revalidate:false` + `draftDiscardKey` pattern this header consumes.
- [[project_draft_key_jira_guard]] — local drafts must not be conflated with Jira state; this fix keeps display separate from the data model.
- `docs/architecture/optimistic-updates.md` — title is a detail-only field, not on the board overlay; this is the detail-page equivalent.
- BRDG-340 — autosave-first detail editors and the shared concurrency saver (`local-edit-saver.ts`).
- Commit f0c68492 — "stop the title flicker on save"; set the body-heading baseline this story extends to the header.
- BRDG-338 — live ticket events on the open detail view (`handleLiveTicketEvent`), which must keep ignoring own-origin writes so the optimistic header is not clobbered.
