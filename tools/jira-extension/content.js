// Injects an "Open in Bridge" button on Jira ticket pages. Level 0: a plain link
// to Bridge's deep-link, no API calls. resolveJiraKey is provided by parse-key.js
// (loaded first in the manifest's content_scripts list).

(function () {
  const HOST_ID = "bridge-open-button";
  const DEFAULT_PORT = 3101;
  const DEBOUNCE_MS = 200;
  // Stable testid prefix for the issue-header "+/apps/AI" quick-add buttons. Their
  // flex-row container is the toolbar we insert into; anchoring here avoids Jira's
  // hashed emotion class names, which change between releases.
  const QUICK_ADD_SELECTOR = '[data-testid^="issue-view-foundation.quick-add"]';

  let host = null;
  let port = DEFAULT_PORT;
  let debounceTimer = null;

  function currentKey() {
    return typeof resolveJiraKey === "function" ? resolveJiraKey(window.location) : null;
  }

  function isFlexRow(el) {
    const c = getComputedStyle(el);
    return (c.display === "flex" || c.display === "inline-flex") && c.flexDirection === "row";
  }

  // The flex row holding the header toolbar buttons. We climb from a quick-add
  // button to its nearest flex-row ancestor, then keep climbing while the parent
  // is still a small flex row, to land on the row that holds the whole cluster
  // (+/apps/AI). Inserting here means the button is part of the page flow and
  // scrolls natively with the toolbar (no position:fixed, no scroll-tracking, no
  // jitter). Returns null on non-ticket pages where there is no toolbar.
  function toolbarRow() {
    const anchor = document.querySelector(QUICK_ADD_SELECTOR);
    if (!anchor) return null;
    let row = anchor.parentElement;
    while (row && !isFlexRow(row)) row = row.parentElement;
    if (!row) return null;
    while (
      row.parentElement &&
      isFlexRow(row.parentElement) &&
      row.parentElement.querySelectorAll("button").length <= 8
    ) {
      row = row.parentElement;
    }
    return row;
  }

  function ensureHost() {
    if (host && host.isConnected) return host;
    host = document.createElement("div");
    host.id = HOST_ID;
    // Shadow DOM isolates the button from Jira's aggressive global `button {}` /
    // layout rules. The look mirrors Jira's subtle outlined toolbar buttons, tinted
    // with the Bridge teal.
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML =
      "<style>" +
      ":host{all:initial;display:inline-flex;align-items:center}" +
      "a{display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 11px;box-sizing:border-box;" +
      "border:1px solid rgba(14,142,136,.32);border-radius:3px;background:transparent;color:#0a736e;text-decoration:none;" +
      'font:500 14px/1 "Atlassian Sans",ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;' +
      "cursor:pointer;white-space:nowrap;transition:background-color 120ms ease,border-color 120ms ease}" +
      "a:hover{background:rgba(14,142,136,.09);border-color:rgba(14,142,136,.55)}" +
      "a:focus-visible{outline:2px solid rgba(14,142,136,.55);outline-offset:2px}" +
      "a:active{background:rgba(14,142,136,.16)}" +
      "i{width:7px;height:7px;border-radius:50%;background:#0e8e88;flex:none}" +
      "</style>" +
      '<a target="_blank" rel="noopener"><i></i>Open in Bridge</a>';
    return host;
  }

  function removeHost() {
    if (host) host.remove();
    host = null;
  }

  // Inline in the toolbar row when present; otherwise a fixed bottom-right floating
  // button so it stays reachable on layouts where the toolbar can't be found. Both
  // are static once placed (the inline one rides the page's native scroll), so
  // neither jitters.
  function placeInline(h, row) {
    if (h.parentElement === row && h.dataset.mode === "inline") return;
    h.dataset.mode = "inline";
    h.style.cssText = "margin-left:6px;align-self:center";
    row.appendChild(h);
  }

  function placeFloating(h) {
    if (h.parentElement === document.body && h.dataset.mode === "float") return;
    h.dataset.mode = "float";
    h.style.cssText =
      "position:fixed;right:20px;bottom:20px;z-index:2147483646;" +
      "background:#fff;border-radius:3px;box-shadow:0 2px 8px rgba(5,64,61,.28)";
    document.body.appendChild(h);
  }

  function sync() {
    const key = currentKey();
    if (!key) {
      removeHost();
      return;
    }
    const h = ensureHost();
    const a = h.shadowRoot.querySelector("a");
    a.href = `http://localhost:${port}/tickets/${key}`;
    a.title = `Open ${key} in Bridge`;
    const row = toolbarRow();
    if (row) placeInline(h, row);
    else placeFloating(h);
  }

  function scheduleSync() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(sync, DEBOUNCE_MS);
  }

  // Jira is a SPA: route changes don't reload, and it re-renders the toolbar (which
  // drops our injected node). Patch history + popstate and run a debounced
  // MutationObserver so the button is re-detected and re-inserted on navigation and
  // on toolbar re-renders. Re-insertion only happens on actual DOM changes, not on
  // scroll, so there is no scroll jitter.
  function patchHistory() {
    const wrap = (original) =>
      function () {
        const result = original.apply(this, arguments);
        scheduleSync();
        return result;
      };
    history.pushState = wrap(history.pushState);
    history.replaceState = wrap(history.replaceState);
    window.addEventListener("popstate", scheduleSync);
  }

  patchHistory();

  // Read the configured port, then keep it in sync if the popup changes it.
  chrome.storage.sync.get({ port: DEFAULT_PORT }, (res) => {
    port = (res && res.port) || DEFAULT_PORT;
    sync();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.port) {
      port = changes.port.newValue || DEFAULT_PORT;
      sync();
    }
  });

  const start = () => {
    new MutationObserver(scheduleSync).observe(document.body, { childList: true, subtree: true });
    sync();
  };
  if (document.body) start();
  else window.addEventListener("DOMContentLoaded", start, { once: true });
})();
