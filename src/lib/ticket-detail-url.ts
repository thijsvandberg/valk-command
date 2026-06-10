import type { TicketTab } from "@/components/ticket-detail/TicketTabContent";

// URL state for the ticket detail view (BRDG-329): the open child panel and the
// active tab live in query params (?ticket=, ?tab=) so refresh, share and
// back/forward reproduce the exact view. Mirrors buildBoardUrl in sprint-utils.

// Tabs that do not exist for a ticket type (e.g. ?tab=development on an epic)
// must fall back to the default rather than render a blank pane, so resolution
// is per-type. Mirrors the tab-bar availability rules in TicketTabContent.
export function availableTicketTabs(type: string): readonly TicketTab[] {
  if (type === "epic") return ["children", "content", "history"];
  if (type === "subtask") return ["content", "history"];
  return ["content", "history", "review", "development"];
}

// Epics lead with their child-issue breakdown; everything else lands on Content.
export function defaultTicketTab(type: string): TicketTab {
  return type === "epic" ? "children" : "content";
}

// Invalid, stale, or type-unavailable ?tab= values degrade to the default tab.
export function resolveTicketTab(param: string | null | undefined, type: string): TicketTab {
  if (param && (availableTicketTabs(type) as readonly string[]).includes(param)) {
    return param as TicketTab;
  }
  return defaultTicketTab(type);
}

export function buildTicketDetailUrl(
  routeKey: string,
  opts: { ticket?: string | null; tab?: string | null } = {},
): string {
  const sp = new URLSearchParams();
  if (opts.ticket) sp.set("ticket", opts.ticket);
  if (opts.tab) sp.set("tab", opts.tab);
  const qs = sp.toString();
  const path = `/tickets/${encodeURIComponent(routeKey)}`;
  return qs ? `${path}?${qs}` : path;
}
