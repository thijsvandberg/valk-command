# BRDG-484: Epic Writer layout, navigation & content views

**Status:** Backlog
**Priority:** Medium

## Description

As the PO, I want the Epic Writer to be as flexible and legible as the Story Writer: I want to resize the panels, view (and edit) the epic's own saved draft without leaving the writer, and understand how to move from one phase/step to the next. Today the Epic Writer is a simpler, fixed layout (chat + breakdown board) and the way to advance is not obvious.

This is the layout/interaction/content-view work split out of the small-polish bucket [BRDG-478](BRDG-478-epic-writer-misc-improvements.md) so that bucket stays small. The breakdown flow itself now works ([BRDG-479](BRDG-479-epic-writer-advance-to-breakdown.md)).

Related epic: [BRDG-291](BRDG-291-epic-writer.md).

## Tasks

### 1. View the saved epic draft (and other content views) inside the Epic Writer

From the Epic Writer the PO wants to see the epic's own worked-out draft (the description saved earlier), not just the chat and the breakdown board. The Story Writer already has a mature multi-"app"/pane system for this (`src/components/story-writer/panes/` - `WriterContext`, `apps/DraftPreviewApp`, diff, fullscreen). The Epic Writer (`EpicWriterLayout.tsx`) does not reuse it.

- [ ] Give the Epic Writer a way to open the saved epic draft as a content view (reuse the Story Writer pane/app pattern rather than a bespoke panel)
- [ ] Consider which Story Writer apps make sense for an epic (draft preview, diff) and expose those

### 2. Resizable panels + independent scrolling

The breakdown sidebar is a fixed width; the PO wants to make it wider/narrower. Also, once the board is populated the two panes scroll together (scrolling the chat scrolls the breakdown out of view) - they must scroll independently. Root cause is in `EpicWriterLayout.tsx`: the grid columns are plain block divs, so the inner `overflow-y-auto` of the chat / breakdown board is not height-bounded and the page scrolls instead.

- [ ] Make the chat / breakdown split resizable (drag handle), persisted like other layout prefs
- [ ] Chat and breakdown board scroll independently (bound each column's height so its own `overflow-y-auto` scrolls, not the page)

### 3. Clearer phase/step navigation

Movement between phases is confusing: there is a phase rail at the top, a "Generate breakdown" CTA that also lives in the sidebar and takes a lot of space, and action buttons in the header. As a user it is unclear how to progress. (Raised again after BRDG-479 shipped the CTA.)

- [ ] Reconcile the phase rail, the sidebar CTA, and the header actions into one coherent progression model (decide: guided step flow vs. free bookmarks + contextual next-action)
- [ ] Reduce the footprint of the empty-board CTA once its job is understood (it should not dominate the sidebar)

## Out of Scope

- Small polish in [BRDG-478](BRDG-478-epic-writer-misc-improvements.md) (chat tag stripping, issue pill, save/push feedback, creation description, empty bubble)
- The breakdown dispatch fix in [BRDG-479](BRDG-479-epic-writer-advance-to-breakdown.md) (done)

## Acceptance Criteria

- [ ] The PO can view the saved epic draft from within the Epic Writer
- [ ] The chat / breakdown split is resizable and the choice persists
- [ ] Phase/step progression is understandable without guessing (one coherent model, not three competing affordances)
- [ ] New/changed behaviour is covered by tests; `npm run test` and `npm run build` pass
