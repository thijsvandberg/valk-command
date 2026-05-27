import type { Sprint } from "@/types/ticket";

export function computeWorkingDays(sprint: Sprint | undefined): { remaining: number | null; total: number | null } {
  if (!sprint || sprint.state !== "active" || !sprint.startDate || !sprint.endDate) return { remaining: null, total: null };
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const start = new Date(sprint.startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(sprint.endDate);
  end.setHours(0, 0, 0, 0);
  let total = 0;
  const d1 = new Date(start);
  while (d1 <= end) { if (d1.getDay() !== 0 && d1.getDay() !== 6) total++; d1.setDate(d1.getDate() + 1); }
  let remaining = 0;
  if (end >= now) {
    const d2 = new Date(now);
    while (d2 <= end) { if (d2.getDay() !== 0 && d2.getDay() !== 6) remaining++; d2.setDate(d2.getDate() + 1); }
  }
  return { remaining, total };
}
