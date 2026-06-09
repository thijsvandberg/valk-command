# Pre-existing story-writer failures blocking `npm run build` / `npm run test`

**Date:** 2026-06-09
**Found during:** BRDG-321 (row marker family) final verification

While verifying BRDG-321 I hit three failures that are **unrelated to that story** and already present on `dev` (confirmed by `git stash` + re-running on the clean base, and by `git diff` showing none of these files in the BRDG-321 changeset).

## 1. Lint error (blocks `npm run lint` and `npm run build`)

`src/components/story-writer/ChatMessageParts.tsx:290`

```
react-hooks/set-state-in-effect — Calling setState() synchronously within an effect
  290 | setDraftExpanded(Boolean(isLatestDraft) && !draftAccepted);
```

Introduced by commit `951687e3` ("feat: restyle story-writer draft card to match suggestion cards"). This single error fails the `next build` lint pass even though compilation succeeds.

## 2. Test failures (block `npm run test` full suite)

- `src/components/story-writer/TitleInput.test.tsx > is a text input element` — expects `type="text"`, receives `null`.
- `src/hooks/useSidebarData.test.ts:118` — `storyWriter` sidebar data assertion.

## Impact

`npm run build` and the full `npm run test` are currently red on `dev` for reasons independent of BRDG-321. BRDG-321 itself: production bundle **compiles successfully**, typecheck passes, and all marker/tone tests pass.

## Suggested fix (separate task)

- Wrap the `ChatMessageParts` effect's state update so it does not run synchronously (derive during render, or guard), or add a scoped eslint-disable with justification.
- Re-check `TitleInput` rendering an `<input type="text">` and the `useSidebarData` storyWriter branch.
