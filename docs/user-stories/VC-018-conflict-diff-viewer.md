# VC-018: Conflict Diff Viewer and Resolution

**Status:** Ready
**Priority:** High
**Depends on:** VC-017 (Stale Detection Rework)

## Description

The conflict state from VC-017 shows a warning but lacks proper tooling to resolve it. The diff viewer currently shows version history (Jira sync snapshots), but does not compare local edits against the latest Jira version. Users need to see exactly what changed and choose how to resolve.

## Acceptance Criteria

- [ ] Diff viewer shows local edits vs latest Jira version (side-by-side or inline)
- [ ] User can choose: "Keep local" (re-base edit on new version) or "Discard local" (delete local edits, show mirror)
