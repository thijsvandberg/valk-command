import type { Assignee } from "@/types/ticket";

export function userInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

export function userColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 50%)`;
}

// Builds the display Assignee shape from a stored name, deriving initials + a
// stable color. Returns null for an absent assignee. The optional accountId
// (BRDG-365) carries the stable Jira identity for rename-proof matching;
// name-only callers omit it and get accountId: null.
export function buildAssignee(
  name: string | null | undefined,
  accountId?: string | null,
): Assignee | null {
  if (!name) return null;
  return { name, initials: userInitials(name), color: userColor(name), accountId: accountId ?? null };
}
