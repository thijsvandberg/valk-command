import "server-only";

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type Level = keyof typeof LEVELS;

// Read once at module init; runtime changes have no effect
function resolveLevel(): number {
  const env = process.env.LOG_LEVEL as Level | undefined;
  if (env && env in LEVELS) return LEVELS[env];
  return process.env.NODE_ENV === "production" ? LEVELS.info : LEVELS.debug;
}

let currentLevel = resolveLevel();

// Exported for test isolation only
export function _setLevel(level: Level) {
  currentLevel = LEVELS[level];
}

function log(method: Level, tag: string, message: string, ...args: unknown[]) {
  if (LEVELS[method] < currentLevel) return;
  const prefix = `[${tag}] ${message}`;
  switch (method) {
    case "debug": console.debug(prefix, ...args); break;
    case "info":  console.log(prefix, ...args);   break;
    case "warn":  console.warn(prefix, ...args);  break;
    case "error": console.error(prefix, ...args); break;
  }
}

export const logger = {
  debug: (tag: string, message: string, ...args: unknown[]) => log("debug", tag, message, ...args),
  info:  (tag: string, message: string, ...args: unknown[]) => log("info",  tag, message, ...args),
  warn:  (tag: string, message: string, ...args: unknown[]) => log("warn",  tag, message, ...args),
  error: (tag: string, message: string, ...args: unknown[]) => log("error", tag, message, ...args),
};
