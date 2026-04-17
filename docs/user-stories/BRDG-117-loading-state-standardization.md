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

## Acceptance Criteria

- [ ] Create shared Skeleton components (SkeletonLine, SkeletonCard, SkeletonTable)
- [ ] Standardize all page-level loading to use Suspense + LoadingState
- [ ] Replace inline spinner patterns with LoadingState or Skeleton
- [ ] Add proper empty states to placeholder pages (Dashboard, Refinement, Test Center)
- [ ] Remove PipelineSkeleton one-off and replace with shared Skeleton
- [ ] Ensure all views show loading indication during data fetches

## Impact

Eliminates inconsistent loading patterns across the application. Users see predictable, content-aware loading states on every view instead of a mix of spinners, skeletons, blank screens, and missing fallbacks. Placeholder pages communicate what is coming instead of showing empty decorative shells.
