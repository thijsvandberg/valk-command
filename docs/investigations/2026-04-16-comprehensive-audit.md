# Comprehensive Application Audit - 2026-04-16

## Part 1: Refactoring Proposals

### Quick Fixes (can do immediately)

#### QF-1: Replace `transition-all` with specific properties
10 instances of `transition-all` in components (violates CLAUDE.md guardrails). Should use `transition-colors`, `transition-transform`, or `transition-opacity` instead.

**Files:**
- `src/components/stakeholder/AdjacentSprintSection.tsx`
- `src/components/stakeholder/VelocitySparkline.tsx`
- `src/components/stakeholder/CopyMarkdownButton.tsx`
- `src/components/chat/MessageList.tsx`
- `src/components/chat/ChatLayout.tsx`
- `src/components/chat/InvestigationInput.tsx` (2x)
- `src/components/shared/StoryWriterLauncherModal.tsx` (2x)

#### ~~QF-2: Replace direct `console.error/warn` with logger~~ (NOT APPLICABLE)

The `logger` utility (`src/lib/logger.ts`) has `import "server-only"` and cannot be imported in client components. Since all ~35 `console.error`/`console.warn` instances are in client-side code (React components and hooks), `console.*` is the correct pattern there. Server-side code (API routes, lib functions) already uses the logger correctly. No action needed.

---

### User Stories (larger refactoring efforts)

#### BRDG-108: Centralized Internal API Client

**Problem:** 199 `fetch()` calls spread across 65 files. Each manually builds URLs, checks `res.ok`, parses JSON, and handles errors differently. No consistent error handling, no request deduplication, no retry logic for transient failures.

**Proposal:** Create `src/lib/api-client.ts` with:
- Typed wrapper functions per endpoint (e.g., `api.tickets.get(key)`)
- Consistent error handling (throw on non-OK, parse error body)
- Optional abort signal forwarding
- Base URL handling
- TypeScript return types matching API schemas

**Impact:** Reduces boilerplate ~60%, makes error handling consistent, enables future features like request caching or optimistic updates more easily.

---

#### BRDG-109: Component Library Completion (extends BRDG-034)

**Problem:** Shared components exist but are severely underused. Inline styling duplicates their patterns everywhere:

| Component | Imports | Inline equivalents found |
|-----------|---------|--------------------------|
| `Card` | 7 | ~16 (same border/bg pattern inline) |
| `TextInput` | 3 | ~15 (raw `<input>` with same styles) |
| `Tag` | 5 | ~20 (inline badge/pill patterns) |
| `Button` | 53 imports | But ~150 clickable `<div>`/`<span>` elements with inline button styles |

**Missing shared components:**
- **Modal/Dialog** - every modal is built inline (SearchModal, SprintListModal, StoryWriterLauncherModal, etc.)
- **Popover/Dropdown** - implemented from scratch in each location
- **Badge** - many inline `rounded-full px-2 py-0.5 text-[10px]` patterns
- **IconButton** - Button has `iconOnly` prop but most icon-buttons are raw `<div onClick>`
- **Confirm dialog** - no shared confirmation pattern
- **SegmentedControl/TabToggle** - rebuilt inline in multiple places

**Proposal:**
1. Migrate existing inline patterns to use existing shared components
2. Add missing primitives: Modal, Popover, Badge, ConfirmDialog
3. Create an internal component showcase page at `/dev/components` (dev only)

---

#### BRDG-110: Typography Scale Standardization

**Problem:** Font sizes are scattered across dozens of arbitrary pixel values with no consistent scale:
- `text-[9px]`, `text-[10px]`, `text-[11px]`, `text-[12px]`, `text-[13px]`, `text-[14px]`
- Mixed with Tailwind defaults: `text-xs` (12px), `text-sm` (14px), `text-base` (16px)
- No clear hierarchy: label vs body vs caption vs overline

**Proposal:** Define a typography scale in CSS variables and apply consistently:
```
--text-caption: 10px    (meta info, timestamps)
--text-label: 11px      (section headers, badges)
--text-body-sm: 12px    (table cells, compact text)
--text-body: 13px       (default body text)
--text-body-lg: 14px    (emphasized body)
--text-heading-sm: 15px
--text-heading: 18px
--text-heading-lg: 24px
```
Migrate all arbitrary `text-[Npx]` to the scale. This also enables a global "compact/comfortable" density toggle later.

---

#### BRDG-111: ESLint Suppress Cleanup

**Problem:** 8 `eslint-disable-next-line react-hooks/exhaustive-deps` suppressions. These often hide stale closure bugs where a useEffect doesn't re-run when its dependencies change.

**Files to audit:**
- `src/components/story-writer/RelatedStoriesPanel.tsx:190`
- `src/hooks/useWorkspaceTask.ts:244`
- `src/components/story-writer/panes/apps/DraftPreviewApp.tsx:58`
- `src/hooks/useLocalStorage.ts:25`
- `src/hooks/useStakeholderAnalysis.ts:86, 223`
- `src/components/shared/StoryWriterLauncherModal.tsx:483`
- `src/components/story-writer/StoryWriterLayout.tsx:53`
- `src/app/(app)/stakeholder/page.tsx:378`

**Proposal:** Audit each suppression, refactor with `useCallback`/`useRef` where needed, or use `useEffectEvent` pattern. Remove all suppressions.

---

#### BRDG-112: Accessibility Audit

**Problem:** Many interactive elements use `<div onClick>` or `<span onClick>` instead of semantic `<button>`. This means:
- No keyboard navigation (Tab + Enter/Space)
- No screen reader announcements
- No `role="button"` or `aria-label`

Rough count: ~150 clickable non-button elements across 80+ files.

**Proposal:**
1. Replace all `<div onClick>` / `<span onClick>` interactive elements with `<button>` or the `Button` component
2. Add `aria-label` to icon-only buttons
3. Ensure all modals trap focus
4. Add skip-to-content link

---

#### BRDG-113: API Route Hardening Phase 2

**Problem:** Follow-up to BRDG-020 (done). The API routes agent found remaining issues:

- **Inconsistent error response shapes**: Mix of `{ error }`, `{ error, code }`, `{ error, errorDetail }`, `{ ok: true }`, `{ success: true }`
- **40% of POST/PUT routes lack Zod validation**: Settings column-config, column-widths, and several ticket routes use only basic type checks
- **Race conditions**: `followed-tickets` and `followed-sprints` routes do check-then-insert without atomicity
- **Unbounded arrays**: `sync-tickets` accepts unlimited `ticketKeys` array (potential DoS)
- **Blocking polling**: Review generation route polls synchronously for up to 3 minutes inside the route handler
- **Cleanup in GET handlers**: Activity log and notifications run retention cleanup on every GET (should be scheduled task)

**Proposal:**
1. Standardize all error responses to `{ error: string, code?: string }`
2. Add Zod schemas to remaining routes
3. Add max length validators on array inputs
4. Move review generation polling to SSE/webhook pattern
5. Move cleanup tasks to scheduler

---

#### BRDG-114: Duplicate Fetch Pattern Consolidation

**Problem:** The `fetch().then(r => r.ok ? r.json() : null)` pattern is repeated ~15 times across hooks. Additionally:
- `useTaskMonitoring` and `useWorkspaceTask` both implement SSE listener + polling fallback (~80 lines each, duplicated)
- Multiple hooks filter tickets by status/assignee/sprint independently
- Timer cleanup patterns are inconsistent across hooks

**Proposal:** Part of BRDG-108 (API client), but also:
1. Create shared `useStreamingTask` hook for SSE + polling fallback
2. Create shared `useTicketFilter` hook for common filtering logic
3. Standardize timer cleanup patterns

---

### Performance Observations

- **No virtualization on long lists outside sprint board**: Notification list, conversation list, activity log all render full DOM. Sprint board has BRDG-057 (virtual scrolling) done, but other views don't.
- **186 useEffect calls across 86 files**: Some could be replaced by event handlers or derived state (useMemo). Each unnecessary useEffect is an extra render cycle.
- **No request deduplication**: Multiple components can fire the same API call simultaneously (e.g., ticket data fetched by both side panel and detail page).
- **SWR configured but not fully leveraged**: SWRProvider exists but many components use raw `fetch` instead of `useSWR` hooks, missing out on automatic caching and deduplication.
- **Search index rebuilt fully every 60s**: The Fuse.js search index loads ALL tickets, comments, and conversations into memory on cache miss. No incremental updates.
- **In-memory rate limiter**: Resets on server restart, no distributed awareness across multiple instances.
- **Missing memoization in hooks**: `useStoryWriterDrafts` options object not memoized, `usePipelines` filter created inline on each render.

### Test Coverage

**120 test files** cover **35% of source files** (120/344). Well-tested areas:
- API routes (47 test files, comprehensive mocking)
- Core business logic (pipeline sync, story drafts, stakeholder data)
- Shared UI primitives (Card, EmptyState, Tag, TextInput, etc.)

**Gaps** (224 files without tests):
- Most feature components (sprint board cells, ticket detail sections, story writer panes)
- Settings pages (integrations, notifications, scheduler)
- Many hooks (activity stats, drag-and-drop, inline edit, investigation data)
- Several API routes (acknowledge, cache, confluence operations, jira move/rank)

---

## Part 2: UI/UX Consistency Audit

### Components That Should Be Used More

| Component | Current imports | Should be used in |
|-----------|----------------|-------------------|
| `Button` (ui/) | 53 files import it | Replace ~150 inline clickable elements |
| `Card` (shared/) | 7 files | Replace ~16 inline card patterns |
| `TextInput` (shared/) | 3 files | Replace ~15 raw `<input>` elements |
| `Tag` (shared/) | 5 files | Replace ~20 inline badge/pill elements |
| `StatusBadge` (shared/) | used in ticket views | Could replace many inline status indicators |
| `EmptyState` (shared/) | 8 files | Some views still use inline empty messages |
| `LoadingState` (shared/) | 5 files | Some views use inline skeletons |
| `InlineAlert` (shared/) | 3 files | Error/warning messages are often inline |
| `TabBar` (shared/) | 1 file | Multiple views have inline tab implementations |
| `Tooltip` (shared/) | limited use | Many title attributes could be proper tooltips |
| `SectionHeader` (shared/) | limited use | Section headers rebuilt inline in many places |

### Typography Inconsistencies

The most glaring UI inconsistency. Examples of the same semantic role using different sizes:

**Section headers:**
- `text-[11px] font-semibold uppercase tracking-wider` (TicketSidebar)
- `text-[13px] font-semibold` (NotificationBell)
- `text-xs font-medium` (various)

**Meta/caption text:**
- `text-[9px]` (SyncIndicator badge count)
- `text-[10px]` (NotificationBell timestamps, Tag, SubtaskSection badges)
- `text-[11px]` (SyncIndicator labels, ConfluencePagesSection)

**Body text:**
- `text-[12px]` (RelatedStoriesPanel descriptions)
- `text-[13px]` (NotificationBell messages, RelatedStoriesPanel titles)
- `text-xs` (= 12px, used elsewhere)
- `text-sm` (= 14px, used elsewhere)

### Spacing Inconsistencies

- Modal padding varies: `p-4`, `p-5`, `p-6`, `px-4 py-3`, `px-6 py-4`
- Section gaps vary: `gap-2`, `gap-3`, `gap-4`, `space-y-2`, `space-y-3`, `space-y-4`
- Card padding varies: `p-3`, `p-4`, `p-5`, `px-4 py-3`

### Color Usage

The brand color system (`--color-brand-*`) is well-defined and mostly consistent. Some exceptions:
- Stakeholder components use more direct Tailwind colors (emerald, amber) which is fine for semantic meaning
- Some hardcoded hex colors exist (`#1a1d23`, `#0d0f12`) instead of CSS variables

### Border Opacity Inconsistency

Three different border opacities used interchangeably for the same role:
- `border-white/[0.04]` (subtle dividers)
- `border-white/[0.06]` (standard dividers)
- `border-white/[0.08]` (card borders)

Should standardize to 2-3 defined tokens: `--border-subtle`, `--border-default`, `--border-strong`.

### Z-Index Chaos

No defined z-index scale:
- Modals: z-50 or z-[60]
- Dropdowns: z-50 or z-[9999]
- Tooltips: z-[100]
- Notification bell: portal on document.body

Should define: `--z-dropdown: 50`, `--z-modal: 60`, `--z-tooltip: 70`, `--z-portal: 100`.

### Filter Persistence Inconsistency

Each view handles filter state differently:
- Pipelines: localStorage (custom saveFilters/loadFilters)
- Activity log: no persistence (resets on navigate)
- Stakeholder: sessionStorage
- Sprint board: URL search params + SWR

Should pick one pattern (URL params for shareable, localStorage for preferences).

### Loading State Inconsistency

- Some pages use Suspense + fallback (chat, stakeholder)
- Others use conditional rendering with LoadingState component
- Spinner styles differ across locations
- Three placeholder pages (Dashboard, Refinement, Test Center) have identical decorative gradients but no content

### Missing Patterns

1. **No consistent hover state for list items**: Some use `hover:bg-white/[0.04]`, others `hover:bg-white/[0.06]`, others nothing
2. **No consistent focus-visible ring**: Some use `focus-visible:outline-2 focus-visible:outline-offset-2`, others use `focus-visible:ring-2`, others have no focus style
3. **No skeleton/loading pattern for cards**: Each view implements its own loading state differently
4. **No consistent divider style**: `border-white/[0.04]`, `border-white/[0.06]`, `border-white/[0.08]` used interchangeably
5. **Dropdown positioning**: FilterDropdown uses createPortal (fixed), VersionPicker uses relative positioning (absolute). Should unify.

---

## Part 3: Feature & Improvement Proposals

### Existing Open Stories Worth Prioritizing

These open user stories would add the most value based on the current codebase maturity:

| Story | Title | Why prioritize |
|-------|-------|---------------|
| BRDG-037 | Dashboard Widgets | The app has no landing page. Users land on a blank dashboard. This is the highest-impact missing view. |
| BRDG-038 | Refinement Agenda | Core PO workflow that currently has no support. Would tie together story writer + sprint board. |
| BRDG-049 | Sprint Board DnD | Drag-and-drop is expected in any board tool. Currently read-only. |
| BRDG-055 | API Response Caching | Would solve the "no deduplication" performance issue and reduce Jira API load. |
| BRDG-066 | Keyboard Shortcuts | Power-user feature. Framework could be small, high ROI. |
| BRDG-090 | Stakeholder AI Insights | Stakeholder view is live but AI insights panel is just a placeholder. Quick win. |
| BRDG-051 | Inline Ticket Editing | Sprint board is read-only. Quick edits would save trips to ticket detail. |
| BRDG-042 | Bulk Story Writer | Natural extension of story writer for sprint prep. |

### New Feature Proposals

#### BRDG-NEW-1: Sprint Planning Capacity View

The sprint board shows tickets but has no capacity planning. A capacity view would show:
- Total story points committed vs team capacity
- Per-person workload (if assignee data is available from Jira)
- Warning when over-committed
- Historical capacity utilization trend

This combines elements of BRDG-046 (Team Workload) with sprint planning specifics.

#### BRDG-NEW-2: Quick Actions Panel / "PO Toolbar"

A floating action bar (or sidebar section) with the most common PO actions:
- Start story writer for selected ticket
- Quick-review a ticket's story
- Add PO notes
- Change readiness status
- Jump to Jira

Currently these require navigating to the ticket detail view. A quick-action panel would enable flow without leaving the sprint board.

#### BRDG-NEW-3: Sprint Comparison Dashboard

Extend the stakeholder sprint comparison (BRDG-096, done) into a PO-facing analytics view:
- Side-by-side sprint metrics
- Quality score trends across sprints
- Story completion rate evolution
- Story writer usage correlation with quality scores

#### BRDG-NEW-4: Ticket Dependencies Graph

Jira ticket links contain dependency info (blocks/is-blocked-by). Visualize this as a dependency graph per sprint showing:
- Critical path
- Blocked tickets
- Dependency chains

Would help during refinement and sprint planning.

#### BRDG-NEW-5: Integration Health Dashboard

The app integrates with Jira, Bitbucket, Confluence, and the workspace agent. A small settings sub-page showing:
- Connection status for each integration
- Last successful sync time
- Error count in last 24h
- API quota usage (Jira, Bitbucket)
- Quick reconnect/test buttons

Currently, integration issues are only visible when something breaks.

#### BRDG-NEW-6: Smart Sprint Readiness Score

Aggregate the per-ticket readiness checks into a sprint-level readiness score:
- "This sprint is 72% ready for development"
- Highlight which tickets are dragging the score down
- Suggest what to focus on before sprint start
- Could be a dashboard widget (ties into BRDG-037)

#### BRDG-NEW-7: Template System for Story Writer

Pre-built templates beyond the current slash commands:
- Story templates per team/project convention
- Bug report template with required fields
- Spike template with research questions
- User can create custom templates
- Templates stored in app settings

Extends BRDG-033 (per-type skills) with user-customizable templates.

### Improvements to Existing Features

1. **Story Writer**: Add a "review checklist" panel that shows whether the story meets the team's definition of ready before pushing to Jira
2. **Sprint Board**: Add column visibility toggle (some columns are rarely needed but always shown)
3. **Activity Log**: Add export to CSV/JSON for audit trails
4. **Search**: Add recent searches history (last 10 searches, persisted locally)
5. **Notification Bell**: Add "Mark all as read" and "Notification preferences per category"
6. **Stakeholder View**: Add date range selector (currently locked to current sprint + adjacent)
7. **Pipelines**: Add deployment notes/changelog per pipeline run
8. **Command Palette**: Show recent commands, add custom aliases

---

## Summary: Recommended Priority Order

### Immediate (quick fixes, no user story needed)
1. QF-1: Fix `transition-all` (9 instances) -- DONE
2. ~~QF-2: Replace console.* with logger~~ -- N/A (logger is server-only, console.* is correct in client code)

### Short-term (user stories, small scope)
3. BRDG-110: Typography Scale Standardization
4. BRDG-111: ESLint Suppress Cleanup
5. BRDG-108: Centralized API Client
6. BRDG-113: API Route Hardening Phase 2

### Medium-term (user stories, medium scope)
7. BRDG-109: Component Library Completion
8. BRDG-114: Duplicate Fetch Pattern Consolidation
9. BRDG-112: Accessibility Audit
10. BRDG-037: Dashboard Widgets (existing open)
11. BRDG-055: API Response Caching (existing open)
12. BRDG-066: Keyboard Shortcuts (existing open)

### Longer-term (larger features)
13. BRDG-038: Refinement Agenda (existing open)
14. BRDG-049: Sprint Board DnD (existing open)
15. BRDG-NEW-1: Sprint Planning Capacity View
16. BRDG-NEW-6: Smart Sprint Readiness Score
17. BRDG-NEW-4: Ticket Dependencies Graph
