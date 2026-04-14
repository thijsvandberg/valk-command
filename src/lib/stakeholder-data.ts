import type { Ticket } from "@/types/ticket";

export interface StakeholderTicket {
  title: string;
  epic: string | null;
  /** Normalized ticket type for visual differentiation */
  type: "story" | "bug" | "spike" | "task";
  status: "Completed" | "In Progress" | "In Review" | "To Do" | "Deprecated";
  storyPoints: number | null;
  assignee: { name: string; initials: string } | null;
  // Null for main sprint sections; set only for upcoming section (reveal via toggle)
  jiraKey: string | null;
}

export interface StakeholderSprint {
  name: string;
  /** Jira state: "active" | "future" | "closed" */
  state: string;
  startDate: string | null;
  endDate: string | null;
  /** Number of Mon–Fri working days from today to end date. Null for closed/future sprints. */
  workingDaysRemaining: number | null;
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
    case "DEPRECATED":
      return "Deprecated";
    default:
      return "To Do";
  }
}

function countWorkingDaysRemaining(endDate: Date, now: Date): number {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  if (end < today) return 0;
  let count = 0;
  const d = new Date(today);
  while (d <= end) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

function toTicketType(raw: string): StakeholderTicket["type"] {
  switch (raw) {
    case "bug": return "bug";
    case "spike": return "spike";
    case "story": return "story";
    default: return "task";
  }
}

export function toStakeholderTickets(tickets: Ticket[]): StakeholderTicket[] {
  return tickets.map((t) => ({
    title: t.title,
    epic: t.epic ?? null,
    type: toTicketType(t.type),
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
    type: toTicketType(t.type),
    status: toHumanStatus(t.jiraStatus),
    storyPoints: t.storyPoints ?? null,
    assignee: t.assignee ? { name: t.assignee.name, initials: t.assignee.initials } : null,
    jiraKey: t.key,
  }));
}

export function toStakeholderSprint(
  raw: { name: string; state: string; startDate: string | null; endDate: string | null },
  now: Date = new Date(),
): StakeholderSprint {
  // Only show days remaining for the active sprint
  const workingDaysRemaining =
    raw.state === "active" && raw.endDate
      ? countWorkingDaysRemaining(new Date(raw.endDate), now)
      : null;

  return {
    name: raw.name,
    state: raw.state,
    startDate: raw.startDate,
    endDate: raw.endDate,
    workingDaysRemaining,
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
  if (sprint.workingDaysRemaining !== null) {
    dateParts.push(`${sprint.workingDaysRemaining} working day${sprint.workingDaysRemaining === 1 ? "" : "s"} remaining`);
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
