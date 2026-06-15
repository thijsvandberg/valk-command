# BRDG-343: Account-Scoped Settings (starting with Saved Views)

**Status:** Done (foundation + saved views + all remaining per-account state migrated; `notification_prefs` and `theme` intentionally deferred with inline rationale)
**Priority:** Medium
**Type:** Feature

## Description

As a Product Owner, I want my views and settings to be tied to my real (Clerk) account instead of my browser, so that the same state follows me across ports, browsers, and devices — and so Bridge is properly prepared for more than one user logging in.

Today most of this state lives in two places that are *not* account-aware: browser `localStorage` (per origin, so `:3100` and `:3101` diverge) and the global `appSetting` table (one shared blob for the whole instance). This story introduces a **per-account settings foundation** keyed on the authenticated user, migrates saved views first as the reference implementation, and then moves the rest of the per-account state onto it. State that is genuinely device-specific (panel widths that depend on screen size, etc.) intentionally stays local.

See background: [docs/investigations/2026-06-15-account-and-permissions-system.md](../investigations/2026-06-15-account-and-permissions-system.md). This story takes **Option B (per-account scoping)** from that investigation, deliberately, to be multi-user ready without building a full roles/permissions system (Option C, out of scope).

## Context

- **Auth is already account-aware; storage is not.** Clerk authenticates and `src/middleware.ts` forwards the user via the `x-bridge-user-id` header. Today that id is used only for rate-limiting (`src/lib/rate-limiter.ts`); no stored state is keyed to it.
- **Saved views (primary case):** `src/components/sprint-board/useSprintBoardFilters.ts` → `useLocalStorage<SavedView[]>("sprint-board-saved-views", [])`. Shape in `src/components/sprint-board/filter-bar-types.ts`. "Overall refinement" is partly a **synthetic preset** from `SprintBoard.tsx`, not a stored entry — must not be duplicated on migration.
- **Server settings precedent:** `src/app/api/settings/saved-searches/route.ts` (GET returns JSON, PUT validates with Zod + upserts) and siblings (`/column-config`, `/column-widths`, `/quick-prompts`, `/default-sprint`, `/notification-preferences`, `/section-visibility`). These all write to the **global** `appSetting` table (`key PK, value`) — shared by every user, which is exactly what we're fixing.
- **40+ `localStorage` keys** hold per-browser state (full inventory in the investigation). They split into "represents the user's intent/work" (should follow the account) and "depends on this screen/device" (stays local).

## Goal split: what goes per-account vs stays local

### Per-account (move to the new user-scoped store)
- **Saved views** — `sprint-board-saved-views` (primary deliverable).
- **Filters & sort & row fields** — `sprint-board-filters`, `sprint-board-all-filters`, `sprint-board-sort`, `sprint-board-row-fields`, `sprint-board-po-priority-map`.
- **Other view filters** — `bridge:epic-filters`, `epic-children-view`, `epic-stats-metric`, `bridge:chat-filters`, `bridge:sidebar-groups-collapsed`, `bridge:pipeline-filters`, `bridge:activity-types`, `bridge:activity-status`, `bridge:stakeholder-team`, `bridge:stakeholder-sprint`, `subtask-status-filter`, `subtask-hide-deprecated`.
- **Existing global `appSetting` keys** — re-scope to the user: `saved_searches`, `sprint_board_column_config`, `story_writer_quick_prompts`, `default_sprint_id`, `notification_prefs`, `section_visibility`.
- **Theme** — `theme`: lower priority but fine to store per-account (a per-device override can come later if it ever feels wrong).

### Stays device-local (with a one-line rationale in code)
- **Sizes that depend on screen geometry** — `sprintBoardPanelWidth`, `sprintBoardMetaWidth`, `ticket-sidebar-width`, `ticket-chat-width`, `bridge:refinement-sidebar-width`, `bridge:ai-drawer-width`, `bridge:compare-split`, `sprint_board_column_widths`. Following these across a laptop and a large monitor would be worse, not better.
- **Collapse / zoom / ephemeral** — panel collapse booleans, `bridge:refinement-zoom-v2`, `search_history`, `slash-commands-recent`. Low value to sync; leave local.

(If any device-local item turns out to feel better per-account in practice, it can move later — the foundation makes that a one-line change.)

## Implementation Plan (remaining per-account state)

Reuses the shipped foundation: `createUserJsonSettingRoute` (server), `useAccountSetting` (client), and the `useSavedViews` one-time-import pattern. Two new minimal abstractions:
- **Client:** `src/hooks/useMigratedAccountSetting.ts` — wraps `useAccountSetting` + a default-guarded, idempotent one-time localStorage import (generalizes `useSavedViews`). For scalars/objects (no merge-by-id), the import only runs when the server value is still the default, so a value already changed on another device is never clobbered. Guarded by a `<key>-migrated` flag.
- **Server:** `seedUserSettingFromGlobal(key, userId, default)` in `user-settings.ts` — seed-on-read for the global `appSetting` re-scope: GET reads `userSetting`; if absent, seeds from the legacy global `appSetting` row (if any) and returns it; per-account row, once written, permanently shadows the global. The presence of the row is the idempotency flag; the global row is never mutated/deleted.

Groups (each = new route(s) + hook/call-site swap + tests, committed per group):
- **A — Sprint-board bundle (riskiest, done last among migrations):** `sprint-board-filters`, `sprint-board-all-filters`, `sprint-board-sort`, `sprint-board-row-fields` (in `useSprintBoardFilters.ts`), `sprint-board-po-priority-map` (in `SprintBoard.tsx`).
- **B — Epic prefs:** `bridge:epic-filters`, `epic-children-view`, `epic-stats-metric`.
- **C — Subtask prefs:** `subtask-status-filter`, `subtask-hide-deprecated`.
- **D — Activity log:** `bridge:activity-types`, `bridge:activity-status`.
- **E — Stakeholder:** `bridge:stakeholder-team`, `bridge:stakeholder-sprint`.
- **F — Chat / pipelines:** `bridge:chat-filters`, `bridge:sidebar-groups-collapsed`, `bridge:pipeline-filters`.
- **G — Theme:** keep localStorage as the synchronous SSR snapshot (avoids flash-of-wrong-theme); reconcile to the account as a secondary source. Lower priority; descope if reconciliation proves fragile.
- **H — Global `appSetting` re-scope (seed-on-read, envelopes unchanged):** `saved_searches`, `sprint_board_column_config`, `story_writer_quick_prompts`, `default_sprint_id`, `notification_prefs`, `section_visibility`. These keep their bespoke `{ searches }`/`{ sprintId }`/… envelopes (NOT `{ value }`), so consumers are untouched; only the storage layer swaps to `readUserSetting`/`seedUserSettingFromGlobal`/`writeUserSetting`.

Order: (1) shared helpers, (2) Group H, (3) leaf groups B–F, (4) Group A, (5) Group G, (6) WHY comments on device-local keys.

Tests: per-route GET default / PUT validation / round-trip; seed-on-read + idempotency + per-account isolation for Group H; import-once + default-guard for the client hook.

## Acceptance Criteria

### Foundation
- [x] A per-account settings store keyed on the authenticated Clerk user id, with a clean fallback to a single `"global"` segment when no user resolves (dev-bypass / outside a request), consistent with `rate-limiter.ts`. — `user_setting` table + `src/lib/user-settings.ts` (`resolveUserId` / `readUserSetting` / `writeUserSetting`).
- [x] A reusable server read/write path (route + Zod validation + upsert, `Cache-Control: private, no-store`, write rate-limited) and a reusable client hook so each setting is a few lines to onboard, mirroring the `saved-searches` ergonomics. — `createUserJsonSettingRoute` + `useAccountSetting`.
- [x] Two different accounts on the same instance keep fully independent settings; neither can read or overwrite the other's. — covered by tests.

### Saved views (reference implementation)
- [x] Saved views persist server-side, scoped to the account; identical across `:3100`/`:3101`, browsers, and devices. — `GET/PUT /api/settings/saved-views`, consumed via `useSavedViews`.
- [x] Create / rename / delete write through to the server and survive a browser cache clear. — optimistic PUT in `useAccountSetting`.
- [x] The synthetic "Overall refinement" preset still shows and is not persisted or duplicated as a user view. — preset stays generated in `SprintBoard.tsx`; only genuine views round-trip.
- [x] One-time, idempotent migration: existing `localStorage` saved views for the current account are imported once, then the server is the source of truth. No views lost. — merge-by-id import in `useSavedViews`, guarded by a `*-migrated` flag.
- [x] Loading/error states; a failed save surfaces a toast and does not drop the in-progress view. — SWR loading + `rollbackOnError` on write.

### Remaining per-account state (follow-up)
- [x] The per-account filters/sort/row-fields and the listed `appSetting` keys are moved onto the foundation, each with a one-time import from its old location (localStorage or global `appSetting`). — sprint-board filters/sort/row-fields/po-priority + epic/subtask/activity/stakeholder/chat/pipeline prefs via `useMigratedAccountSetting`; global `appSetting` keys (`saved_searches`, `sprint_board_column_config`, `story_writer_quick_prompts`, `default_sprint_id`, `section_visibility`) re-scoped via `seedUserSettingFromGlobal`. Two intentional exceptions: `notification_prefs` (sender reads it outside any request, no account context) and `theme` (synchronous SSR snapshot; per-account would reintroduce flash-of-wrong-theme) — both deferred with inline WHY comments.
- [x] Device-local keys listed above are explicitly left in `localStorage`, each with a short WHY comment. — panel/sidebar/drawer widths, compare split, refinement zoom, column widths (stays global appSetting), search history, recent slash-commands.

### Tests
- [x] API/store tests: GET/PUT, validation, per-account isolation, `"global"` fallback. — `route.test.ts` + `user-settings.test.ts`.
- [x] Migration tests: import-once + idempotency. — covered for the localStorage source (saved views); global-`appSetting` import lands with the follow-up keys.

## Technical Notes

- **Storage mechanism (recommended): a dedicated user-scoped settings table** rather than composite keys in the existing global `appSetting`. e.g. `userSetting(userId text, key text, value text, primaryKey(userId, key))` in `src/db/schema.ts` + a migration in `drizzle/`. This keeps genuinely-global settings (if any) separate, queries cleanly per user, and is the natural multi-user shape. The `"global"` fallback is just a reserved `userId` value.
- **Account resolution:** reuse the `x-bridge-user-id` → segment resolver pattern from `rate-limiter.ts` so routes never special-case a missing session.
- **Routes:** add `src/app/api/settings/saved-views/route.ts` first (mirror `saved-searches`), then onboard the rest. Consider a thin shared helper so each setting route is minimal.
- **Client:** introduce a `useAccountSetting`-style hook (SWR read + mutate-on-write) to replace `useLocalStorage` for the per-account keys; keep each feature's existing data shape and handlers. `useLocalStorage` stays for the device-local keys.
- **Migration:** small, idempotent, guarded against re-import (e.g. a per-key "migrated" marker). Existing global `appSetting` values seed the current account's copy on first read.

## Decisions

- **Tie to the real account (chosen).** Build for multi-user now (Option B), so we don't re-migrate later. Full roles/authorization (Option C) stays out of scope.
- **Per-account vs device-local split (chosen):** as listed above — work/intent state follows the account; screen-geometry state stays local.
- **Resolved:** dedicated `userSetting(user_id, key, value)` table (composite PK), not an `ownerId` column on `appSetting`. Keeps genuinely-global settings separate and queries cleanly per user.
- **Resolved:** ship the foundation + saved views first (this story), fan the remaining keys out as a tightly-scoped follow-up.

## Implementation notes (foundation + saved views)

- **Schema/migration:** `userSetting` table in `src/db/schema.ts`; migration `drizzle/0077_real_madelyne_pryor.sql`.
- **Server foundation:** `src/lib/user-settings.ts` — `resolveUserId` (reads `x-bridge-user-id`, falls back to `"global"`), `readUserSetting`/`writeUserSetting` (upsert), and `createUserJsonSettingRoute(key, zodSchema, default)` returning `{ GET, PUT }` under a `{ value }` envelope.
- **Route:** `src/app/api/settings/saved-views/route.ts` (permissive, legacy-tolerant `SavedView[]` schema, max 50).
- **Client foundation:** `src/hooks/useAccountSetting.ts` — SWR read + optimistic PUT, `useLocalStorage`-shaped `setValue`, revalidate-on-focus so a value changed on another port/tab is picked up.
- **Saved views:** `src/hooks/useSavedViews.ts` (wraps the foundation + one-time localStorage import), wired into `src/components/sprint-board/useSprintBoardFilters.ts`.
- **Tests:** `src/lib/user-settings.test.ts`, `src/app/api/settings/saved-views/route.test.ts`.

## Out of scope

- Roles, permissions, and a real authorization model (gated Stakeholder view, admin vs viewer). Option C in the investigation; only if Bridge goes multi-stakeholder.
- A `users` table or per-user ownership of **domain** data (tickets, PO metadata, conversations). Those stay shared across the instance; this story scopes **settings/preferences** only.
- Device-local keys listed above (intentionally not migrated).

## Dependencies

- Builds on existing Clerk auth + `x-bridge-user-id` plumbing (`src/middleware.ts`, `src/lib/rate-limiter.ts`) and the `appSetting` settings pattern.
