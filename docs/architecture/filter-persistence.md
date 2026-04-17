# Filter Persistence Strategy

How filter state is persisted across the app.

## Three-tier model

| Tier | Mechanism | When to use |
|------|-----------|-------------|
| Shareable state | URL search params (`useSearchParams` + `router.replace`) | Sprint selection, team selection, saved-view ID, ticket key in URL. Copying the URL reproduces the exact view. |
| User preferences | `localStorage` via `useLocalStorage` hook | Status filters, assignee/epic filters, sort order, column visibility, date range. Survive browser close and work across tabs. |
| Ephemeral UI state | `useState` (no persistence) | Expanded/collapsed rows, hover state, pagination offset, modal open/close, inline search during composition. Reset on navigation is acceptable or desirable. |

A fourth tier -- **session-scoped preferences** (`sessionStorage` via `useSessionStorage`) -- is used in isolated cases (e.g., sprint board group-by and collapsed groups) where the preference should survive in-tab navigation but reset on new sessions. This is acceptable when the collapsed-group state is large or per-sprint. Do not use `sessionStorage` for filters that users expect to persist across sessions.

## localStorage key naming convention

All new keys use the `bridge:<view>:<purpose>` format:

| Key | View | Purpose |
|-----|------|---------|
| `bridge:pipeline-filters` | Pipelines | Sprint, creator, status, date-range, repo, unlinked toggle |
| `bridge:activity-types` | Activity log | Selected event type filters |
| `bridge:activity-status` | Activity log | Status filter value |
| `bridge:stakeholder-team` | Stakeholder | Last selected team prefix |
| `bridge:stakeholder-sprint` | Stakeholder | Last selected sprint ID |

Existing sprint-board keys (`sprint-board-filters`, `sprint-board-sort`, `sprint-board-columns`, `sprint-board-saved-views`) predate this convention and are left unchanged to avoid discarding user data.

## Hook usage

Always use `useLocalStorage` from `src/hooks/useLocalStorage.ts`. Never call `localStorage.getItem`/`setItem` directly in page or component code -- the hook handles SSR, hydration, and cross-tab sync.

```typescript
// Good
const [statusFilter, setStatusFilter] = useLocalStorage<string>("bridge:activity-status", "");

// Also good -- compound object for tightly coupled filters
const [filters, setFilters] = useLocalStorage<PersistedFilters>("bridge:pipeline-filters", {});
const setStatus = (v: string) => setFilters((prev) => ({ ...prev, status: v }));
```

`Set` values cannot be serialized directly by `JSON.stringify`. Store as `string[]` and convert at the usage boundary:

```typescript
const [storedTypes, setStoredTypes] = useLocalStorage<string[]>("bridge:activity-types", []);
const selectedTypes = useMemo(() => new Set(storedTypes), [storedTypes]);
const toggleType = (type: string) =>
  setStoredTypes((prev) =>
    prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
  );
```

## View-by-view summary

| View | Shareable (URL) | Persistent (localStorage) | Ephemeral |
|------|-----------------|--------------------------|-----------|
| Sprint Board | sprint, view, compare | filters, sort, columns, saved views | checked tickets, hover, drag state |
| Pipelines | (none) | sprint, creator, status, date-range, repo, unlinked | pagination offset, refresh state |
| Activity Log | (none) | event types, status filter | pagination offset, expanded rows, jump target |
| Stakeholder | team, sprintId, compare | team fallback, sprintId fallback | dismissed analysis panels, sync state |

## Why no shared `usePersistedFilter` hook

The views have heterogeneous filter shapes (compound objects, individual strings, Sets stored as arrays). `useLocalStorage` already provides the primitive needed -- a typed getter/setter backed by localStorage. Adding a wrapper hook would be an abstraction without a concrete benefit. Use `useLocalStorage` directly, following the patterns above.
