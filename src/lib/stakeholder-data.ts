import type { Ticket } from "@/types/ticket";

export interface StakeholderTicket {
  title: string;
  epic: string | null;
  status: "Completed" | "In Progress" | "In Review" | "To Do";
  storyPoints: number | null;
  assignee: { name: string; initials: string } | null;
  // Null for main sprint sections; set only for upcoming section (reveal via toggle)
  jiraKey: string | null;
}

export interface StakeholderSprint {
  name: string;
  startDate: string | null;
  endDate: string | null;
  daysRemaining: number | null;
  goal: string | null;
}

function toHumanStatus(jiraStatus: string): StakeholderTicket["status"] {
  switch (jiraStatus) {
    case "DONE":
      return "Completed";
    case "IN PROGRESS":
      return "In Progress";
    case "TEST":
      return "In Review";
    default:
      return "To Do";
  }
}

export function toStakeholderTickets(tickets: Ticket[]): StakeholderTicket[] {
  return tickets.map((t) => ({
    title: t.title,
    epic: t.epic ?? null,
    status: toHumanStatus(t.jiraStatus),
    storyPoints: t.storyPoints ?? null,
    assignee: t.assignee ? { name: t.assignee.name, initials: t.assignee.initials } : null,
    jiraKey: null,
  }));
}

// Used for the upcoming section only: includes jiraKey so the "Show details" toggle can reveal it
export function toUpcomingTickets(tickets: Ticket[]): StakeholderTicket[] {
  return tickets.map((t) => ({
    title: t.title,
    epic: t.epic ?? null,
    status: toHumanStatus(t.jiraStatus),
    storyPoints: t.storyPoints ?? null,
    assignee: t.assignee ? { name: t.assignee.name, initials: t.assignee.initials } : null,
    jiraKey: t.key,
  }));
}

export function toStakeholderSprint(
  raw: { name: string; startDate: string | null; endDate: string | null },
  now: Date = new Date(),
): StakeholderSprint {
  let daysRemaining: number | null = null;
  if (raw.endDate) {
    const end = new Date(raw.endDate);
    const diff = end.getTime() - now.getTime();
    daysRemaining = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }
  return {
    name: raw.name,
    startDate: raw.startDate,
    endDate: raw.endDate,
    daysRemaining,
    goal: null,
  };
}

function groupByEpic(tickets: StakeholderTicket[]): Map<string, StakeholderTicket[]> {
  const groups = new Map<string, StakeholderTicket[]>();
  for (const t of tickets) {
    const key = t.epic ?? "Other";
    const group = groups.get(key) ?? [];
    group.push(t);
    groups.set(key, group);
  }
  return groups;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function buildMarkdownSummary(
  sprint: StakeholderSprint,
  doneTickets: StakeholderTicket[],
  inProgressTickets: StakeholderTicket[],
  todoTickets: StakeholderTicket[],
  upcomingTickets: StakeholderTicket[],
  nextSprintName: string | null,
): string {
  const lines: string[] = [];

  lines.push(`## Sprint: ${sprint.name}`);

  const dateParts: string[] = [];
  if (sprint.startDate && sprint.endDate) {
    dateParts.push(`${formatDate(sprint.startDate)} – ${formatDate(sprint.endDate)}`);
  }
  if (sprint.daysRemaining !== null) {
    dateParts.push(`${sprint.daysRemaining} day${sprint.daysRemaining === 1 ? "" : "s"} remaining`);
  }
  if (dateParts.length > 0) lines.push(dateParts.join(" | "));

  const allCurrent = [...doneTickets, ...inProgressTickets, ...todoTickets];
  const totalPoints = allCurrent.reduce((s, t) => s + (t.storyPoints ?? 0), 0);
  const donePoints = doneTickets.reduce((s, t) => s + (t.storyPoints ?? 0), 0);
  const pct = totalPoints > 0 ? Math.round((donePoints / totalPoints) * 100) : 0;
  lines.push("");
  lines.push(`### Progress`);
  lines.push(`${donePoints} of ${totalPoints} story points completed (${pct}%)`);

  if (doneTickets.length > 0) {
    lines.push("");
    lines.push("### Completed");
    for (const [epic, tickets] of groupByEpic(doneTickets)) {
      lines.push(`**${epic}**`);
      for (const t of tickets) {
        lines.push(`- ${t.title}`);
      }
    }
  }

  if (inProgressTickets.length > 0) {
    lines.push("");
    lines.push("### In Progress");
    for (const t of inProgressTickets) {
      const assigneePart = t.assignee ? ` _(${t.assignee.name})_` : "";
      lines.push(`- ${t.title}${assigneePart}`);
    }
  }

  if (todoTickets.length > 0) {
    lines.push("");
    lines.push("### To Do");
    for (const [epic, tickets] of groupByEpic(todoTickets)) {
      lines.push(`**${epic}**`);
      for (const t of tickets) {
        lines.push(`- ${t.title}`);
      }
    }
  }

  if (upcomingTickets.length > 0 && nextSprintName) {
    lines.push("");
    lines.push(`### Upcoming (${nextSprintName})`);
    for (const [epic, tickets] of groupByEpic(upcomingTickets)) {
      lines.push(`**${epic}**`);
      for (const t of tickets) {
        lines.push(`- ${t.title}`);
      }
    }
  }

  lines.push("");
  lines.push(`_Last updated: ${new Date().toLocaleString("en-GB")}_`);

  return lines.join("\n");
}
