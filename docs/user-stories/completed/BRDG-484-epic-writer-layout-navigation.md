# BRDG-484: Epic Writer layout, navigation & content views

**Status:** Done
**Priority:** Medium

## Status

All three parts shipped on `dev` and verified live on `VPL-47279`.

- **#1 Content view (draft):** the right region has a `Breakdown | Draft` toggle. `Draft` reuses the Story Writer's own `StoryPreviewApp` (via real `PaneProvider` + `WriterProvider`, adapted from the epic-mode `useStoryWriter` by `useEpicWriterContext`) to render the saved epic draft - not a bespoke lookalike. No shared pane internals were changed, so the single-story Story Writer's pane behaviour is untouched. Diff was considered but not exposed: `DiffApp` needs the full version/edit-write machinery; the draft preview is the core "see the worked-out epic" ask. Verified live (draft renders with linkified ticket-ref pills).
- **#2 Resizable + independent scroll:** the height-unbounded `grid` is replaced with a bounded flex split (`useHorizontalSplit`, persisted to `localStorage` under `ew:{key}:split`, clamped 25-75%). Each column is a bounded flex child so its own `overflow-y-auto` scrolls, not the page. Verified live: dragging the divider rebalances + persists ("43"), and the page itself no longer scrolls (`scrollHeight === clientHeight`) while each column scrolls internally.
- **#3 Coherent progression model:** the three affordances now have distinct, non-overlapping roles - **header** = global doc actions (Save draft / Push to Jira), **phase rail** = free bookmarks that now have a visible effect (selecting a phase focuses the right region on that phase's artifact: the draft in the early phases, the breakdown board while decomposing), **contextual next-action** = the compact empty-board CTA / per-card actions. **Decision:** continued BRDG-479's *free bookmarks + contextual next-action* model rather than a gated wizard (a wizard would contradict the established free-movement design). The empty-board CTA is now a compact top-aligned prompt instead of a hero that filled the sidebar. If the PO instead wants a guided step-flow, that is a follow-up direction change.

`npm run lint`, `npm run typecheck`, `npx vitest run` (7897 pass) and `npm run build` all green.

## Description

As the PO, I want the Epic Writer to be as flexible and legible as the Story Writer: I want to resize the panels, view (and edit) the epic's own saved draft without leaving the writer, and understand how to move from one phase/step to the next. Today the Epic Writer is a simpler, fixed layout (chat + breakdown board) and the way to advance is not obvious.

This is the layout/interaction/content-view work split out of the small-polish bucket [BRDG-478](BRDG-478-epic-writer-misc-improvements.md) so that bucket stays small. The breakdown flow itself now works ([BRDG-479](BRDG-479-epic-writer-advance-to-breakdown.md)).

Related epic: [BRDG-291](BRDG-291-epic-writer.md).

## Tasks

### 1. View the saved epic draft (and other content views) inside the Epic Writer

From the Epic Writer the PO wants to see the epic's own worked-out draft (the description saved earlier), not just the chat and the breakdown board. The Story Writer already has a mature multi-"app"/pane system for this (`src/components/story-writer/panes/` - `WriterContext`, `apps/DraftPreviewApp`, diff, fullscreen). The Epic Writer (`EpicWriterLayout.tsx`) does not reuse it.

- [x] Give the Epic Writer a way to open the saved epic draft as a content view (reuse the Story Writer pane/app pattern rather than a bespoke panel)
- [x] Consider which Story Writer apps make sense for an epic (draft preview, diff) and expose those

### 2. Resizable panels + independent scrolling

The breakdown sidebar is a fixed width; the PO wants to make it wider/narrower. Also, once the board is populated the two panes scroll together (scrolling the chat scrolls the breakdown out of view) - they must scroll independently. Root cause is in `EpicWriterLayout.tsx`: the grid columns are plain block divs, so the inner `overflow-y-auto` of the chat / breakdown board is not height-bounded and the page scrolls instead.

- [x] Make the chat / breakdown split resizable (drag handle), persisted like other layout prefs
- [x] Chat and breakdown board scroll independently (bound each column's height so its own `overflow-y-auto` scrolls, not the page)

### 3. Clearer phase/step navigation

Movement between phases is confusing: there is a phase rail at the top, a "Generate breakdown" CTA that also lives in the sidebar and takes a lot of space, and action buttons in the header. As a user it is unclear how to progress. (Raised again after BRDG-479 shipped the CTA.)

- [x] Reconcile the phase rail, the sidebar CTA, and the header actions into one coherent progression model (decide: guided step flow vs. free bookmarks + contextual next-action)
- [x] Reduce the footprint of the empty-board CTA once its job is understood (it should not dominate the sidebar)

## Out of Scope

- Small polish in [BRDG-478](BRDG-478-epic-writer-misc-improvements.md) (chat tag stripping, issue pill, save/push feedback, creation description, empty bubble)
- The breakdown dispatch fix in [BRDG-479](BRDG-479-epic-writer-advance-to-breakdown.md) (done)

## Acceptance Criteria

- [x] The PO can view the saved epic draft from within the Epic Writer
- [x] The chat / breakdown split is resizable and the choice persists
- [x] Phase/step progression is understandable without guessing (one coherent model, not three competing affordances)
- [x] New/changed behaviour is covered by tests; `npm run test` and `npm run build` pass
