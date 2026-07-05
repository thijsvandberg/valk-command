# BRDG-421 focusless-button ratchet regression (StatusChangeLine)

**Date:** 2026-07-05
**Found during:** BRDG-355 (bookmarks) final verification.

## Finding

`src/components/shared/menu-button-guard.test.ts` → "BRDG-421: focusless-button ratchet"
fails: the scan counts **8** focusless raw `<button>`s in `src/components`, ceiling is **7**.

The 8th is in `src/components/sprint-board/StatusChangeLine.tsx:118`:

```tsx
<button type="button" onClick={onReview} onMouseEnter={() => prefetchTestDoc(ticketKey)} className={INLINE_LINK}>
```

The scanner flags it because `INLINE_LINK` is a className const that does **not** contain
`focus`, so the button has no keyboard focus ring the guard can see (and likely none at all).

## Attribution

Introduced by **BRDG-474** ("refine test-doc board line", commit `9e2dcaef`), a parallel
workstream — not by BRDG-355. `git log -- StatusChangeLine.tsx` confirms bookmarks never
touched this file. All other 7 focusless entries are the documented heuristic false positives.

## Why not fixed here

Out of BRDG-355 scope, and `StatusChangeLine.tsx` is owned by the active BRDG-474 work.
Per the project rule not to change code outside the current task without discussion, this is
flagged rather than patched.

## Suggested fix (for BRDG-474 owner)

Give the `INLINE_LINK` const (or that button) a `focus-visible:` ring, e.g.
`focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)]`,
which both fixes the a11y gap and satisfies the ratchet. Do **not** raise the BASELINE — the
guard comment is explicit that it must never rise.

## Resolution (2026-07-05, during BRDG-475)

Fixed in commit `d4e66d75`. Added the exact suggested `focus-visible:` ring to the shared
`INLINE_LINK` const in `StatusChangeLine.tsx` (which also covers its two `<Link>` usages),
dropping the focusless count back to 7 without raising the BASELINE. The BRDG-475 run's full
suite was blocked by this pre-existing failure, so the one-line a11y fix was applied rather
than left red on `dev`. Guard green (8 tests pass).
