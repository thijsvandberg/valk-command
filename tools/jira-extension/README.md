# Open in Bridge (Jira Chrome extension)

A tiny Manifest V3 Chrome extension that adds an **"Open in Bridge"** button to Jira
ticket pages at `new-story.atlassian.net`. Clicking it opens the same ticket in the
local Bridge app via its deep-link (`/tickets/<KEY>`), reusing your existing Bridge
login (Clerk session) in a normal browser tab.

This is **level 0**: just a navigation button. No enrichment badge, no Bridge API
calls, no backend change. The folder is plain JS with no build step and is excluded
from Bridge's lint/typecheck/build.

## Install (load unpacked)

1. Open `chrome://extensions`.
2. Toggle **Developer mode** on (top-right).
3. Click **Load unpacked** and select this folder (`tools/jira-extension/`).
4. (Optional) Click the extension icon to set the **Bridge port**. Default is `3101`
   (the local production build, `npm start`); use `3100` for the dev server
   (`npm run dev`).

## How it works

- `parse-key.js` resolves the current Jira key from the URL (`selectedIssue` query
  param, `/browse/<KEY>`, or a generic `PROJECT-123` match). Pure and unit-tested.
- `content.js` injects the button into the issue header, next to the +/apps/AI
  action buttons under the title (anchored by tracking that toolbar's position; it
  lives in a Shadow DOM so Jira's global CSS can't touch it, and is styled to match
  Jira's subtle outlined toolbar buttons with a Bridge-teal accent). If that toolbar
  can't be found it falls back to a fixed bottom-right floating button. It is a real
  `<a href="http://localhost:<port>/tickets/<KEY>" target="_blank">` link (so
  middle-click / cmd-click / copy-link work), with the port read from
  `chrome.storage.sync`. It re-detects the key on Jira's SPA navigations (patched
  `history` + debounced `MutationObserver`), repositions on scroll/resize, updates
  the href when the port changes, and removes the button on non-ticket pages.
- `popup.html` / `popup.js` store the port.

## Manual verification

Automated coverage is limited to the key parser (`parse-key.test.js`, run via
`npm run test`). The DOM/extension glue is verified manually:

1. Load unpacked, then open a ticket: `https://new-story.atlassian.net/browse/VPL-47093`.
   The "Open in Bridge" button appears in the header, next to the +/apps/AI buttons
   under the title.
2. Click it: a new tab opens `http://localhost:<port>/tickets/VPL-47093`.
3. Navigate to another issue without reloading (click a linked ticket, or use a board
   and select a different card). The button stays and targets the new key.
4. Open a non-ticket page (e.g. `/jira/your-work`). The button disappears.
5. Open the popup, change the port, Save. Reopen a ticket and confirm the new port is
   used in the opened URL.
