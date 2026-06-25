import "server-only";

import { getRequestId } from "@/lib/request-context";

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type Level = keyof typeof LEVELS;

// Uppercase token placed in every line so a level is greppable from the text
// alone (`grep ERROR`), not just inferable from which console method fired.
const LEVEL_TOKEN: Record<Level, string> = {
  debug: "DEBUG",
  info: "INFO",
  warn: "WARN",
  error: "ERROR",
};

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
  // Append the correlation id when a request context is active so an error line
  // can be tied back to its access-log line; outside a request it is omitted and
  // the line reads exactly as before.
  const reqId = getRequestId();
  const suffix = reqId ? ` reqId=${reqId}` : "";
  const prefix = `${timestamp()} ${LEVEL_TOKEN[method]} [${tag}] ${message}${suffix}`;
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
