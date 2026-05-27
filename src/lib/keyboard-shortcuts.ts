export interface ShortcutEntry {
  keys: string[];
  action: string;
}

export interface ShortcutGroup {
  scope: string;
  shortcuts: ShortcutEntry[];
}

const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform ?? "");

const mod = isMac ? "\u2318" : "Ctrl";

export const KEYBOARD_SHORTCUTS: ShortcutGroup[] = [
  {
    scope: "Global",
    shortcuts: [
      { keys: [mod, "K"], action: "Open Command Palette" },
      { keys: [mod, "Shift", "K"], action: "Search Epics" },
    ],
  },
  {
    scope: "Command Palette",
    shortcuts: [
      { keys: ["\u2191", "\u2193"], action: "Navigate results" },
      { keys: ["Enter"], action: "Open selected result" },
      { keys: ["Esc"], action: "Close" },
    ],
  },
  {
    scope: "Ticket Detail",
    shortcuts: [
      { keys: ["["], action: "Toggle sidebar" },
    ],
  },
  {
    scope: "Pipelines",
    shortcuts: [
      { keys: ["R"], action: "Refresh pipelines" },
      { keys: ["F"], action: "Cycle status filter" },
      { keys: ["S"], action: "Toggle sprint filter" },
    ],
  },
];
