# BRDG-326: Epic single view — Child issues and Content in separate tabs

**Status:** Not Started
**Priority:** Medium

## Description

As a Product Owner, when I open an epic in the single view, I want the child issues and the epic content (title, description, attachments) split into separate tabs, with **Child issues as the leading (default) tab**, so I land directly on the epic's breakdown instead of scrolling past the description every time.

Today the epic single view stacks everything in one **Content** tab: title, description, attachments, and then the `EpicChildrenSection` (child issues) below. For epics, the child list is the primary thing I work with, so it should be the first tab I see.

## Current behaviour

- Tabs rendered for a ticket: `Content`, `History`, `Review`, `Development` (see `TicketTabContent.tsx`).
- For epics, the `Content` tab renders, in order: `EditableTitle`, `EditableDescription`, `AttachmentsSection`, then `EpicChildrenSection` (with `showStatsSummary`), then meta + comments.
- This is identical structure to non-epic tickets, which keep their existing single Content tab.

## Implementation Plan

1. **`TicketTabContent.tsx`** — add `"children"` to the `TicketTab` union; compute `isEpic = ticket.type === "epic"`.
2. **Tab bar** — prepend a `Child issues` tab as the FIRST entry, gated on `isEpic`, with `badge: detail?.epicChildren.length || undefined` (hides the pill at 0 / while loading, mirroring `reviewCount`).
3. **Children tab body** — move `EpicChildrenSection` (with `showStatsSummary`, composer, stats) out of the Content block into a dedicated `activeTab === "children" && isEpic && detail` block.
4. **Content tab body** — keep `EditableTitle`, flagged banner, `EditableDescription`, `AttachmentsSection`, `metaContent`, `CommentsSection` under Content for all types. Render `SubtasksSection` + `LinkedIssuesSection` only when `!isEpic` (epics no longer render these in Content). Comments/meta stay under Content per AC wording.
5. **Default tab in both hosts** — one consistent approach: an effect + `defaultedKeyRef` keyed on ticket key. Fires once per ticket key (does not clobber user navigation within a ticket; re-defaults on ticket swap). Epics → `"children"`, others → `"content"`.
   - `src/app/(app)/tickets/[key]/page.tsx` (async ticket via `h.ticket`).
   - `src/components/sprint-board/SidePanel.tsx` (ticket `t` prop; covers non-keyed MultiSprintView reuse).
6. **Tests** — update epic-path tests in `TicketTabContent.test.tsx`, `SidePanel.test.tsx`, `page.test.tsx` (children now on the default Children tab, not Content); add: leading Child issues tab + count badge, no Children tab for non-epics, default-tab resolution per host, tab swap re-default.

### Decisions / risks
- Flagged banner, Jira comments, and PO meta stay under **Content** (AC: "where they currently live").
- Non-epic output is unchanged (Children tab + body gated on `isEpic`).
- MultiSprintView reuses one non-keyed SidePanel instance — the per-key ref-guard in the effect is what makes the default correct on swap.

## Acceptance Criteria

- [x] For tickets of type `epic`, the single view shows a dedicated **Child issues** tab and a separate **Content** tab.
- [x] **Child issues** is the leading tab: it appears first in the tab bar and is the default active tab when an epic is opened.
- [x] The **Child issues** tab contains the epic's child-issue list (`EpicChildrenSection`, including the stats summary and the child-issue composer).
- [x] The **Content** tab contains the epic title, description, and attachments (and meta/comments where they currently live).
- [x] The **Child issues** tab shows a count badge of the number of child issues.
- [x] Non-epic tickets are unchanged: they keep their existing single `Content` tab (no Child issues tab appears).
- [x] `History`, `Review`, and `Development` tabs remain available and behave as before for epics.
- [x] Deep-linking / default tab logic: opening an epic defaults to Child issues; the active tab state is handled consistently with the existing `activeTab` / `onActiveTabChange` flow.

## Technical Notes

- Primary file: `src/components/ticket-detail/TicketTabContent.tsx`.
  - The `TicketTab` union type (`"content" | "history" | "review" | "development"`) needs a new value for the child-issues tab (e.g. `"children"`).
  - Tab bar is built in the `([...]).map(...)` block (~line 172). Conditionally insert the **Child issues** tab (first) only when `ticket.type === "epic"`.
  - Move the epic-only `EpicChildrenSection` render (currently ~line 329-330) out of the Content tab and into the new Child issues tab; the description/attachments stay in Content.
  - Default active tab is decided by the host that owns `activeTab` state — check callers of `TicketTabContent` (side panel + full page) so epics open on Child issues.
- Keep non-epic branch (`SubtasksSection` + `LinkedIssuesSection`) inside the Content tab exactly as-is.
- Reuse the existing `Tab` component badge prop for the child count.
- Verify both render hosts: the merged side-panel header bar (`renderTabBar={false}` path) and the in-component tab bar.

## Out of Scope

- No changes to non-epic ticket layouts.
- No redesign of the child-issue rows, composer, or stats summary themselves.

## Dependencies

- Existing components: `EpicChildrenSection`, `EditableDescription`, `AttachmentsSection`, `TabBar`/`Tab`.

## Testing

- Co-locate tests next to `TicketTabContent.tsx`.
- Cover: epic opens with Child issues active by default; Child issues tab renders `EpicChildrenSection`; Content tab renders description/attachments; child count badge reflects item count; non-epic ticket shows no Child issues tab and renders unchanged.
