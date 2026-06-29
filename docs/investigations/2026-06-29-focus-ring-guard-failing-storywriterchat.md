# Pre-existing focus-ring-guard failure: StoryWriterChat textarea

**Date:** 2026-06-29
**Found during:** BRDG-434 final verification (full test suite run on a clean worktree at the dev tip).

## Finding

`src/components/shared/focus-ring-guard.test.ts` fails on the current `dev` branch,
independent of BRDG-434:

```
- Expected  []
+ Received  ["src/components/story-writer/StoryWriterChat.tsx"]
```

The guard scans interactive elements for a visible focus ring and flags
`StoryWriterChat.tsx` as an offender. The offending element is the chat input
`<textarea>` (around line 646), which uses `focus:outline-none` with no
`focus-visible:` replacement ring:

```
className={`... focus:outline-none disabled:opacity-50 ...`}
```

## Why it is not BRDG-434

- None of the BRDG-434 commits touch `StoryWriterChat.tsx` or `focus-ring-guard.test.ts`.
- The last commit to change the file (`8dcc6aed fix(story-writer): remove duplicate
  focus ring on chat input`) is an ancestor of the dev tip from before this session,
  so the violation predates BRDG-434.
- BRDG-434's full suite is otherwise green (7145 passed; this is the only failure).

## Suggested fix (not applied — out of scope)

The textarea intentionally drops the default outline but the surrounding input
container likely renders the focus treatment instead. Either:
- add the container/textarea pairing to the guard's allowlist if the focus ring is
  rendered on the wrapper, or
- restore a `focus-visible:` ring on the textarea itself.

Left for the Story Writer owner to resolve; flagged here so the red guard test on
`dev` is not mistaken for BRDG-434 fallout.

## Update (BRDG-438 verification, same day): a second red guard

A full-suite run during BRDG-438 found a **second** pre-existing guard failure,
also unrelated to the inbox work:

```
src/components/shared/menu-button-guard.test.ts
- offender: src/components/nav/NavPanel.tsx: active:scale-95
```

`BRDG-421` standardised the press-scale on `active:scale-[0.97]`; `NavPanel.tsx`
uses `active:scale-95`. It was introduced by `2803cfa7 feat(nav): add New story
launcher to the nav dropdown` (a parallel session's commit), not by BRDG-434/438.

So `dev` currently has **two** red guard tests, both from other work:
`focus-ring-guard` (StoryWriterChat) and `menu-button-guard` (NavPanel). The
BRDG-438 suite is otherwise green (7187 passing) and its `inbox/page.tsx` is not
an offender in either guard. Fix: change NavPanel's `active:scale-95` to
`active:scale-[0.97]` (owner of the nav-launcher feature).
