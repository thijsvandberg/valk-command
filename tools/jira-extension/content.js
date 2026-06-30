// Injects an "Open in Bridge" button on Jira ticket pages. Level 0: a plain tab
// navigation to Bridge's deep-link, no API calls. resolveJiraKey is provided by
// parse-key.js (loaded first in the manifest's content_scripts list).

(function () {
  const HOST_ID = "bridge-open-button";
  const DEFAULT_PORT = 3101;
  const DEBOUNCE_MS = 200;
  // Stable testid for the issue summary heading; the toolbar (+ / apps / AI
  // buttons) sits in the row directly below it. Anchoring to the heading avoids
  // Jira's hashed emotion class names, which change between releases.
  const TITLE_SELECTOR = '[data-testid="issue.views.issue-base.foundation.summary.heading"]';
  // Below this viewport y the toolbar is behind Jira's top nav; float instead.
  const TOP_NAV_GUARD = 60;

  let host = null;
  let debounceTimer = null;

  function currentKey() {
    return typeof resolveJiraKey === "function" ? resolveJiraKey(window.location) : null;
  }

  // The right edge + top of the issue-header toolbar cluster (the +, apps and AI
  // buttons), found by walking the contiguous run of buttons just below the
  // title. Returns null when the header/toolbar is not on the page. The cluster
  // walk stops at the first big horizontal gap so far-right header actions (watch,
  // share, ...) are excluded, and the button's own host is skipped to avoid a
  // feedback loop where it keeps pushing its own anchor rightward.
  function toolbarAnchor() {
    const title = document.querySelector(TITLE_SELECTOR);
    if (!title) return null;
    const below = title.getBoundingClientRect().bottom;
    const rects = Array.from(document.querySelectorAll("button"))
      .map((b) => b.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.top > below - 6 && r.top < below + 60)
      .sort((a, b) => a.left - b.left);
    if (!rects.length) return null;
    let right = rects[0].right;
    const top = rects[0].top;
    const height = rects[0].height;
    for (let i = 1; i < rects.length; i++) {
      if (rects[i].left - right <= 20) right = Math.max(right, rects[i].right);
      else break;
    }
    return { right, top, height };
  }

  function ensureHost() {
    if (host && document.body.contains(host)) return host;
    host = document.createElement("div");
    host.id = HOST_ID;
    host.style.cssText = "position:fixed;z-index:2147483646;margin:0;padding:0;border:0";
    // Shadow DOM isolates the button from Jira's aggressive global `button {}`
    // rules (which otherwise force display/width and break the layout).
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML =
      "<style>" +
      ":host{all:initial}" +
      "button{display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 13px;" +
      "border:1px solid #6dd4d1;border-radius:8px;background:#0e8e88;color:#fff;" +
      'font:600 13px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;' +
      "letter-spacing:.01em;cursor:pointer;white-space:nowrap;" +
      "box-shadow:0 2px 8px rgba(5,64,61,.28);" +
      "transition:background-color 120ms ease,transform 120ms cubic-bezier(.34,1.56,.64,1),box-shadow 120ms ease}" +
      "button:hover{background:#0a736e;transform:translateY(-1px);box-shadow:0 6px 16px rgba(5,64,61,.32)}" +
      "button:focus-visible{outline:2px solid #6dd4d1;outline-offset:2px}" +
      "button:active{background:#075854;transform:translateY(0)}" +
      "i{width:7px;height:7px;border-radius:50%;background:#6dd4d1}" +
      "</style>" +
      '<button type="button"><i></i>Open in Bridge</button>';
    const btn = shadow.querySelector("button");
    btn.addEventListener("click", () => openInBridge(currentKey()));
    document.body.appendChild(host);
    return host;
  }

  function openInBridge(key) {
    if (!key) return;
    chrome.storage.sync.get({ port: DEFAULT_PORT }, (res) => {
      const port = (res && res.port) || DEFAULT_PORT;
      window.open(`http://localhost:${port}/tickets/${key}`, "_blank", "noopener");
    });
  }

  // Place the button next to the header toolbar when it is found and clear of
  // Jira's top nav; otherwise fall back to a fixed bottom-right floating button so
  // it is always reachable even when Jira's DOM shifts.
  function place(h) {
    const a = toolbarAnchor();
    if (a && a.top >= TOP_NAV_GUARD) {
      h.style.top = `${a.top}px`;
      h.style.left = `${a.right + 8}px`;
      h.style.right = "auto";
      h.style.bottom = "auto";
    } else {
      h.style.top = "auto";
      h.style.left = "auto";
      h.style.right = "20px";
      h.style.bottom = "20px";
    }
  }

  function removeHost() {
    if (host) host.remove();
    host = null;
  }

  function sync() {
    const key = currentKey();
    if (key) {
      const h = ensureHost();
      h.shadowRoot.querySelector("button").title = `Open ${key} in Bridge`;
      place(h);
    } else {
      removeHost();
    }
  }

  function scheduleSync() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(sync, DEBOUNCE_MS);
  }

  // Jira is a SPA: route changes don't reload. Patch history + popstate, with a
  // debounced MutationObserver as a fallback for navigations that bypass both.
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
  // Re-place on scroll/resize so the button stays glued to the toolbar. Capture
  // phase catches Jira's inner scroll containers, not just the window.
  const reposition = () => {
    if (host) place(host);
  };
  window.addEventListener("scroll", reposition, true);
  window.addEventListener("resize", reposition, true);

  const start = () => {
    new MutationObserver(scheduleSync).observe(document.body, { childList: true, subtree: true });
    sync();
  };
  if (document.body) start();
  else window.addEventListener("DOMContentLoaded", start, { once: true });
})();
