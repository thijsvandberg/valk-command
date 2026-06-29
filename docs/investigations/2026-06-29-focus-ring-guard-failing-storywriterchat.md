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
