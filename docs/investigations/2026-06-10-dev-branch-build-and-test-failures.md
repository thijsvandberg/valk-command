# dev branch: pre-existing build/test failures (observed during BRDG-326)

**Date:** 2026-06-10
**Context:** Found while running final verification for BRDG-326 (epic tabbed content). None of these are caused by BRDG-326 — that change compiles, type-checks, and lints cleanly, and its own tests pass. They originate from parallel story-writer work landing on `dev` (BRDG-304 / BRDG-325 commits were interleaving during this run).

## 1. Build-blocking lint error

`src/components/story-writer/ChatMessageParts.tsx:290` — `react-hooks/set-state-in-effect`:

```
useEffect(() => {
  if (!draftId) return;
  setDraftExpanded(Boolean(isLatestDraft) && !draftAccepted);
}, [isLatestDraft, draftId, draftAccepted]);
```

This calls `setState` synchronously inside an effect, which the React Compiler ESLint config treats as an **error**, so `npm run build` (and `npm run lint`) fail. Suggested fix: use the adjust-state-during-render pattern (track previous `draftId` in state and reset on change), the same approach BRDG-326 used in `page.tsx` / `SidePanel.tsx`.

## 2. Failing tests (2)

- `src/hooks/useSidebarData.test.ts > counts active writer sessions as drafts, null while loading` — expects `null` while loading but receives `3`. Related to story-writer session counting (BRDG-325 area).
- `src/components/story-writer/TitleInput.test.tsx > is a text input element` — `getByRole("textbox")` element has no `type="text"` attribute.

Full suite at the time: **2 failed | 5431 passed (5433)**.

## 3. Stale generated types (self-healing)

`tsc --noEmit` reported missing-module errors for `.next-build/types/.../dev/exploration/placeholder-row/page.js` although that directory no longer exists on disk. These are stale generated route types; a clean `npm run build` regenerates them and the errors disappear.

## Recommendation

Owner of the story-writer work should fix items 1 and 2. They block `npm run build` on `dev` for everyone, independent of BRDG-326.
