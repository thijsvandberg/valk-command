# BRDG-327: Double-click a ticket pill to copy title + URL

**Status:** To Do
**Priority:** Medium

## Description

As a PO, I want to double-click a ticket pill to instantly copy its title and Jira URL to my
clipboard, so I can paste a shareable reference into Slack, a comment, or a doc without opening the
"key" dropdown and picking "Copy with title" each time.

A subtle, in-place confirmation should tell me the copy succeeded so I know it worked without a
loud, screen-corner toast.

## Acceptance Criteria

- [ ] Double-clicking anywhere on a `TicketStatusPill` (elevated chip and `list` variant) copies
      the share text to the clipboard
- [ ] The copied text uses the existing `formatTicketShare(title, key)` format (`Title - URL`),
      so the behaviour matches the dropdown's "Copy with title" action
- [ ] When the title is not yet available (e.g. a reference pill still resolving its detail fetch),
      the double-click falls back to copying just the Jira URL rather than an empty/partial string
- [ ] A subtle, in-place confirmation appears on the pill itself (not the global corner toast),
      e.g. a brief "Copied" state / check that fades after ~1.2s
- [ ] The single-click behaviour on the key segment (opening the `KeyDropdown`) is preserved: a
      double-click must NOT leave the dropdown open or flicker it
- [ ] Pending/optimistic rows (`pending-` key, no real Jira key yet) do not copy and show no
      confirmation
- [ ] Tests for: copy on double-click writes the expected share text; title-missing fallback copies
      the URL only; double-click does not open the key dropdown; pending keys are ignored

## Technical Notes

- Reuse `formatTicketShare` / `getJiraUrl` (`src/lib/ticket-share.ts`, `src/lib/jira-url.ts`) and
  `navigator.clipboard.writeText`, mirroring `KeyDropdown.copyToClipboard` in
  `src/components/shared/TicketStatusPill.tsx`.
- Attach `onDoubleClick` to the pill wrapper (`wrapperRef` div) so the whole chip is the target, not
  just the key segment.
- Single vs double click conflict: the key `<a>` `onClick` currently toggles the dropdown on a plain
  click. Guard against the dropdown opening on a double-click, e.g. ignore clicks where
  `e.detail > 1`, or defer the dropdown toggle briefly and cancel it when a `dblclick` follows.
- Keep the confirmation local and quiet per the "subtle" requirement: an inline transient state on
  the pill (managed with a short `setTimeout`, cleared on unmount) rather than the shared
  `Toast`/`useToast` corner notification.
- Clipboard writes need a secure context and a user gesture; fail silently (no error toast) when the
  write rejects, consistent with the existing dropdown copy handler.

## Out of Scope

- Changing the existing key dropdown actions ("Open in Jira", "Copy Jira URL", "Copy with title").
- Multi-select / bulk copy of several pills at once.
