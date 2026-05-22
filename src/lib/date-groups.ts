import type { Conversation } from "@/types/chat";

export type DateGroupLabel = "Today" | "Yesterday" | "This week" | "This month" | "Older";

export interface DateGroup {
  label: DateGroupLabel;
  conversations: Conversation[];
}

export function groupByDate(conversations: Conversation[]): DateGroup[] {
  const now = new Date();
  const todayStr = now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toDateString();

  // Start of current week (Monday)
  const weekStart = new Date(now);
  const dayOfWeek = weekStart.getDay();
  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  weekStart.setDate(weekStart.getDate() - diff);
  weekStart.setHours(0, 0, 0, 0);

  // Start of current month
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const groups: Record<DateGroupLabel, Conversation[]> = {
    "Today": [],
    "Yesterday": [],
    "This week": [],
    "This month": [],
    "Older": [],
  };

  for (const conv of conversations) {
    const d = new Date(conv.createdAt);
    const dateStr = d.toDateString();

    if (dateStr === todayStr) {
      groups["Today"].push(conv);
    } else if (dateStr === yesterdayStr) {
      groups["Yesterday"].push(conv);
    } else if (d >= weekStart) {
      groups["This week"].push(conv);
    } else if (d >= monthStart) {
      groups["This month"].push(conv);
    } else {
      groups["Older"].push(conv);
    }
  }

  const ordered: DateGroupLabel[] = ["Today", "Yesterday", "This week", "This month", "Older"];
  return ordered
    .filter((label) => groups[label].length > 0)
    .map((label) => ({ label, conversations: groups[label] }));
}
