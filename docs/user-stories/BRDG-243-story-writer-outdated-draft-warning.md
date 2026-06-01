# BRDG-243: Outdated-draft warning in the Story Writer

**Status:** Not Started
**Priority:** Medium
**Type:** Bugfix / UX

## Description

As a PO, when the Jira version of a ticket has changed after I started a Story Writer draft (for example because I edited and pushed the same ticket from the single story view in another tab), I want a clear warning inside the Story Writer editor, so that I do not keep editing a stale draft without realising the underlying Jira content has moved on.

Today the staleness signal already exists, but only in the **History** panel: `TicketHistory.tsx` computes `isDraftOutdated` by comparing the local draft date against the current Jira version date, and `VersionList.tsx` renders an amber "Outdated" tag. The editor pane itself shows no warning. On load/refresh the Story Writer GET route (`src/app/api/tickets/[key]/story-writer/route.ts`) simply returns the stored `localDraft` and never compares the draft's baseline against the current Jira version, so the PO silently sees the old draft.

This was hit in practice: a Story Writer draft was open, the same ticket was edited and pushed to Jira from the single story view, and on returning to the Story Writer the old draft was shown with no indication it was outdated.

## Goal

Surface the existing outdated/diverged signal **where the PO works** (the Story Writer editor), with a clear way to inspect the difference and to take the current Jira version.

## Requirements

### 1. Detect outdated drafts on the server

- In `GET /api/tickets/[key]/story-writer`, compute an `outdated` flag and include it on the session payload.
- A draft is **outdated** when the draft's baseline version differs from the current latest Jira version for the ticket (`storyVersion.contentHash` of the most recent version).
- Baseline source: the session's `baseVersionHash`. If `baseVersionHash` is `null` (older sessions with no recorded baseline), do **not** flag as outdated, to avoid false positives. This mirrors the null-guard already used in `pushToJira` conflict detection.
- For split mode, compute the same flag for the target ticket and include it (e.g. `targetOutdated`).
- Return enough context for the UI to act: at minimum the flag; optionally the latest Jira version's date so the banner can show "changed at HH:MM".

### 2. Keep the baseline correct after a push

- After a successful push to Jira from within the Story Writer, rebase the session's `baseVersionHash` to the new latest version hash (or otherwise ensure the just-pushed draft is not immediately flagged as outdated).
- Verify the interaction with `rebaseLocalEdits` / `pushToJira` in `ticket-service.ts` so the inline-edit baseline and the session baseline stay consistent.

### 3. Show the warning in the editor

- Add a banner at the top of the editor pane (`src/components/story-writer/panes/apps/EditorApp.tsx`, and the split target pane `SplitTargetApp.tsx`) when the draft is outdated.
- Amber styling, consistent with the existing "Outdated" tag in `VersionList.tsx`. Copy (English): "Jira changed after this draft started. Your draft may be based on an older version."
- Two actions:
  - **View difference** opens the existing Diff view (`DiffApp.tsx` / `DiffPane.tsx`) comparing the current draft against the latest Jira version.
  - **Take Jira version** replaces the editor content (and title) with the current Jira description/title and rebases the baseline so the warning clears. Reuse the existing "accept Jira version" path (see BRDG-159) rather than building a new one.
- The banner stays visible until the conflict is resolved (diff reviewed and either Jira version taken, or the draft pushed). It is not a transient toast.

### 4. Wire the flag through the client

- Surface the flag from `useStoryWriter` (the `refreshSession` result already carries the session payload) so the editor pane can render the banner.
- Ensure the flag is re-evaluated on session refresh (return to tab, after push, after accepting a draft).

## Out of scope

- The larger refactor to a single source of truth for draft content (merging `storyWriterSession.localDraft` into `ticketLocalEdit`). Considered and deferred; this story is the targeted, lower-risk fix.
- Save-failure visibility in the Story Writer auto-save (the `catch { /* ignore */ }` paths in `useStoryWriterDrafts.ts`). Noted as a separate potential follow-up; not required here.
- Any change to the History panel's existing outdated detection (it stays as-is; this story reuses the same concept in the editor).
- Cross-view indicators in the single story view (option B). Not needed for this fix.

## Technical notes

- Outdated detection concept already lives in `src/components/ticket-detail/TicketHistory.tsx` (`isDraftOutdated`) and the conflict logic in `src/services/ticket-service.ts` (`pushToJira`, `computeTicketEditState` in `src/lib/ticket-state.ts`). Reuse these semantics; do not invent a third comparison rule.
- The Story Writer already persists draft content to `ticketLocalEdit` on auto-save (`useStoryWriterDrafts.ts:67`, `:100`), so the inline baseline (`ticketLocalEdit.baseJiraVersion`) is available as a cross-check if `baseVersionHash` proves unreliable.
- Relevant prior work for patterns: BRDG-017 (stale-detection-rework), BRDG-018 (conflict-diff-viewer), BRDG-159 (accept-jira-version), BRDG-193 (false-conflict-after-metadata-push), BRDG-213 (refinement-conflict-visibility).
- Editor pane: `src/components/story-writer/panes/apps/EditorApp.tsx`; diff: `DiffApp.tsx` / `DiffPane.tsx`.

## Implementation Plan

Order: server detection -> push rebase -> client wiring -> UI -> tests -> docs.

### Phase A - Server (detection + rebase)

1. **GET outdated detection** (`src/app/api/tickets/[key]/story-writer/route.ts`): after `resolvedSession` is finalized, fetch the latest `storyVersion` for the key and compute `outdated = baseVersionHash != null && latest?.contentHash != null && latest.contentHash !== baseVersionHash` (mirrors `pushToJira` conflict semantics). Return `outdated` and `targetOutdated` as top-level payload fields (not inside `session`, which is a DB row). For split, derive `targetOutdated` from the target ticket's `ticketLocalEdit` description `baseJiraVersion` vs the target's latest `storyVersion.contentHash` (comparable: `upsertLocalEdit` sets `baseJiraVersion = latestVersion.contentHash`). No migration needed. Include in both the `draftsOnly` and full return branches.
2. **Push-time rebase** (`src/services/ticket-service.ts` `pushToJira`): after a successful push, when `newContentHash` is known, update any active `storyWriterSession` for that key to set `baseVersionHash = newContentHash`. This is server-side so it is atomic with the push regardless of which client triggered it, and prevents a false `outdated` after push. The target's `ticketLocalEdit` baseline is rebased through the existing delete/rewrite path on its own push.
3. **PATCH rebaseBaseline flag** (`route.ts`): add `rebaseBaseline: z.boolean().optional()` to `patchSessionSchema`; when true, set `baseVersionHash` to the latest `storyVersion.contentHash`. Used by "Take Jira version".

### Phase B - Client wiring

4. **`useStoryWriter`** (`src/hooks/useStoryWriter.ts`): add `outdated` / `targetOutdated` state, set them from `data.outdated`/`data.targetOutdated` in `init()`, `refreshSession()`, and the post-applyDraft refresh; expose both in the return object (kept separate from `session`).
5. **`WriterContext`** (`panes/WriterContext.tsx` + `useStoryWriterActions.ts`): add `outdated: boolean`, `targetOutdated: boolean`, and `onTakeJiraVersion: (slot?: "original" | "target") => Promise<void>`. `onTakeJiraVersion` pulls the Jira version for the slot (reusing the existing pull path), applies it to the editor, rebases the baseline (PATCH `rebaseBaseline` for original; local-edits PATCH rebase for target), then `refreshSession()` so the flag clears.

### Phase C - UI

6. **Banner** in `EditorApp.tsx` above the editor, shown when `writer.outdated`: amber styling, copy "Jira changed after this draft started. Your draft may be based on an older version.", with "View difference" (`pane.openApp("diff")` - DiffApp already defaults to editor-draft vs latest Jira version) and "Take Jira version" (`writer.onTakeJiraVersion("original")`). Mirror in `SplitTargetApp.tsx` gated on `writer.targetOutdated` with "Take Jira version" (target); target "View difference" against Jira is deferred (the split-target pane diffs against AI drafts, not Jira) and annotated.

### Phase D - Tests + docs

7. Server tests (`story-writer/route.test.ts`, `ticket-service.test.ts`): outdated true/false, null-baseline guard, after-push rebase, PATCH rebaseBaseline, no-false-outdated after acceptDraft.
8. Editor banner tests (`EditorApp.test.tsx`): renders when outdated, hidden otherwise, both actions fire.
9. Edge cases as explicit assertions (push, acceptDraft, null baseline).
10. Update `docs/architecture/story-writer.md`.

### Ambiguities / deferred
- Target "View difference" against the Jira version is out of clean scope (target pane has no Jira-version diff); the target banner offers "Take Jira version" only. Annotated inline.

## Checklist

- [x] Server: compute and return `outdated` (and `targetOutdated` for split) on the session GET payload, with null-baseline guard
- [x] Server: rebase `baseVersionHash` after a successful push so a just-pushed draft is not flagged
- [x] Client: surface the flag through `useStoryWriter` / `refreshSession`
- [x] UI: outdated banner in `EditorApp` (and `SplitTargetApp`) with "View difference" and "Take Jira version" actions <!-- target banner offers "Take Jira version" only; target-vs-Jira diff deferred (split target pane has no Jira-version diff) -->
- [x] "View difference" opens the diff of current draft vs latest Jira version
- [x] "Take Jira version" replaces content + title and clears the warning (reuse accept-jira-version path)
- [x] Tests: server detection (outdated true/false, null baseline, after-push rebase)
- [x] Tests: editor banner rendering and the two actions
- [x] Verify no false "outdated" after a normal push or after accepting an AI draft
- [ ] Update `docs/architecture/story-writer.md` (note outdated detection surfaced in the editor)
