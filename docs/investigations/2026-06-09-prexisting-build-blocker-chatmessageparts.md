# Pre-existing build blocker: ChatMessageParts setState-in-effect

**Date:** 2026-06-09
**Found during:** BRDG-318 implementation (final `npm run build` / `npm run verify`)

## Summary

`npm run build` and `npm run verify` fail on a lint error that is unrelated to
BRDG-318 and lives in already-committed code:

```
./src/components/story-writer/ChatMessageParts.tsx
290:5  Error: Calling setState synchronously within an effect ...  react-hooks/set-state-in-effect
```

```ts
useEffect(() => {
  if (!draftId) return;
  setDraftExpanded(Boolean(isLatestDraft) && !draftAccepted);
}, [isLatestDraft, draftId, draftAccepted]);
```

The file is clean in the working tree (`git status` shows no modification) and was
last touched by commit `951687e3 feat: restyle story-writer draft card to match
suggestion cards`. So this blocks the build independently of the BRDG-318 changes.

Next.js runs ESLint as part of `next build`, so this single rule violation halts
the production build before compilation. `main` branch protection requires the
`build` check to pass, so this would also block promotion.

## Secondary (warning, non-blocking)

```
./src/app/dev/exploration/preview-board-transition/page.tsx
181:25  Warning: Use a typography token instead of "text-2xl"  typography/no-raw-text-sizes
```

## Also observed (unrelated test failure)

`npx vitest run` reports one failing test, also unrelated to subtasks:

```
src/components/story-writer/TitleInput.test.tsx > TitleInput > is a text input element
expect(element).toHaveAttribute("type", "text") -> received null
```

## BRDG-318 status

The BRDG-318 changes (`ChildIssueRow.tsx`, `SubtasksSection.tsx` + their tests)
pass `npm run lint` for those files, `npm run typecheck` (clean), and their test
suites (57/57). They do not contribute to any of the failures above.

## Recommendation

Fix `ChatMessageParts.tsx` (move the derived `draftExpanded` out of an effect, or
compute it during render) under the story-writer workstream that owns that file.
Not addressed here to avoid changing code outside the BRDG-318 scope.
