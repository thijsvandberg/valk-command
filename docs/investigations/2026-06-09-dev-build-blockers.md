# Pre-existing build/test blockers on `dev` (found during BRDG-322)

**Date:** 2026-06-09
**Context:** While running final verification for BRDG-322 (status badge colours), `npm run build`
and `npm run verify` both fail — but **not** because of BRDG-322. The failures are in the
story-writer domain and predate this work (none of the affected files are in the BRDG-322 diff).
They were left untouched per the "no changes outside task scope" rule, but they block the build for
everyone on `dev`, so they are logged here.

## 1. Lint error blocks `next build` and `npm run verify`

```
src/components/story-writer/ChatMessageParts.tsx
  290:5  Error: Calling setState synchronously within an effect can trigger cascading renders
         (react-hooks/set-state-in-effect)
```

```tsx
useEffect(() => {
  if (!draftId) return;
  setDraftExpanded(Boolean(isLatestDraft) && !draftAccepted);
}, [isLatestDraft, draftId, draftAccepted]);
```

`next build` runs ESLint and halts on this error, so the production build cannot complete.
Likely fix: derive `draftExpanded` during render (or via a key reset) instead of setting state in an
effect — see https://react.dev/learn/you-might-not-need-an-effect.

## 2. Two failing unit tests (full suite: 2 failed / 5322 passed)

- `src/hooks/useSidebarData.test.ts > counts active writer sessions as drafts, null while loading`
  — expects `null` while `useActiveWriterSessions` data is `undefined`, but receives `3`.
- `src/components/story-writer/TitleInput.test.tsx > is a text input element`
  — expects the input to have `type="text"`, but the attribute is `null`.

Both are in the story-writer/sidebar area and unrelated to status colours.

## Recommendation

These belong to whoever owns the recent story-writer changes (the same area as the parallel BRDG-321
follow-up commits that landed during this session). They should be fixed (or the lint rule
consciously addressed) to unblock `dev`'s build. BRDG-322's own changes pass `tsc --noEmit` and all
of their unit tests.
