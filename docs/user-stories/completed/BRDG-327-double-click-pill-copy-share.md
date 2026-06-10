# BRDG-327: Double-click a ticket pill to copy title + URL

**Status:** Done
**Priority:** Medium

## Description

As a PO, I want to double-click a ticket pill to instantly copy its title and Jira URL to my
clipboard, so I can paste a shareable reference into Slack, a comment, or a doc without opening the
"key" dropdown and picking "Copy with title" each time.

A subtle, in-place confirmation should tell me the copy succeeded so I know it worked without a
loud, screen-corner toast.

## Implementation Plan

All work is confined to `src/components/shared/TicketStatusPill.tsx` and its test file. No new files;
`formatTicketShare`/`getJiraUrl` are already imported.

1. **Transient "copied" state + timer (AC4):** Add `copyConfirmed` state and a `copyTimerRef` near the
   other hover/timer state. Extend the existing unmount cleanup `useEffect` to clear `copyTimerRef`,
   mirroring the `KeyDropdown` timer-cleanup pattern.
2. **Double-click copy handler (AC1, AC2, AC3, AC6):** Add `handlePillDoubleClick`. Early-return when
   `isPending` (AC6). Build text as `title ? formatTicketShare(title, ticketKey) : jiraUrl` (AC3). Copy
   via `navigator.clipboard.writeText` in try/catch, fail silently. On success set `copyConfirmed`,
   clear/restart the 1.2s timer (AC4). Declare after `isPending`/`jiraUrl` are in scope.
3. **Wire `onDoubleClick` to the wrapper (AC1):** Attach to the `wrapperRef` div (covers both elevated
   and `list` variants since both render through it), after `{...hoverProps}`.
4. **Guard the key `<a>` single-click (AC5):** In the key link `onClick`, when `e.detail > 1`
   `e.preventDefault()` and `setKeyDropdownOpen(false)` then return, so a double-click never leaves the
   dropdown open or flickers it.
5. **In-place confirmation (AC4):** Render a subtle, absolutely-positioned "Copied" badge driven by
   `copyConfirmed` inside the wrapper (local/quiet, no global Toast). Accessible label for tests/SR.
6. **Tests (AC7):** Stub `navigator.clipboard.writeText`. Cover: double-click writes the share text;
   title-missing fallback copies URL only; double-click does not open the key dropdown; pending keys
   are ignored (no copy, no confirmation); confirmation appears and fades after 1.2s.

## Acceptance Criteria

- [x] Double-clicking anywhere on a `TicketStatusPill` (elevated chip and `list` variant) copies
      the share text to the clipboard
- [x] The copied text uses the existing `formatTicketShare(title, key)` format (`Title - URL`),
      so the behaviour matches the dropdown's "Copy with title" action
- [x] When the title is not yet available (e.g. a reference pill still resolving its detail fetch),
      the double-click falls back to copying just the Jira URL rather than an empty/partial string
- [x] A subtle, in-place confirmation appears on the pill itself (not the global corner toast),
      e.g. a brief "Copied" state / check that fades after ~1.2s
- [x] The single-click behaviour on the key segment (opening the `KeyDropdown`) is preserved: a
      double-click must NOT leave the dropdown open or flicker it
- [x] Pending/optimistic rows (`pending-` key, no real Jira key yet) do not copy and show no
      confirmation
- [x] Tests for: copy on double-click writes the expected share text; title-missing fallback copies
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
