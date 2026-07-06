# BRDG-478: Epic Writer miscellaneous improvements

**Status:** Backlog
**Priority:** Medium

## Description

As the PO, I want a collection of smaller Epic Writer usability fixes so the epic authoring flow feels finished and gives clear feedback. This is a running catch-all bucket for **small, independent polish**; new items are appended as they come up. Anything that is real layout/interaction design work is split into its own story to keep this bucket bounded.

Split out of this bucket:
- [BRDG-479](BRDG-479-epic-writer-advance-to-breakdown.md) - advancing to the breakdown (DONE).
- [BRDG-484](BRDG-484-epic-writer-layout-navigation.md) - resizable breakdown sidebar + clearer phase/step navigation.

Related epic: [BRDG-291](BRDG-291-epic-writer.md).

## Tasks

### 1. Carry the creation description into the Epic Writer

When creating a new epic (`CreateEpicModal.tsx`) you can enter a description, but once you open the Epic Writer that text is nowhere to be seen. The writer session starts effectively blank, so the context the PO just typed is lost.

- [ ] Seed the Epic Writer draft/feed with the description entered at creation, so it is visible (and editable) on first open

### 2. "Save draft" and "Push to Jira" give no feedback

In `EpicWriterLayout.tsx` both header buttons call `writer.saveDraft()` / `writer.pushToJira()` fire-and-forget, with no toast, no saved/pushed state, and no error surface. The actions actually work (verified: Save draft issues `PATCH .../story-writer` + `PUT .../local-edits`, all 200; Push to Jira confirmed by the PO landing in Jira), but from the PO's side they appear to do nothing.

- [ ] Add visible feedback for Save draft (saved state / toast) and Push to Jira (success + conflict/error toast), matching how the single-story Story Writer reports these
- [ ] Handle the "nothing to save/push" case with a clear message instead of a silent no-op

### 3. Empty AI response bubble + related-stories not surfaced

The chat sometimes shows a completely empty assistant bubble. Cause: the assistant returns a message whose entire content is an `<html-report>...</html-report>` block (the related-stories research step, ~11KB). `ChatMessageParts.tsx` strips `<html-report>` blocks from the display (line ~351), and when that is the only content the bubble renders empty. On top of that, the Epic Writer has **no panel that surfaces related stories at all**, so the research is generated and then silently dropped.

- [ ] Do not render an assistant bubble that is empty after structured blocks are stripped
- [ ] Decide whether the Epic Writer should run a related-stories search at all; if yes, surface it somewhere; if no, stop the epic skill from emitting it

Observed on epic `VPL-47279` (`/epics/VPL-47279/write`).

### 4. Header epic key should use the standard issue pill

In `EpicWriterLayout.tsx` the epic key (`VPL-47279`) is rendered as plain mono text. It should use the standard issue pill component used elsewhere in the app for consistency.

- [ ] Replace the plain-text epic key in the Epic Writer header with the shared issue-pill component

### 5. Strip Epic Writer tags from the chat display

A breakdown reply shows the raw `<epic-breakdown>[{...}]</epic-breakdown>` JSON block in the chat bubble (the board parses it fine, but in the chat it looks broken). `ChatMessageParts.tsx` strips `<story-draft>`, `<html-report>`, etc. (lines ~348-354) but not the Epic Writer tags.

- [ ] Strip `<epic-breakdown>`, `<epic-questions>`, `<story-detail>`, `<sprint-plan>` from the displayed message so only the AI's commentary shows in the chat (display-only; `apply-output` still parses the raw output for the board)

> The phase-rail / "how do I advance the flow" and the resizable-sidebar asks moved to [BRDG-484](BRDG-484-epic-writer-layout-navigation.md).

## Out of Scope

- Rebuilding the Epic Writer layout or chat plumbing
- The breakdown/detail/sprint feature work already tracked under BRDG-293..296

## Acceptance Criteria

- [ ] Each task above is either implemented or explicitly split into its own story
- [ ] New/changed behaviour is covered by tests
- [ ] All existing tests pass with `npm run test` and `npm run build`
