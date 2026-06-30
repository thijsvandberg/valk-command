# Pre-existing failures on `dev` (found during BRDG-442)

Date: 2026-06-30

While running final verification for BRDG-442 (a backend-only change), two
failures surfaced that are **unrelated to that story** and already present on
`dev`. Logged here so they can be triaged separately. BRDG-442 deliberately did
not touch either, per the "no out-of-scope code changes without discussion" rule.

## 1. Guard test red: `active:scale-95` in NavPanel

`npm run test` fails one test:

```
src/components/shared/menu-button-guard.test.ts
> BRDG-421: single press-scale value
> uses only active:scale-[0.97] in src/components (no scale-95/[0.98]/etc.)
  offender: src/components/nav/NavPanel.tsx: active:scale-95
```

- `src/components/nav/NavPanel.tsx:304` uses `active:scale-95` on the New-story
  launcher button.
- The BRDG-421 guard test (`menu-button-guard.test.ts`) enforces a single
  press-scale token across `src/components`: only `active:scale-[0.97]`.
- Introduced by commit `2803cfa7` (2026-06-29, "feat(nav): add New story
  launcher to the nav dropdown").

**Resolved (2026-06-30):** fixed at the PO's request in a follow-up commit
(`active:scale-95` -> `active:scale-[0.97]` on NavPanel's New story button); the
guard test is green again.

## 2. Typecheck red: useTicketDetailPage test

`npm run typecheck` (`tsc --noEmit`) fails one file:

```
src/hooks/useTicketDetailPage.test.ts(271,67): error TS2741:
Property 'description' is missing in type '{}' but required in type
'{ description: { value: string; isDraft: boolean; modifiedAt: string; }; }'.
```

This is the already-documented typecheck-vs-build gap (see commit `c6bac364`,
"docs: note pre-existing typecheck-vs-build gap on dev (found in BRDG-444)"):
`next build` skips orphan test files, so the build stays green while
`tsc --noEmit` is red. Recorded here only for completeness; tracked elsewhere.
