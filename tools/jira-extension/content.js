// Injects an "Open in Bridge" button on Jira ticket pages. Level 0: a plain tab
// navigation to Bridge's deep-link, no API calls. resolveJiraKey is provided by
// parse-key.js (loaded first in the manifest's content_scripts list).

(function () {
  const BUTTON_ID = "bridge-open-button";
  const STYLE_ID = "bridge-open-button-style";
  const DEFAULT_PORT = 3101;
  const DEBOUNCE_MS = 200;

  let debounceTimer = null;

  function currentKey() {
    return typeof resolveJiraKey === "function" ? resolveJiraKey(window.location) : null;
  }

  // :hover/:focus-visible/:active can't live on an inline style attribute, so the
  // button's interactive states are injected once as a stylesheet.
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
#${BUTTON_ID} {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 2147483647;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border: none;
  border-radius: 10px;
  background: #0e8e88;
  color: #ffffff;
  font: 600 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  letter-spacing: 0.01em;
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(5, 64, 61, 0.28), 0 1px 2px rgba(5, 64, 61, 0.20);
  transition: transform 120ms cubic-bezier(0.34, 1.56, 0.64, 1), background-color 120ms ease, box-shadow 120ms ease;
}
#${BUTTON_ID}:hover {
  background: #0a736e;
  transform: translateY(-1px);
  box-shadow: 0 10px 24px rgba(5, 64, 61, 0.32), 0 1px 2px rgba(5, 64, 61, 0.20);
}
#${BUTTON_ID}:focus-visible {
  outline: 2px solid #6dd4d1;
  outline-offset: 2px;
}
#${BUTTON_ID}:active {
  transform: translateY(0);
  background: #075854;
  box-shadow: 0 4px 12px rgba(5, 64, 61, 0.28);
}
#${BUTTON_ID}::before {
  content: "";
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #6dd4d1;
}`;
    document.documentElement.appendChild(style);
  }

  function openInBridge(key) {
    if (!key) return;
    chrome.storage.sync.get({ port: DEFAULT_PORT }, (res) => {
      const port = res && res.port ? res.port : DEFAULT_PORT;
      window.open(`http://localhost:${port}/tickets/${key}`, "_blank", "noopener");
    });
  }

  function render(key) {
    ensureStyle();
    let btn = document.getElementById(BUTTON_ID);
    if (!btn) {
      btn = document.createElement("button");
      btn.id = BUTTON_ID;
      btn.type = "button";
      btn.textContent = "Open in Bridge";
      // Read the key at click time so SPA updates never fire a stale target.
      btn.addEventListener("click", () => openInBridge(btn.dataset.key));
      document.body.appendChild(btn);
    }
    btn.dataset.key = key;
    btn.title = `Open ${key} in Bridge`;
  }

  function removeButton() {
    const btn = document.getElementById(BUTTON_ID);
    if (btn) btn.remove();
  }

  function sync() {
    const key = currentKey();
    if (key) render(key);
    else removeButton();
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

  const start = () => {
    new MutationObserver(scheduleSync).observe(document.body, { childList: true, subtree: true });
    sync();
  };
  if (document.body) start();
  else window.addEventListener("DOMContentLoaded", start, { once: true });
})();
