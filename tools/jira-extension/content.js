// Injects an "Open in Bridge" button on Jira ticket pages. Level 0: a plain link
// to Bridge's deep-link, no API calls. resolveJiraKey is provided by parse-key.js
// (loaded first in the manifest's content_scripts list).

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
  let port = DEFAULT_PORT;
  let debounceTimer = null;

  function currentKey() {
    return typeof resolveJiraKey === "function" ? resolveJiraKey(window.location) : null;
  }

  // The right edge + top of the issue-header toolbar cluster (the +, apps and AI
  // buttons), found by walking the contiguous run of buttons just below the
  // title. Returns null when the header/toolbar is not on the page. The cluster
  // walk stops at the first big horizontal gap so far-right header actions (watch,
  // share, ...) are excluded.
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
    for (let i = 1; i < rects.length; i++) {
      if (rects[i].left - right <= 20) right = Math.max(right, rects[i].right);
      else break;
    }
    return { right, top };
  }

  function ensureHost() {
    if (host && document.body.contains(host)) return host;
    host = document.createElement("div");
    host.id = HOST_ID;
    host.style.cssText =
      "position:fixed;z-index:2147483646;display:inline-block;width:max-content;height:max-content;margin:0;padding:0;border:0";
    // Shadow DOM isolates the button from Jira's aggressive global `button {}`
    // rules (which otherwise force display/width and break the layout). The look
    // mirrors Jira's subtle outlined toolbar buttons, tinted with the Bridge teal.
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML =
      "<style>" +
      ":host{all:initial}" +
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
    document.body.appendChild(host);
    return host;
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

  // A real anchor (not window.open) so middle-click / cmd-click / "copy link" all
  // work; the href carries the configured port and the current key.
  function sync() {
    const key = currentKey();
    if (key) {
      const h = ensureHost();
      const a = h.shadowRoot.querySelector("a");
      a.href = `http://localhost:${port}/tickets/${key}`;
      a.title = `Open ${key} in Bridge`;
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
