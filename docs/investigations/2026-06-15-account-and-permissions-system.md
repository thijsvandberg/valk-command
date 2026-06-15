# Investigation: Account & Permissions System in Bridge

**Date:** 2026-06-15
**Trigger:** Saved sprint-board views show up differently on `:3100` vs `:3101` while "logged in with the same account". This exposed a deeper question: what does an "account" actually mean in Bridge, and is there any rights/permissions model?

## TL;DR

Bridge has **real authentication** (Clerk, organization-gated) but a **fully single-user data layer**. Authentication says "this could be a multi-user product"; the database says "this is one shared instance". The saved-views discrepancy is the visible symptom of a third layer: a large amount of UI state lives in **browser `localStorage`**, which is scoped per browser origin (host + port), not per account.

So there are effectively **three different "scopes"** in play today, and they don't agree:

| Layer | Scope today | Example |
|-------|-------------|---------|
| Authentication (Clerk) | Per person + org membership | Who can log in at all |
| Server data (`appSetting`, Jira mirror, PO metadata) | One shared global instance | Saved searches, column config, all tickets/notes |
| UI preferences (`localStorage`) | Per browser origin (port!) | Saved views, filters, panel widths, theme |

## 1. Authentication: exists, via Clerk

- `src/middleware.ts` enforces Clerk auth on all protected routes; unauthenticated users are redirected to `/login`.
- `src/app/login/[[...rest]]/page.tsx` uses Clerk's `<SignIn>` and additionally requires the user to be a member of a specific Clerk **organization** (`CLERK_ORG_ID`). Non-members get "Access denied".
- The authenticated `userId` is forwarded to API routes via the `x-bridge-user-id` header (`middleware.ts`).
- **But that `userId` is used for one thing only: rate-limiting buckets** (`src/lib/rate-limiter.ts`). It is never used for data ownership or access control.
- Dev bypass: `GET /api/dev/bypass` sets a cookie that skips auth entirely (development only, returns 404 in production).

**Implication for the bug:** "Same account" is true at the Clerk level, but the account identity is thrown away after rate-limiting. Nothing about your data is keyed to your account.

## 2. Database: no concept of a user

- `src/db/schema.ts` has **no `users` table** and **no `userId` foreign keys** on any domain entity (tickets, conversations, PO comments, scores, notes).
- Author-ish fields that do exist are free-text display names from external systems, not Bridge identities: `storyVersion.updatedBy`, `poComment.author` (defaults to `"Product Owner"`), `jiraComment.authorName`, `pipelineRun.prAuthor`.
- `favoriteUser` and `userTeamAssignment` tables store **display names**, not Clerk user IDs.
- The `appSetting` table is a flat global key-value store:
  ```ts
  appSetting = sqliteTable("app_setting", {
    key: text("key").primaryKey(),
    value: text("value").notNull(),
  });
  ```
  No owner column. Every setting stored here is **global to the instance**, shared by all logged-in users.

## 3. Authorization / roles: none

- No role system (no admin / PO / stakeholder roles).
- No per-endpoint authorization. Every authenticated user has identical, full access to every feature.
- The **Stakeholder "read-only" view** (`/stakeholder`) is **not access-gated** — it is read-only only because the page has no edit handlers, not because permissions prevent editing. Any logged-in user can reach every view.

## 4. The actual cause of the saved-views discrepancy

Saved views are stored client-side:

- `src/components/sprint-board/useSprintBoardFilters.ts` → `useLocalStorage<SavedView[]>("sprint-board-saved-views", [])`.
- `localStorage` is partitioned **per origin**. `http://localhost:3100` and `http://localhost:3101` are different origins, so they have completely separate stores. The Clerk account is irrelevant here.
- Note: "Overall refinement" is partly a **synthetic preset** generated in `SprintBoard.tsx`, while "To refine" is a genuine user-saved entry in `localStorage`. That can also make the two ports show different counts.

This is not a one-off. There are **40+ distinct `localStorage` keys** holding per-browser state, e.g.:

- Sprint board: `sprint-board-saved-views`, `sprint-board-filters`, `sprint-board-all-filters`, `sprint-board-sort`, `sprint-board-row-fields`, `sprint-board-po-priority-map`, panel widths/collapse states.
- Epics/backlog: `bridge:epic-filters`, `epic-children-view`, `epic-stats-metric`, etc.
- Chat: `bridge:chat-filters`, `bridge:sidebar-groups-collapsed`, `search_history`.
- Cross-cutting: `theme`, `bridge:notifications-enabled`, refinement zoom/sidebar, stakeholder team/sprint selection, pipeline filters.

All of it is browser-bound and lost on cache clear, and inconsistent across ports/browsers/devices.

## 5. The existing precedent for server-side settings

A subset of settings already lives server-side via the `appSetting` table, following one clean pattern:

- `src/app/api/settings/saved-searches/route.ts` — `GET` returns `{ searches: [...] }`, `PUT` validates (Zod, max 10) and upserts the JSON blob under a fixed key, with `Cache-Control: private, no-store` and write rate-limiting.
- Same pattern: `/api/settings/column-config`, `/column-widths`, `/quick-prompts`, `/default-sprint`, `/notification-preferences`, `/section-visibility`.

So moving `localStorage` state to the server is a **well-trodden path** in this codebase. The catch: `appSetting` is global, so today this makes a setting *instance-wide shared*, not *per-account*.

## 6. The product decision this surfaces

The narrow fix (saved views) is easy. The real question is **what Bridge wants to be**:

### Option A — Single shared instance (status quo, formalized)
Treat Bridge as one PO's workspace. Move per-browser state into the existing global `appSetting` store so it's consistent across ports/devices. No user column needed. Simplest, matches the PRD's "single-user web app".
- Pro: minimal work, no schema churn, fixes the cross-port inconsistency immediately.
- Con: if a second person ever logs in, they share and can overwrite each other's views/filters. Clerk's multi-user org membership becomes misleading.

### Option B — Per-account scoping (lightweight multi-user)
Add an owner column (Clerk `userId`) to settings storage so each account gets its own views/filters/preferences, while all shared domain data (tickets, PO metadata) stays common.
- Pro: settings follow the person across devices; multiple POs/colleagues coexist cleanly. Uses the `x-bridge-user-id` we already forward.
- Con: schema change + migration of the settings storage; need a fallback for the dev-bypass "global" user.

### Option C — Full account & rights system
Users table, roles (PO / stakeholder / viewer), real authorization on endpoints and views (e.g. gate `/stakeholder` write paths, lock destructive actions behind roles), per-user data ownership where it matters.
- Pro: makes the Stakeholder view a real permission, enables sharing Bridge with the wider team safely.
- Con: significant scope; touches every API route; only worth it if Bridge is genuinely going multi-stakeholder.

**Decision (2026-06-15):** Go with **Option B (per-account scoping)** now, deliberately, to be multi-user ready without re-migrating later. Build a per-account settings store keyed on the Clerk user, move saved views first as the reference, then the rest of the work/intent state (filters, sort, the existing global `appSetting` keys). State that depends on screen geometry (panel widths, column widths, zoom) stays device-local on purpose. **Option C** (roles/authorization, gated Stakeholder view) stays deferred until non-PO users actually log in. The Clerk + `x-bridge-user-id` plumbing already exists, so per-account scoping is cheap.

## 7. Follow-up stories

- **BRDG-343** — Account-scoped settings, starting with saved views: a per-account settings foundation + migration of per-browser/global-`appSetting` state to the user level. See `docs/user-stories/BRDG-343-account-scoped-saved-views.md`.
- (Deferred, not yet written) Roles & authorization / gated Stakeholder view — only if Option C is chosen.
