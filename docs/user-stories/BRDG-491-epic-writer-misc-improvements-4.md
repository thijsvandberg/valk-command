# BRDG-491: Epic Writer miscellaneous improvements (round 4)

**Status:** In progress
**Priority:** Medium

## Description

Follow-up polish on the [BRDG-490](completed/BRDG-490-epic-writer-misc-improvements-3.md) round, from PO feedback while using it. Three small, mostly independent items: a consistent send/stage model on the card AI-actions, a phase control that scales on small screens, and a `/clear` command affordance.

Related: [BRDG-489](completed/BRDG-489-clear-chat-story-and-epic-writer.md) (`/clear`), [BRDG-490](completed/BRDG-490-epic-writer-misc-improvements-3.md) (card actions, phase rail, related stories).

## Tasks

### 1. Consistent send/stage model on card AI-action buttons
The chat chips and the quick-actions popover follow one model: click the label/row = stage the prompt in the compose box; click the paper-plane arrow = send now. The card AI-action split buttons (BRDG-490 #8) did the opposite (primary = send, pencil = stage) and carried a Sparkles icon.
- [x] Remove the Sparkles (✦) icon from the Deepen/Improve buttons and the empty-board Generate breakdown button.
- [x] Flip to the shared model: primary label click = stage the prompt in the compose box; trailing paper-plane arrow = send now.

### 2. Phase control that scales (header)
The folded-in phase rail (BRDG-490 #4) renders all five steps inline; it is crude and does not scale on smaller screens.
- [x] Replace the inline 5-step row with a compact control: previous / next step buttons (icon only) with the current step's name between them, plus a small icon-only button that opens a popover listing all steps for direct jump.

### 3. `/clear` command affordance in the compose box
`/clear` (BRDG-489) is only recognised on submit; there is no hint while typing.
- [x] When the compose input starts with `/`, recognise it as a command: show an autocomplete hint (currently just `/clear`) above the input and style the typed command distinctly, so it reads as a command, not a message. Selecting the suggestion completes it; submitting runs it.

## Out of Scope
- The Find Related result format (correct as-is; the long accompanying prose trim is parked per PO).
- Re-architecting the writer beyond what each item needs.

## Acceptance Criteria
- [ ] Card AI-action buttons: no Sparkles icon; label = stage, arrow = send now, consistent with the chips/popover.
- [ ] The phase control fits a narrow header (prev/next + all-steps popover), no overflow.
- [ ] Typing `/` surfaces the `/clear` command with a distinct style; it still clears on submit.
- [ ] Shared-component changes do not regress the Story Writer; new/changed behaviour is covered by tests; `npm run test` and `npm run build` pass.
