// Persists the target Bridge port to chrome.storage.sync. Default 3101 (the local
// production build); 3100 is the dev server.

const DEFAULT_PORT = 3101;

const portInput = document.getElementById("port");
const statusEl = document.getElementById("status");

chrome.storage.sync.get({ port: DEFAULT_PORT }, (res) => {
  portInput.value = res && res.port ? res.port : DEFAULT_PORT;
});

document.getElementById("save").addEventListener("click", () => {
  const parsed = parseInt(portInput.value, 10);
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535;
  const port = valid ? parsed : DEFAULT_PORT;
  chrome.storage.sync.set({ port }, () => {
    portInput.value = port;
    statusEl.textContent = valid ? `Saved port ${port}` : `Invalid port, reset to ${port}`;
  });
});
