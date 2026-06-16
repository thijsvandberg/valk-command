# BRDG-361: Constrain issue-table width on wide screens (centered max-width)

**Status:** Completed
**Priority:** Medium
**Type:** UI / Layout

## Resolved Decisions (PO, 2026-06-16)

- **Width cap:** ~1536px (the value of the old `max-w-screen-2xl`). Tailwind v4 removed the `max-w-screen-*` utilities, so this is implemented as `max-w-[1536px]` inside a shared constant.
- **Scope broadened beyond the table:** also cap the shared app chrome header (`ViewHeader`) so the bridge wordmark (left) and the action buttons (right) align with the content below, instead of hugging the viewport edges. Applied to the chrome + the list pages (Story inbox + Cleanup).
- **Reading views** (story-writer, activity-log, ticket-detail) keep their narrower reading caps (`max-w-4xl/5xl`).
- **Sprint Board** stays full width (intentionally dense).
- **Shared primitive:** a single exported `CONTENT_MAX` class constant, not a per-page magic number.

## Implementation Plan

1. **Shared constant** — create `src/lib/layout.ts` exporting `CONTENT_MAX = "mx-auto w-full max-w-[1536px]"`. Matches the `src/lib/*.ts` convention for shared constants; importable as `@/lib/layout`; trivially assertable in tests.
2. **ViewHeader** (`src/components/shared/ViewHeader.tsx`) — keep the outer bar + the four absolute glow/seam decorations full width. Remove `items-center justify-between` from the outer bar and move them onto a new inner wrapper carrying `CONTENT_MAX`, wrapping the existing left group (command capsule) and right group (notifications + actions). Result: glows span edge-to-edge, but logo/buttons sit within the cap and align with the table below. `px-5` stays as the gutter floor.
3. **Story inbox** (`src/app/(app)/new-stories/page.tsx`) — wrap the scroll-container children (skeleton/empty/table) in `CONTENT_MAX`; keep `px-8 py-5` on the scroll container as the gutter. Cap the sticky bulk bar's inner content too (bar background stays full width so its top border matches the table edges; sticky positioning untouched).
4. **Cleanup** (`src/app/(app)/cleanup/page.tsx`) — same as inbox for the scroll content + bulk bar; additionally cap the controls block's inner rows (keep `border-b px-8 py-3` full width as a seam).
5. **Tests** — assert `.max-w-[1536px]` (escaped selector) presence in `ViewHeader.test.tsx`, `new-stories/page.test.tsx`, `cleanup/page.test.tsx`, reusing existing render setups and the `container.querySelector` pattern already used in the cleanup suite.

**Risks handled:** sticky bulk bar keeps its `sticky bottom-0` on the full-width `BarContainer` (cap only the inner content, not the positioning context); side panel is a sibling of the capped column so it is unaffected; the cap goes on inner content, never directly on `overflow-y-auto` containers (avoids scrollbar gutter shift). Tailwind v4 has no `max-w-screen-2xl`, hence `max-w-[1536px]`.

## Description

The Story inbox (and the issue-table views generally) currently render **full width**. On wide monitors this stretches the table edge-to-edge, leaving rows uncomfortably long to scan — title, author, badges and dates drift far apart. The PO wants a **max width** so the content stops growing past a sensible point and **centers** on wide screens, picking a logical breakpoint rather than hugging the viewport.

## Current Behaviour

- Issue-table list pages use full-width content (`px-8 py-5`, no max width):
  - Story inbox `src/app/(app)/new-stories/page.tsx`
  - Cleanup `src/app/(app)/cleanup/page.tsx`
  - Sprint Board list (`TicketTable`) — full width inside the board chrome.
- Other views already use a **centered, capped container** pattern: `mx-auto max-w-5xl`/`max-w-6xl` with horizontal padding (e.g. `story-writer/page.tsx:112`, `activity-log/page.tsx:175`, `tickets/[key]/page.tsx`, `stakeholder/loading.tsx`). So the app has an established idiom to reuse.
- Tailwind v4 default breakpoints apply (sm 640 / md 768 / lg 1024 / xl 1280 / 2xl 1536). No custom content-width token exists in `globals.css @theme` yet.

## Proposed Approach

Wrap the issue-table list (header controls + table) in a **centered container with a max width**, reusing the existing `mx-auto max-w-* px-*` idiom so it matches the rest of the app.

- Because the issue table is wide (many columns: pill, title, epic, SP/BV, assignee, date, actions), the cap should be **wider than the `max-w-5xl` used for reading views**. Recommend roughly the 2xl range — e.g. a content cap around **1440–1600px** (`max-w-screen-2xl` ≈ 1536px, or a custom token `--content-max: 1600px`). Below the cap the layout is fluid; above it the table centers with comfortable gutters.
- Apply consistently to the **controls row, group headers, and rows** so they share the same left/right edges (don't cap only the table while the filter bar stays full width).
- Prefer a single shared layout primitive (a `max-w` token or a small wrapper) over a magic number repeated per page, so the inbox and any other list views stay aligned.

## Open Questions

- **Exact cap + breakpoint:** which max width reads best for the 7-ish-column table — `max-w-screen-2xl` (~1536px), a custom ~1440px, or ~1600px? Default: a custom content-max token around 1500px; tune visually. Confirm.
- **Scope:** apply to the **Story inbox only** (primary ask), or also to **Cleanup** and the **Sprint Board** for consistency? The board is intentionally dense and may want more width (or none capped). Default: apply to the inbox + cleanup; leave the Sprint Board full width unless the PO wants it capped too. Confirm.
- **Token vs. utility:** add a reusable `--content-max` theme token / wrapper component vs. a per-page `max-w-[...]`. Default: a small shared wrapper/token so all capped list views match.
- **Side panel interaction:** when the ticket side panel is open, should the centered list shift/narrow or keep its cap? Default: keep the cap; the panel overlays/sits beside as today.

## Acceptance Criteria

- [x] On wide screens the Story inbox content (controls + table + groups) stops growing past the chosen max width and centers with even gutters.
- [x] Below the breakpoint the layout stays fluid (no premature narrowing on laptop widths).
- [x] Controls, group headers, and rows share the same horizontal bounds (aligned edges).
- [x] The cap is implemented via a reusable token/wrapper, not a one-off magic number, so other capped list views can match.
- [x] No regression to the side panel, scrolling, or the existing capped reading views.

## Tests

- [x] Component/visual test: the inbox content container carries the max-width + centering classes (and stays fluid below the breakpoint).
- [x] (If a shared wrapper/token is introduced) a unit/snapshot check that consuming views apply it.

## Related

- [[BRDG-357-new-story-inbox-reuse-board-table]] — the inbox rebuild this constrains; coordinate so the cap wraps the reused board table.
- Existing capped views: `story-writer/page.tsx`, `activity-log/page.tsx`, `tickets/[key]/page.tsx` (precedent for `mx-auto max-w-*`).
