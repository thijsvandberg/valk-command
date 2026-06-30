# BRDG-444: "Open in Bridge" Chrome extension for Jira tickets

**Status:** To Do
**Priority:** Low
**Type:** Feature

## Description
While viewing a Jira ticket (e.g. `https://new-story.atlassian.net/browse/VPL-47093`),
the PO wants a one-click way to jump to that same ticket in Bridge. Today the PO
has to switch to Bridge and search for the key by hand.

The decided scope is **level 0**: a Chrome extension that injects an
**"Open in Bridge"** button onto Jira ticket pages. Clicking it opens Bridge's
existing deep-link for that key in a new tab. There is **no inline enrichment
badge** and **no call to Bridge's API** in this story (that was deliberately
deferred; see Out of scope and Related). Because the button opens a normal browser
tab, it reuses the PO's existing Bridge login (Clerk session) with no auth work.

Decided behaviour (confirmed with PO):
- **Level 0 only**: button that opens the deep-link. No badge, no API reads.
- **Chrome extension** (Manifest V3), not a bookmarklet or userscript.
- Lives as a **plain-JS sub-folder in the Bridge repo** (`tools/jira-extension/`),
  no build step, no code shared with the Next.js app.
- Target port is **configurable via a small extension popup, default `3101`** (prod).
- **No backend change in Bridge.**

## Current Behaviour
Bridge already supports everything on its own side; the gap is purely the
Jira-side entry point.

- **Deep-link exists.** `src/app/(app)/tickets/[key]/page.tsx` renders a single
  ticket by Jira key; the canonical URL is `/tickets/VPL-47093`. URL state
  (child panel, tab) is built by `buildTicketDetailUrl()` in
  `src/lib/ticket-detail-url.ts`.
- **In-app navigation by key already works.** `SearchModal` parses a pasted Jira
  key or Jira URL (`parseJiraKeyFromInput`, `src/components/sprint-board/SearchModal.tsx`)
  and `navigateToKey` (`src/components/sprint-board/useSearchActions.ts:93`) opens
  `/tickets/<key>` — but only inside the app.
- **Unsynced tickets 404.** `GET /api/tickets/[key]` (`src/app/api/tickets/[key]/route.ts:55`)
  returns `404` when `buildTicketDetail` finds no local row
  (`src/lib/ticket-detail-builder.ts:104`, `if (!t) return null`). The in-app flow
  works around this by syncing first (`navigateToKey` calls
  `jira.syncTickets({ ticketKeys: [key] })` before navigating). A level-0 button
  does **not** sync, so opening a not-yet-synced key shows Bridge's not-found state.
- **Bridge is local-only and gated.** Dev `localhost:3100`, prod `localhost:3101`
  (`tools/scripts/`), all routes behind Clerk (`src/middleware.ts`), no CORS, no
  API token. This is exactly why level 0 (a plain tab navigation, not a cross-origin
  fetch) needs nothing from the backend.
- **Repo build hygiene.** `tsconfig.json` includes `**/*.ts(x)` from the root and
  ESLint ignores only `deleted/**` and `.next-build/**` (`eslint.config.*`, the
  `ignores` array). A plain-JS folder with no `.ts` files is invisible to
  typecheck/build; it must be added to the ESLint `ignores` to stay out of lint.

## Proposed Approach
A self-contained Manifest V3 extension under `tools/jira-extension/`, plain JS, no
bundler.

1. **Manifest (`manifest.json`).** `manifest_version: 3`; a content script matched to
   `https://new-story.atlassian.net/*`; an `action` with a popup
   (`popup.html` + `popup.js`) for the port setting; `storage` permission.

2. **Key detection (`parse-key.js`, pure function).** Resolve the current Jira key
   from `location` in priority order: `selectedIssue` query param, then a
   `/browse/<KEY>` path segment, then a generic `[A-Z]+-\d+` match in the pathname.
   Kept as a pure, exported function so it is unit-testable without a browser.

3. **Button injection (`content.js`).** Render an **"Open in Bridge"** button on the
   ticket page. Anchor it in the ticket header when a stable anchor is found; fall
   back to a fixed bottom-right floating button so Jira DOM churn never hides it.
   On click, read the configured port from `chrome.storage.sync` and
   `window.open("http://localhost:<port>/tickets/<KEY>", "_blank", "noopener")`.

4. **SPA re-injection.** Jira is a single-page app, so the URL changes between
   tickets without a full reload. Patch `history.pushState`/`replaceState` and
   listen to `popstate`, with a debounced MutationObserver fallback, to re-detect
   the key and re-inject/update the button on every navigation. Remove the button
   when no key is present (non-ticket pages).

5. **Port popup (`popup.html` / `popup.js`).** A minimal form with one input
   (default `3101`) persisted to `chrome.storage.sync`. No styling system; plain
   inline CSS.

6. **Repo hygiene.** Add `tools/jira-extension/**` to the ESLint `ignores` array so
   the extension never enters Bridge's lint/typecheck/build. Add a short
   `tools/jira-extension/README.md` with "load unpacked" install steps.

**Out of scope (explicit non-goals):**
- No inline enrichment badge, no reading of readiness / business value / quality /
  `editState` from `GET /api/tickets/[key]`.
- No CORS headers, no API token, no backend change in Bridge.
- No auto-sync of unsynced tickets (the 404 is accepted at level 0).
- No publishing to the Chrome Web Store; loaded unpacked in developer mode.
- No support for other browsers.

## Open Questions
- **Restrict to VPL keys, or any `PROJECT-123` key?** Recommended default:
  **VPL-only.** Bridge only holds VPL tickets, so a button on a non-VPL key would
  always land on Bridge's not-found page. Restricting avoids dead buttons. Easy to
  widen later if other projects get synced.
- **Button placement: header-anchored vs fixed floating.** Recommended default:
  **try a header anchor, fall back to fixed bottom-right.** Jira's issue-view DOM
  changes often and has no stable hook; the floating fallback guarantees the button
  is always present even if the preferred anchor is missing.
- **Unsynced-ticket 404 handling.** Recommended default: **accept it at level 0**
  (button just opens the link). A future level-1 follow-up could make Bridge's
  ticket page lazy-sync on 404 (`POST /api/jira/sync-tickets` with the key) so any
  Jira ticket opens cleanly.

## Implementation Plan

Self-contained Manifest V3 extension under `tools/jira-extension/`, 100% plain JS so
it stays invisible to `tsc`/`next build`. Two supporting config edits.

**Files to create (all under `tools/jira-extension/`):**
1. `parse-key.js` — pure `resolveJiraKey(loc)`. Priority: `selectedIssue` query param,
   then `/browse/<KEY>`, then a generic `[A-Z][A-Z0-9]+-\d+` match, else `null`. UMD
   dual-export (window global for the classic content script + `module.exports` for vitest).
2. `parse-key.test.js` — vitest unit tests for the parser (browse URL, selectedIssue,
   board URL with param, non-VPL key, non-ticket URL -> null, priority order, null input).
3. `content.js` — injects the "Open in Bridge" button (floating bottom-right, robust to
   Jira DOM churn), reads port from `chrome.storage.sync`, opens
   `http://localhost:<port>/tickets/<KEY>` in a new tab. SPA re-injection via patched
   `history.pushState`/`replaceState` + `popstate` + debounced `MutationObserver`. Removes
   the button when no key is present.
4. `popup.html` + `popup.js` — one numeric port input (default `3101`, validated 1-65535)
   persisted to `chrome.storage.sync`.
5. `manifest.json` — MV3; content scripts `["parse-key.js","content.js"]` (parser first)
   matched to `https://new-story.atlassian.net/*`; `action` popup; `storage` permission.
6. `README.md` — load-unpacked steps + manual-verification checklist.

**Config edits (two):**
- `eslint.config.mjs`: add `tools/jira-extension/**` to `ignores` (lint unaffected).
- `vitest.config.ts`: add `**/*.test.js` to `include` so `parse-key.test.js` runs.
- No `tsconfig` change: `.js` files are already outside `include`, so typecheck/build are
  untouched (the reason the folder is kept all-JS).

**Order:** parser -> vitest-glob edit -> parser test -> manifest -> content.js ->
popup -> eslint ignore -> README. Final: `npm run verify` + `npm run build`.

**Decision (open question):** use the **generic key match**, not VPL-only. Bridge's
`/tickets/[key]` route is project-agnostic; restricting to VPL would silently hide the
button on other projects. Generic matching is a superset that still passes the VPL cases.

**Decision (host):** target is fixed to `http://localhost:<port>` per AC3 ("prod" =
locally-run production build on 3101); no remote-host field (out of level-0 scope).

**Non-automated coverage:** button injection, SPA re-injection, and popup persistence are
DOM/extension glue verified manually in Chrome per the README; noted in the PR.

## Acceptance Criteria
- [x] An "Open in Bridge" button appears on a Jira ticket page at `new-story.atlassian.net`. <!-- tools/jira-extension/content.js injection -->
- [x] The button resolves the current ticket key from both `/browse/VPL-XXXX` URLs and `?selectedIssue=VPL-XXXX` URLs. <!-- tools/jira-extension/parse-key.js -->
- [x] Clicking the button opens `http://localhost:<port>/tickets/<KEY>` in a new tab. <!-- content.js window.open; deep-link served by src/app/(app)/tickets/[key]/page.tsx -->
- [x] The button re-appears and targets the right key after navigating between tickets without a page reload (SPA navigation). <!-- content.js history-patch + MutationObserver -->
- [x] The target port is configurable via the extension popup and persists, defaulting to `3101`. <!-- tools/jira-extension/popup.js + chrome.storage.sync -->
- [x] The button is absent on non-ticket Jira pages (no key present). <!-- content.js: remove when parse-key returns null -->
- [x] `npm run lint`, `npm run typecheck`, and `npm run build` are unaffected by the new folder. <!-- eslint.config ignores tools/jira-extension/**; no .ts files so tsconfig skips it. Verified in a clean worktree (pre-existing parallel-work type errors in src/ are unrelated). -->

## Tests
- [x] Unit test for the key parser: `/browse/VPL-47093`, `?selectedIssue=VPL-47093`, a board URL with the param, and a non-ticket URL (expect `null`). <!-- tools/jira-extension/parse-key.test.js (vitest), 8 cases pass -->
- [x] The rest (button injection, SPA re-injection, popup persistence) is DOM/extension glue verified manually in Chrome per the README; note this in the PR. <!-- manual steps documented in tools/jira-extension/README.md; Chrome load-unpacked check is a user step -->

## Related
- [[BRDG-440-restore-version-from-history]] — establishes the local-edits / version
  model that a future enrichment badge (level 1) would surface.
- `src/app/(app)/tickets/[key]/page.tsx`, `src/lib/ticket-detail-url.ts` — the
  deep-link this story links into.
- `src/components/sprint-board/useSearchActions.ts` (`navigateToKey`) — the in-app
  precedent for "open ticket by key", including the sync-first behaviour a future
  level-1 version could mirror.
- Investigation context: Bridge is local-only behind Clerk with no CORS/token,
  which is why level 0 (tab navigation) needs no backend change while level 1
  (inline badge) would require a token-authenticated, CORS-enabled read endpoint.
