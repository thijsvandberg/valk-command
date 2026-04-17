# BRDG-110: Typography Scale Standardization

**Status:** Completed
**Priority:** High

## Description

Font sizes are scattered across dozens of arbitrary pixel values with no consistent scale. The same semantic role (e.g., "section header" or "caption") uses different sizes in different views. This makes the UI feel inconsistent and makes it hard to build new views that match existing ones.

### Examples of inconsistency

**Section headers use different sizes:**
- `text-[11px] font-semibold uppercase tracking-wider` in [src/components/ticket-detail/TicketSidebar.tsx:141](../../src/components/ticket-detail/TicketSidebar.tsx)
- `text-[13px] font-semibold` in [src/components/NotificationBell.tsx:318](../../src/components/NotificationBell.tsx)
- `text-xs font-medium` in various locations

**Meta/caption text varies:**
- `text-[9px]` in [src/components/sync/SyncIndicator.tsx:118](../../src/components/sync/SyncIndicator.tsx)
- `text-[10px]` in [src/components/NotificationBell.tsx:77](../../src/components/NotificationBell.tsx), [src/components/shared/Tag.tsx:27](../../src/components/shared/Tag.tsx), [src/components/ticket-detail/SubtasksSection.tsx:43](../../src/components/ticket-detail/SubtasksSection.tsx)
- `text-[11px]` in [src/components/sync/SyncIndicator.tsx:146](../../src/components/sync/SyncIndicator.tsx)

**Body text varies:**
- `text-[12px]` in [src/components/story-writer/RelatedStoriesPanel.tsx:245](../../src/components/story-writer/RelatedStoriesPanel.tsx)
- `text-[13px]` in [src/components/NotificationBell.tsx:435](../../src/components/NotificationBell.tsx), [src/components/story-writer/RelatedStoriesPanel.tsx:125](../../src/components/story-writer/RelatedStoriesPanel.tsx)
- `text-xs` (=12px) and `text-sm` (=14px) mixed elsewhere

### Proposed typography scale

```
--text-caption: 10px    (meta info, timestamps, badge counts)
--text-label: 11px      (section headers, badges, small labels)
--text-body-sm: 12px    (table cells, compact body text)
--text-body: 13px       (default body text)
--text-body-lg: 14px    (emphasized body, form inputs)
--text-heading-sm: 15px (sub-headings)
--text-heading: 18px    (page section headings)
--text-heading-lg: 24px (page titles)
```

## Implementation Plan

1. **Tokens** — Add `--text-*` custom properties to `@theme` block in `globals.css`. In Tailwind v4, these auto-generate utility classes (`text-caption`, `text-label`, etc.).
2. **Shared primitives** — Migrate `Badge`, `Button`, `Tag`, `TabBar`, `SectionHeader`, `TicketKeyPill`, `ViewHeader` and update any tests asserting on the old class names.
3. **`text-[9px]`** (16 instances) — Map to `text-caption` (10px, 1px bump). Badge containers are fixed-size so visual impact is minimal.
4. **`text-[10px]`** (202 instances) — Map to `text-caption`.
5. **`text-[11px]`** (225 instances) — Map to `text-label`.
6. **`text-[12px]`** (50 instances, incl. `!text-[12px]`) — Map to `text-body-sm`.
7. **`text-[13px]`** (32 instances) — Map to `text-body`.
8. **`text-[14px]`** (3 instances) — Map to `text-body-lg`.
9. **`text-[15px]`** (8 instances) — Map to `text-heading-sm`.
10. **Outliers** — `text-[16px]` (ViewHeader wordmark) -> `text-heading-sm`; `text-[22px]` (MetricsPanel stat) -> `text-heading-lg`.
11. **Verify** — Run tests, lint, typecheck, visual review of all major views.

**Notes:** `text-[18px]` and `text-[24px]` have zero current usages; tokens are forward-looking. Tailwind built-in classes (`text-xs`, `text-sm`) are out of scope for this story.

## Acceptance Criteria

- [x] Define typography scale as CSS custom properties in globals.css
- [x] Create Tailwind utility classes or extend theme for the scale
- [x] Migrate all `text-[Npx]` instances to use the scale
- [x] Ensure section headers use consistent size across all views
- [x] Ensure meta/caption text uses consistent size across all views
- [x] Ensure body text uses consistent size across all views
- [x] Visual review: no regressions after migration

## Impact

Eliminates ad-hoc pixel values for font sizes across the entire UI. New views can pick from a fixed set of semantic tokens instead of guessing sizes, and existing views become visually consistent without per-component audits.
