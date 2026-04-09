# VC-034: Shared UI Primitives

**Status:** In Progress
**Priority:** High

## Description

The application has grown organically and many UI patterns are duplicated inline across components. This leads to subtle inconsistencies (border opacities, spacing, border-radius) and makes it harder to add new pages that feel cohesive. This story extracts recurring patterns into shared primitives in `src/components/shared/`, then migrates all existing usages.

Buttons are already being addressed separately and are **out of scope** for this story.

## Guiding Principles

- **Extract, don't invent.** Every primitive must be a direct extraction of what already exists. Do not redesign or add features beyond what current usages need.
- **Props from variance.** Where the same pattern has small deliberate differences (e.g. card with dashed border for empty states), expose a `variant` prop. Where differences are accidental (e.g. `border-white/[0.06]` vs `border-white/[0.07]` for the same tier), pick one and standardize.
- **No wrapper bloat.** A primitive should save code at the call site. If wrapping it in a component doesn't reduce or clarify, leave it inline.
- **Preserve existing tests.** Refactoring must not break any existing test. Run `npm run test` and `npm run build` after each phase.

## Phase 1: Card

A surface container used for content grouping throughout the app.

### Component API

```tsx
// src/components/shared/Card.tsx
interface CardProps {
  variant?: "default" | "subtle" | "floating" | "dashed";
  className?: string;
  children: ReactNode;
}
```

| Variant | Border | Background | Shadow | Use case |
|---------|--------|------------|--------|----------|
| `default` | `border-white/[0.08]` | `bg-white/[0.03]` | none | Job rows, form containers, insights panels |
| `subtle` | `border-white/[0.04]` | `bg-white/[0.02]` | none | Stat cards, nested cards |
| `floating` | `border-white/[0.08]` | `bg-[var(--color-surface-floating)]` | `shadow-[0_8px_32px_rgba(0,0,0,0.5)]` | Dropdowns, popovers |
| `dashed` | `border-dashed border-white/[0.08]` | none | none | Empty-state placeholders |

All variants use `rounded-xl`.

### Acceptance Criteria

- [x] Create `src/components/shared/Card.tsx` with the 4 variants above
- [x] Add tests in `src/components/shared/Card.test.tsx`
- [x] Migrate usages:
  - [x] `JobsPanel.tsx` job rows (line ~31), form container (line ~114), empty state card (line ~215)
  - [x] `SprintInsights.tsx` stat cards (line ~88) -- main container skipped: uses `bg-[var(--color-surface-elevated)]` which doesn't match any Card variant
  - [ ] `RelatedStoriesPanel.tsx` candidate cards (line ~76) -- skipped: conditional selected/unselected styling too custom for Card
  - [x] `BulkActionBar.tsx` dropdown menu (line ~52)
- [x] Verify: `npm run test` and `npm run build` pass

---

## Phase 2: EmptyState

Centered placeholder shown when a list or view has no content.

### Component API

```tsx
// src/components/shared/EmptyState.tsx
interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;   // optional button/link
  className?: string;
}
```

### Acceptance Criteria

- [x] Create `src/components/shared/EmptyState.tsx`
- [x] Add tests in `src/components/shared/EmptyState.test.tsx`
- [x] Migrate usages:
  - [ ] `ChatEmptyState.tsx` -- skipped: uses significantly different typography (text-lg heading with font-display vs shared text-sm)
  - [x] `TicketTable.tsx` empty state (line ~382)
  - [x] `JobsPanel.tsx` empty state (line ~214, uses `Card variant="dashed"` as wrapper)
  - [x] `ConversationList.tsx` empty state (line ~51)
  - [ ] `SearchResultParts.tsx` -- skipped: has conditional query/mode logic too specific for shared component
- [x] Verify: `npm run test` and `npm run build` pass

---

## Phase 3: PageIntro

Large page title + subtitle used at the top of full-page views.

### Component API

```tsx
// src/components/shared/PageIntro.tsx
interface PageIntroProps {
  title: string;
  description?: string;
}
```

Renders:
```tsx
<div>
  <h1 className="font-[var(--font-display)] text-3xl font-bold tracking-[-0.03em] text-white">
    {title}
  </h1>
  {description && (
    <p className="mt-2 max-w-lg font-[var(--font-body)] text-base leading-[1.7] text-white/50">
      {description}
    </p>
  )}
</div>
```

### Acceptance Criteria

- [x] Create `src/components/shared/PageIntro.tsx`
- [x] Add tests in `src/components/shared/PageIntro.test.tsx`
- [x] Migrate usages:
  - [x] `src/app/(app)/page.tsx` (Dashboard)
  - [x] `src/app/(app)/jobs/page.tsx` (Scheduled Jobs)
  - [x] `src/app/(app)/refinement/page.tsx` (Refinement)
  - [ ] `src/app/(app)/tests/page.tsx` -- skipped: file does not exist
  - [x] `src/app/(app)/stakeholder/page.tsx` (Stakeholder)
  - [ ] `src/app/(app)/activity-log/page.tsx` -- skipped: intentionally different style (text-2xl font-semibold, different spacing)
- [x] Verify: `npm run test` and `npm run build` pass

---

## Phase 4: SectionHeader (promote to shared)

Already exists at `src/components/ticket-detail/SectionHeader.tsx`. Move it to `shared/` and update all imports.

### Acceptance Criteria

- [ ] Move `SectionHeader.tsx` from `ticket-detail/` to `shared/`
- [ ] Update all imports in `ticket-detail/` files (TicketContent, TicketHistory, TicketReview)
- [ ] Migrate inline section headers that match this pattern:
  - [ ] `JobsPanel.tsx` "New scheduled job" h3 (line ~116)
  - [ ] `TicketRefinement.tsx` "Ready for Refinement" h3 (line ~101)
- [ ] Verify: `npm run test` and `npm run build` pass

---

## Phase 5: InlineAlert

Colored alert banner for errors, warnings, and informational messages.

### Component API

```tsx
// src/components/shared/InlineAlert.tsx
interface InlineAlertProps {
  variant: "error" | "warning" | "info";
  children: ReactNode;
  className?: string;
}
```

| Variant | Border | Background | Text |
|---------|--------|------------|------|
| `error` | `border-red-500/20` | `bg-red-500/10` | `text-red-400` |
| `warning` | `border-amber-500/20` | `bg-amber-500/10` | `text-amber-400` |
| `info` | `border-blue-500/20` | `bg-blue-500/10` | `text-blue-400` |

### Acceptance Criteria

- [ ] Create `src/components/shared/InlineAlert.tsx`
- [ ] Add tests in `src/components/shared/InlineAlert.test.tsx`
- [ ] Migrate usages:
  - [ ] `ConversationList.tsx` error display (line ~41)
  - [ ] `MessageList.tsx` error display (line ~252)
  - [ ] `JobsPanel.tsx` error display (line ~190)
- [ ] Verify: `npm run test` and `npm run build` pass

---

## Phase 6: Tag

Small colored label for metadata like version type, ticket labels, and tool names.

### Component API

```tsx
// src/components/shared/Tag.tsx
interface TagProps {
  color?: "brand" | "blue" | "purple" | "amber" | "red" | "neutral";
  children: ReactNode;
  className?: string;
}
```

Default styling: `rounded px-1.5 py-0.5 text-[10px] font-medium`. Color sets `bg-{color}/15` and `text-{color}` using a lookup map.

### Acceptance Criteria

- [ ] Create `src/components/shared/Tag.tsx`
- [ ] Add tests in `src/components/shared/Tag.test.tsx`
- [ ] Migrate usages:
  - [ ] `VersionPicker.tsx` "Jira" / "Draft" / "AI Draft" tags (lines ~74-93)
  - [ ] `TicketHistory.tsx` version label tags (lines ~674-693)
  - [ ] `TicketSidebar.tsx` label and component chips (lines ~248-261)
  - [ ] `TaskProgress.tsx` tool call chips (lines ~60-65)
  - [ ] `TicketContent.tsx` "Locally modified" indicator (line ~155)
- [ ] Verify: `npm run test` and `npm run build` pass

---

## Phase 7: TextInput and TextArea

Styled form primitives wrapping native `<input>` and `<textarea>`.

### Component API

```tsx
// src/components/shared/TextInput.tsx
interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  size?: "sm" | "md";
  icon?: ReactNode;       // leading icon (e.g. Search)
}

// src/components/shared/TextArea.tsx
interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  // no extra props needed beyond native
}
```

Core styling (md size): `rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-sm text-white/80 placeholder-white/25 focus:outline-none focus:border-[var(--color-brand-500)]/40 transition-colors duration-150`

When `icon` is provided, add left padding and position the icon absolutely.

### Acceptance Criteria

- [ ] Create `src/components/shared/TextInput.tsx`
- [ ] Create `src/components/shared/TextArea.tsx`
- [ ] Add tests for both
- [ ] Migrate usages (TextInput):
  - [ ] `SprintListModal.tsx` search input (line ~221)
  - [ ] `FilterBar.tsx` search input (line ~447) and save-view input (line ~319)
  - [ ] `FilterDropdown.tsx` search input (line ~114)
  - [ ] `settings/prompts/page.tsx` label input (line ~66)
- [ ] Migrate usages (TextArea):
  - [ ] `MessageInput.tsx` chat textarea (line ~52)
  - [ ] `settings/prompts/page.tsx` prompt textarea (line ~91)
- [ ] Verify: `npm run test` and `npm run build` pass

---

## Phase 8: LoadingState

Standardized loading indicator.

### Component API

```tsx
// src/components/shared/LoadingState.tsx
interface LoadingStateProps {
  label?: string;           // default: "Loading..."
  variant?: "text" | "spinner";
  className?: string;
}
```

- `text` variant: centered `<span className="text-sm text-white/30">{label}</span>`
- `spinner` variant: `Loader2` icon with `animate-spin` + label below

### Acceptance Criteria

- [ ] Create `src/components/shared/LoadingState.tsx`
- [ ] Add tests in `src/components/shared/LoadingState.test.tsx`
- [ ] Migrate usages:
  - [ ] `ConversationList.tsx` loading state (line ~47)
  - [ ] `MessageList.tsx` loading state (line ~244)
  - [ ] `SprintBoard.tsx` loading state (line ~407)
- [ ] Verify: `npm run test` and `npm run build` pass

---

## Technical Notes

- All new components go in `src/components/shared/`
- Each component gets a co-located `.test.tsx` file
- Phases are ordered by dependency: Card is used inside EmptyState (dashed variant), so Card comes first
- Each phase is independently shippable. A phase can be a single commit or PR.
- Do not change visual appearance. The goal is extraction, not redesign. If the current styling has minor inconsistencies (e.g. `border-white/[0.06]` vs `border-white/[0.08]` for the same tier), pick the most common value and standardize.
- Line numbers are approximate. Always search for the actual pattern before replacing.
- The `SearchModal.tsx` input is intentionally unstyled (`bg-transparent focus:outline-none`) because it sits inside a custom search chrome. Do not migrate it to TextInput.

## Out of Scope

- **Buttons** (already being addressed separately)
- **Checkbox** (only 2 usages, low ROI for now)
- **Toast** (SyncToast covers the main case, defer generalization until more toast types are needed)
- **Modal shell** (modals are too varied in layout to share more than the backdrop; defer)
- **Skeleton** (only 1 usage in a loading.tsx file; not worth abstracting yet)
- **MetaLabel** (uppercase `text-[11px]` metadata headers in TicketSidebar/SidePanel; only 2-3 usages, defer)
