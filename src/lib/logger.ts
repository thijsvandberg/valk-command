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

// Local time in "YYYY-MM-DD HH:MM:SS" to match the [start-prod] log marker,
// so app log lines and the process start line read on the same clock.
function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function log(method: Level, tag: string, message: string, ...args: unknown[]) {
  if (LEVELS[method] < currentLevel) return;
  const prefix = `${timestamp()} [${tag}] ${message}`;
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
