# BRDG-117: Loading State Standardization

**Status:** Open
**Priority:** Low

## Description

Loading states are implemented differently across views, creating an inconsistent user experience. Some views show skeleton loaders, others show spinners, others show nothing during loading. Three major views (Dashboard, Refinement, Test Center) are entirely empty placeholder pages.

### Loading patterns in use

**Suspense + LoadingState fallback:**
- [src/app/(app)/stakeholder/page.tsx](../../src/app/(app)/stakeholder/page.tsx)
- [src/app/(app)/chat/page.tsx](../../src/app/(app)/chat/page.tsx)

**Conditional rendering with inline spinner:**
- [src/app/(app)/activity-log/page.tsx](../../src/app/(app)/activity-log/page.tsx)
- [src/app/(app)/pipelines/page.tsx](../../src/app/(app)/pipelines/page.tsx)

**LoadingState component (shared):**
- [src/components/shared/LoadingState.tsx](../../src/components/shared/LoadingState.tsx) (used in only 5 files)

**Custom skeleton (one-off, not shared):**
- [src/app/(app)/pipelines/PipelineSkeleton.tsx](../../src/app/(app)/pipelines/PipelineSkeleton.tsx)

**No loading state:**
- [src/app/(app)/sprint-board/page.tsx](../../src/app/(app)/sprint-board/page.tsx) (Suspense with no fallback)

### Placeholder pages with no content

These pages render only decorative gradients and have no functional content:
- Dashboard: [src/app/(app)/page.tsx](../../src/app/(app)/page.tsx)
- Refinement: [src/app/(app)/refinement/page.tsx](../../src/app/(app)/refinement/page.tsx)
- Test Center: [src/app/(app)/test-center/page.tsx](../../src/app/(app)/test-center/page.tsx)

### Proposed approach

- Use Suspense + LoadingState for all page-level loading
- Create shared Skeleton primitives (SkeletonLine, SkeletonCard, SkeletonTable) for content-aware loading
- Placeholder pages should show a proper "coming soon" empty state with a description of what will be there

## Implementation Plan

1. **Create shared Skeleton primitives** (`src/components/shared/Skeleton.tsx`): `SkeletonLine` (single pulsing bar), `SkeletonCard` (Card wrapper with SkeletonLines), `SkeletonTable` (header + N pulsing rows). Use Tailwind `animate-pulse` and existing color tokens (`bg-white/[0.06]`). Include unit tests in `Skeleton.test.tsx`.

2. **Add EmptyState "coming soon" content to placeholder pages**: Dashboard (`src/app/(app)/page.tsx`), Refinement, and Test Center each get an `EmptyState` component with icon + title + description of what will be there. Keep the decorative gradient background.

3. **Standardize page-level Suspense fallbacks**: Add `fallback={<LoadingState variant="spinner" />}` to sprint-board's bare `<Suspense>`. Standardize diff-preview/page.tsx's ad-hoc inline fallback with `LoadingState`.

4. **Replace inline spinner in ActivityTable**: Replace the raw `<RefreshCw className="animate-spin" />` in `ActivityTable.tsx` with `<LoadingState variant="spinner" />`.

5. **Migrate PipelineSkeleton to shared Skeleton primitives**: Extract `SyncStatusBanner` to its own file (`SyncStatusBanner.tsx`). Rewrite `PipelineSkeleton` to compose from `SkeletonCard` + `SkeletonTable`. Update imports in `pipelines/page.tsx`.

6. **Final verification**: Confirm all views show loading indication; run lint + typecheck + tests + build.

**Implementation order**: Steps 1 and 2-4 are independent; Step 5 depends on Step 1.

## Acceptance Criteria

- [x] Create shared Skeleton components (SkeletonLine, SkeletonCard, SkeletonTable)
- [x] Standardize all page-level loading to use Suspense + LoadingState
- [x] Replace inline spinner patterns with LoadingState or Skeleton
- [x] Add proper empty states to placeholder pages (Dashboard, Refinement, Test Center)
- [x] Remove PipelineSkeleton one-off and replace with shared Skeleton
- [x] Ensure all views show loading indication during data fetches

## Impact

Eliminates inconsistent loading patterns across the application. Users see predictable, content-aware loading states on every view instead of a mix of spinners, skeletons, blank screens, and missing fallbacks. Placeholder pages communicate what is coming instead of showing empty decorative shells.
