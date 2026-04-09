# BRDG-018: Conflict Diff Viewer and Resolution

**Status:** Done
**Priority:** High
**Depends on:** BRDG-017 (Stale Detection Rework)

## Description

The conflict state from BRDG-017 shows a warning but lacks proper tooling to resolve it. The diff viewer currently shows version history (Jira sync snapshots), but does not compare local edits against the latest Jira version. Users need to see exactly what changed and choose how to resolve.

The current diff implementation had several structural problems that made it unreliable for real conflict resolution:

1. **Broken block alignment**: `diffBlocks()` paired blocks by index position. If a paragraph was inserted or removed in the middle, all subsequent blocks became misaligned, producing garbled output.
2. **Character-level diff on misaligned blocks**: `fast-diff` does character-level diffing. Combined with problem 1, this produced unreadable mixed strikethrough/insert noise when comparing rewritten descriptions.
3. **Unified view interleaved deletions and insertions inline**: For larger rewrites this was unreadable. GitHub-style (deleted lines first, then added lines) is far clearer.
4. **Split view had no scroll sync or row alignment**: Left and right columns drifted apart.
5. **Double computation**: `SideBySideDiff` called `computeDiff()` twice per block pair (once per column).

## Constraints

- Diff viewer only works in **full-page detail mode**, not in the sidebar. The sidebar does not have enough space for a useful comparison.

## Acceptance Criteria

### Conflict resolution (primary goal)

- [x] Conflict banner in ticket detail is clickable and opens the diff view directly (local edits vs latest Jira version)
- [x] Diff view clearly labels sides: "Your local edits" vs "Latest from Jira"
- [x] Resolution buttons: "Keep local" (rebase edit onto new Jira version) and "Discard local" (delete local edits, accept Jira version)
- [x] After resolution, conflict banner disappears and ticket reflects the chosen state

### Push protection

- [x] When a conflict exists (remote changes detected), "Push to Jira" button is disabled by default
- [x] A confirmation checkbox ("I have reviewed the diff and want to overwrite remote changes") is required to enable the push button during a conflict
- [x] Without the checkbox, the button shows a disabled state with a tooltip explaining why

### Version compare UX fixes

- [x] Changing the compare dropdowns immediately re-diffs (no "View comparison" button needed). Currently the diff is stuck when `selectedVersion` is set because the dropdowns and the version-list click are two separate code paths that conflict.
- [x] Remove the "View comparison" button; dropdown changes apply instantly
- [x] Selecting a version from the list updates the dropdowns to match (keep them in sync)

### Diff algorithm improvements

- [x] Replace index-based block pairing with LCS/similarity-based alignment so inserted/removed blocks do not misalign subsequent pairs
- [x] Two-pass diffing: line-level diff first, then word-level highlights within changed lines
- [x] Unified mode shows deleted lines as a block above added lines (GitHub-style) instead of inline interleaving

### Diff UI improvements

- [x] Change summary bar: "+N added, -N removed, ~N modified" blocks
- [x] Split view: synchronized scroll between left and right columns
- [x] Split view: equal-height row alignment so corresponding blocks stay side-by-side
- [x] Cache `computeDiff()` result per block pair (avoid double computation in split mode)

### Visual clarity

- [x] Stronger color contrast for additions/deletions (current `rgba` at 0.15 opacity is too subtle)
- [x] Add +/- gutter markers per line (like GitHub)
- [x] Collapse unchanged context blocks with "Show N unchanged lines" expander
- [x] Visual separator between changed blocks so they don't blend together
- [x] Line-number gutter on both sides in split view
