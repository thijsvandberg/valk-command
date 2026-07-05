# BRDG-476: Toggle to enable/disable automatic test doc generation

**Status:** Done
**Priority:** Medium
**Type:** Feature

## Description

When a pinned-sprint ticket moves to "To Test", Bridge automatically kicks off test doc generation in the background (BRDG-471). There is currently no way to turn this off. This story adds a toggle on the general settings page so the PO can disable automatic generation — for example when the agent workspace is unavailable or when the team is not yet using test docs.

Decided behaviour:

- Default is **on** (matches the current BRDG-471 behaviour).
- When turned off, `maybeAutoGenerateTestDoc` becomes a no-op; no background generation fires on any status transition. Manually triggering generation from the board or ticket detail still works.
- The setting is global (not per-user) because the auto-trigger runs server-side in a background job with no user context.
- The toggle lives in a new "Test Docs" section on `/settings/general`, alongside the existing Story Writer Defaults, Sprint Board, and Teams sections.

## Current Behaviour

- `maybeAutoGenerateTestDoc(key)` in `src/lib/test-doc-background.ts:167` fires for every pinned-sprint ticket that enters "TEST" status (from both Jira-origin sync in `src/lib/upsert-issue.ts:704` and Bridge-origin PUT in `src/app/api/tickets/[key]/status/route.ts:125`). There is no setting to suppress it.
- All other app settings are stored in either `appSetting` (global, `src/db/schema.ts:394`) or `userSetting` (per-account, `src/db/schema.ts:405`). `appSetting` is the right choice here because `maybeAutoGenerateTestDoc` runs outside any request scope and cannot resolve an account.
- The `notification-preferences` setting (`src/lib/notification-preferences.ts` + `src/app/api/settings/notification-preferences/route.ts`) is the existing `appSetting` boolean-toggle pattern to follow: a lib helper reads from the DB at call time, and a GET/PUT route exposes it to the client.
- The general settings page (`src/app/(app)/settings/general/page.tsx`) uses `ToggleSwitch` (`src/components/shared/ToggleSwitch.tsx`) in other views; this story introduces the first toggle on the general page itself.

## Proposed Approach

1. **Lib helper** — `src/lib/auto-generate-test-doc-setting.ts`: exports `AUTO_GENERATE_TEST_DOC_KEY = "auto_generate_test_doc"`, `DEFAULT = true`, and `getAutoGenerateTestDoc(): boolean` which reads the `appSetting` row synchronously and returns the default when absent (same pattern as `getPreferences()` in `notification-preferences.ts`).

2. **API route** — `src/app/api/settings/auto-generate-test-doc/route.ts`: `GET` returns `{ enabled: boolean }` (reads via helper); `PUT` accepts `{ enabled: boolean }`, writes via `upsertSetting(key, JSON.stringify(enabled))`.

3. **Guard in `maybeAutoGenerateTestDoc`** — add `if (!getAutoGenerateTestDoc()) return;` as the first guard in `src/lib/test-doc-background.ts:167`, before the draft-key and in-flight checks. Reads at call time (consistent with `MAX_STATUS_CHANGES` and the poll-interval approach in the same file).

4. **UI** — add a "Test Docs" section at the bottom of `src/app/(app)/settings/general/page.tsx` with a `ToggleSwitch` labelled "Automatically generate test doc when a story moves to To Test". Uses `useAccountSetting<boolean>` hook pattern (`src/hooks/useAccountSetting.ts`) pointing to the new API route.

### Non-goals / out of scope

- No change to the manual generate flow (board "Generate test doc" button, ticket detail controls).
- No per-sprint or per-ticket granularity; one global on/off switch.
- No migration needed; `getAutoGenerateTestDoc()` returns `true` (default) when no DB row exists yet.

## Implementation Plan

1. Add `src/lib/auto-generate-test-doc-setting.ts` with `getAutoGenerateTestDoc()`.
2. Add `src/app/api/settings/auto-generate-test-doc/route.ts` (GET + PUT, same shape as notification-preferences route).
3. Patch `maybeAutoGenerateTestDoc` in `src/lib/test-doc-background.ts` to call `getAutoGenerateTestDoc()` and return early when false.
4. Add "Test Docs" section with `ToggleSwitch` to `src/app/(app)/settings/general/page.tsx`.

## Acceptance Criteria

- [x] When the toggle is off, calling `maybeAutoGenerateTestDoc` for any ticket (pinned or not) is a no-op and no generation task is submitted to the workspace. <!-- getAutoGenerateTestDoc() guard in test-doc-background.ts:maybeAutoGenerateTestDoc -->
- [x] When the toggle is on (default), `maybeAutoGenerateTestDoc` behaves exactly as it does today. <!-- existing BRDG-471 flow unchanged -->
- [x] The toggle is visible on `/settings/general` in a "Test Docs" section and reflects the persisted value after a page refresh. <!-- general/page.tsx + GET /api/settings/auto-generate-test-doc -->
- [x] Changing the toggle persists immediately without a page reload. <!-- PUT /api/settings/auto-generate-test-doc + optimistic local state -->
- [x] Manual test doc generation (board button, ticket detail) is unaffected by the toggle state. <!-- kickoffTestDocGeneration is called directly by the manual route, not via maybeAutoGenerateTestDoc -->

## Tests

- [x] `getAutoGenerateTestDoc()` returns `true` when no DB row exists, and returns the stored value when one does. <!-- src/lib/auto-generate-test-doc-setting.test.ts -->
- [x] `maybeAutoGenerateTestDoc` returns without calling `kickoffTestDocGeneration` when `getAutoGenerateTestDoc()` returns false. <!-- src/lib/test-doc-background.test.ts (extend existing suite) -->
- [x] `GET /api/settings/auto-generate-test-doc` returns `{ enabled: true }` by default and the stored value after a PUT. <!-- src/app/api/settings/auto-generate-test-doc/route.test.ts -->
- [x] `PUT /api/settings/auto-generate-test-doc` with `{ enabled: false }` persists and is reflected in subsequent GETs. <!-- route.test.ts -->

## Related

- [[BRDG-471-auto-test-doc-on-move-to-test]] — the BRDG-471 feature this toggle gates; `maybeAutoGenerateTestDoc` is its entry point.
- `src/lib/notification-preferences.ts` — the `appSetting` boolean-toggle lib pattern this story follows.
- `src/lib/upsert-setting.ts` — shared write helper used by the new PUT route.
