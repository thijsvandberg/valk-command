import { getJiraUrl } from "@/lib/jira-url";

/** Single ticket: `Title - URL` */
export function formatTicketShare(title: string, key: string): string {
  return `${title} - ${getJiraUrl(key)}`;
}

/** Multiple tickets: one `Title - URL` per line (no list bullet) */
export function formatTicketsShare(tickets: { title: string; key: string }[]): string {
  return tickets.map((t) => formatTicketShare(t.title, t.key)).join("\n");
}
