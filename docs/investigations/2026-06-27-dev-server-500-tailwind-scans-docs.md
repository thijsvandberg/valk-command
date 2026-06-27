# Dev server 500s: Tailwind v4 scans `docs/` and generates invalid CSS

**Date:** 2026-06-27
**Found during:** BRDG-413 final verification (needed the live app to screenshot the inbox digest banner).
**Severity:** High for local DX (every route 500s in `next dev`), zero for production.

## Symptom

After a clean `next dev` (Turbopack) startup, **every** route returns HTTP 500 — pages and API
routes alike (e.g. `GET /api/new-stories/count` and `GET /sprint-board` both 500). The dev log shows:

```
⨯ ./src/app/globals.css:3613:43
Parsing CSS source code failed
  .bg-\[var\(--color-surface-\*\)\] {
    background-color: var(--color-surface-*);   <-- Unexpected token Delim('*')
  }
```

`src/app/globals.css` on disk is only ~600 lines; line 3613 is in the **Tailwind-generated** output
(`@import "tailwindcss"`). So Tailwind generated a utility class `bg-[var(--color-surface-*)]` whose
value `var(--color-surface-*)` is invalid CSS. Turbopack's dev CSS parser rejects it and fails the
whole `globals.css` module, which cascades to a 500 on every page that imports the root layout.

## Root cause

Tailwind v4 scans **all non-ignored files** for class names by default, **including markdown**. The
literal string `bg-[var(--color-surface-*)]` appears as prose/example text in:

- `docs/user-stories/BRDG-424-token-discipline-typography-shadows-surfaces.md`
- `docs/user-stories/BRDG-418-fix-undefined-surface-tokens.md`
- `docs/performance-log.md`

Tailwind treats those literals as real class usages and emits a rule with the invalid `*` value.
The **production build tolerates it** (the prod CSS pipeline drops/ignores the malformed declaration),
which is why `npm run build` passes while `next dev` is broken.

Confirmed by temporarily removing the `surface-*` literals from those three docs and clearing
`.next`: a clean `next dev` then compiled and served 200s. Restoring the docs reproduces the 500.

This is unrelated to BRDG-413 (which never references `--color-surface-*`). It was surfaced only
because a dev restart (after `npm run build`) forced a fresh Tailwind compile that picked up the
recently-added BRDG-418..425 planning docs.

## Recommended fixes (pick one; defer to BRDG-418)

1. **Exclude docs from Tailwind's content scan** — the clean, permanent fix. Markdown docs should
   never contribute CSS. In the Tailwind v4 config add a source-negation for `docs/` (e.g. an
   `@source not "../../docs/**"` rule, or a `content` exclusion if a JS config is used).
2. **Don't write bare Tailwind class literals in docs** — wrap token examples so the exact class
   string never appears verbatim (backticks alone do not help; Tailwind scans inside code fences).
3. The underlying "undefined `--color-surface-*` token" hygiene problem is already tracked by
   **BRDG-418**; folding fix (1) into it is the natural home.

## Note for whoever picks this up

`--color-surface-default` is also referenced in several components (`LinkIssueDialog.tsx`,
`dev/exploration/*`) but is **not** defined in `globals.css` (only `surface-base/elevated/chrome/
toolbar/floating` exist). That is a separate token-hygiene gap, also in BRDG-418's wheelhouse.
