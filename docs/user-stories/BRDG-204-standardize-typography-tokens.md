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

## Implementation Plan

### Mapping Strategy

The project uses a 17px root font-size, so Tailwind's rem-based classes compute to slightly different px values than the standard 16px-root assumptions. All replacements make text slightly smaller (sub-pixel differences).

| Raw Tailwind | Computed (17px root) | Token Replacement | Token Size | Delta |
|-------------|---------------------|-------------------|------------|-------|
| `text-xs` | 12.75px | `text-body-sm` | 12px | -0.75px |
| `text-sm` | 14.875px | `text-body-lg` | 14px | -0.875px |
| `text-base` | 17px | `text-heading-sm` | 15px | -2px |
| `text-lg` | 19.125px | `text-heading` | 18px | -1.125px |
| `text-xl` | 21.25px | `text-heading` | 18px | -3.25px |
| `text-2xl` | 25.5px | `text-heading-lg` | 24px | -1.5px |

**Line-height note:** Tailwind classes set both font-size and line-height. Custom tokens only set font-size. This matches the existing convention for the 500+ token usages already in the codebase. Explicit `leading-*` will be added only where visual breakage is observed.

### Phases

1. **Rare classes first** (29 occ, 24 files): `text-base`, `text-lg`, `text-xl`, `text-2xl`
2. **`text-sm`** (222 occ, 102 files): mechanical replace with `text-body-lg`
3. **`text-xs`** (532 occ, 145 files): mechanical replace with `text-body-sm`
4. **Tests**: Update `TextInput.test.tsx` assertion (only known test asserting on raw class)
5. **ESLint rule**: Warning-level rule to flag raw Tailwind text sizes in new code
6. **Visual verification**: Check all views for layout regressions

### Risks

- `text-base` and `text-xl` have no exact token match (2px and 3.25px shrink respectively)
- Line-height loss could cause misalignment in dense UI areas
- ~117 arbitrary pixel sizes (`text-[10px]` etc.) are out of scope for this story

## Checklist

- [x] Create mapping document: which raw class maps to which token
- [x] Replace `text-xs` usages (~458 occurrences) with appropriate token
- [x] Replace `text-sm` usages (~186 occurrences) with appropriate token
- [x] Replace `text-base`, `text-lg`, `text-xl`, `text-2xl` usages
- [x] Document any intentional exceptions with inline comments
- [ ] Verify visual output across all views (dashboard, chat, sprint board, ticket detail, refinement)
- [x] Consider adding ESLint rule to warn on raw Tailwind text sizes
- [ ] All tests pass
