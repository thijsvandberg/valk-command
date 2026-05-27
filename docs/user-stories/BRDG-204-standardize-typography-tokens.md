# BRDG-204: Standardize Typography Tokens

**Status:** Not Started
**Priority:** Medium
**Type:** Refactoring

## Description

As a developer, I want all text sizing to use the project's typography token system so that font sizes are consistent and changeable from a single source.

The project defines 8 typography tokens in `globals.css`:
- `text-caption` (10px), `text-label` (11px), `text-body-sm` (12px), `text-body` (13px)
- `text-body-lg` (14px), `text-heading-sm` (15px), `text-heading` (18px), `text-heading-lg` (24px)

However, raw Tailwind size classes are heavily used alongside:

| Class | Usage Count | Should Map To |
|-------|-------------|---------------|
| `text-xs` | 458 | `text-caption` or `text-label` |
| `text-sm` | 186 | `text-body-sm` or `text-body` |
| `text-base` | ~30 | `text-body-lg` |
| `text-lg` | ~20 | `text-heading-sm` |
| `text-xl` | ~10 | `text-heading` |
| `text-2xl` | ~5 | `text-heading-lg` |

The token system is already in use (233 `text-caption`, 171 `text-label` occurrences) but adoption is incomplete.

## Approach

1. Create a mapping from Tailwind defaults to design tokens
2. Replace occurrences file-by-file, verifying visual output
3. Exceptions are allowed where a token genuinely doesn't fit, but should be rare and documented with a comment
4. Consider a lint rule to flag raw Tailwind text sizes in new code (warning, not error)

## Checklist

- [ ] Create mapping document: which raw class maps to which token
- [ ] Replace `text-xs` usages (~458 occurrences) with appropriate token
- [ ] Replace `text-sm` usages (~186 occurrences) with appropriate token
- [ ] Replace `text-base`, `text-lg`, `text-xl`, `text-2xl` usages
- [ ] Document any intentional exceptions with inline comments
- [ ] Verify visual output across all views (dashboard, chat, sprint board, ticket detail, refinement)
- [ ] Consider adding ESLint rule to warn on raw Tailwind text sizes
- [ ] All tests pass
