import type { ChangelogResponse } from "@/app/api/reports/changelog/route";

function formatDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return iso;
  }
}

export function buildChangelogMarkdown(
  data: ChangelogResponse,
  excludeKeys: Set<string> = new Set(),
): string {
  const lines: string[] = [];

  lines.push(`# Release Notes: ${data.sprint.name}`);
  lines.push("");

  const start = formatDate(data.sprint.startDate);
  const end = formatDate(data.sprint.endDate);
  if (start && end) lines.push(`${start} - ${end}`);
  else if (start) lines.push(`From ${start}`);
  lines.push("");

  const { completedPoints, completedTickets } = data.velocityStats;
  lines.push(
    `**Velocity:** ${completedPoints > 0 ? `${completedPoints} story points across ` : ""}${completedTickets} completed ticket${completedTickets !== 1 ? "s" : ""}`,
  );
  lines.push("");
  lines.push("---");
  lines.push("");

  let hasAnyTicket = false;

  for (const group of data.epicGroups) {
    const groupTickets = group.tickets.filter((t) => !excludeKeys.has(t.key));
    if (groupTickets.length === 0) continue;

    hasAnyTicket = true;
    lines.push(`## ${group.epic}`);
    lines.push("");

    for (const ticket of groupTickets) {
      lines.push(`### ${ticket.title}`);
      if (ticket.description) {
        lines.push("");
        lines.push(ticket.description);
      }
      if (ticket.prs.length > 0) {
        lines.push("");
        for (const pr of ticket.prs) {
          lines.push(`- [${pr.title}](${pr.url})`);
        }
      }
      lines.push("");
    }
  }

  if (!hasAnyTicket) {
    lines.push("_No completed tickets in this sprint._");
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

export function buildChangelogPlainText(
  data: ChangelogResponse,
  excludeKeys: Set<string> = new Set(),
): string {
  const lines: string[] = [];

  lines.push(`Release Notes: ${data.sprint.name}`);
  lines.push("=".repeat(`Release Notes: ${data.sprint.name}`.length));
  lines.push("");

  const start = formatDate(data.sprint.startDate);
  const end = formatDate(data.sprint.endDate);
  if (start && end) lines.push(`${start} - ${end}`);
  else if (start) lines.push(`From ${start}`);
  lines.push("");

  const { completedPoints, completedTickets } = data.velocityStats;
  lines.push(
    `Velocity: ${completedPoints > 0 ? `${completedPoints} story points across ` : ""}${completedTickets} completed ticket${completedTickets !== 1 ? "s" : ""}`,
  );
  lines.push("");

  let hasAnyTicket = false;

  for (const group of data.epicGroups) {
    const groupTickets = group.tickets.filter((t) => !excludeKeys.has(t.key));
    if (groupTickets.length === 0) continue;

    hasAnyTicket = true;
    lines.push(group.epic.toUpperCase());
    lines.push("");

    for (const ticket of groupTickets) {
      lines.push(`* ${ticket.title}`);
      if (ticket.description) {
        lines.push(`  ${ticket.description}`);
      }
      lines.push("");
    }
  }

  if (!hasAnyTicket) {
    lines.push("No completed tickets in this sprint.");
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}
