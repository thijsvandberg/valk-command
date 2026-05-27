import { CheckSquare, Bug, Bookmark, SquareMinus, HelpCircle, Zap } from "lucide-react";
import type { IssueType } from "@/types/ticket";

const ICON_MAP: Record<IssueType, { Icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>; color: string }> = {
  task:    { Icon: CheckSquare,  color: "text-[var(--color-icon-task)]" },
  bug:     { Icon: Bug,          color: "text-[var(--color-status-error)]" },
  story:   { Icon: Bookmark,     color: "text-[var(--color-status-success)]" },
  subtask: { Icon: SquareMinus,  color: "text-[var(--color-icon-task)]" },
  spike:   { Icon: HelpCircle,   color: "text-[var(--color-status-warning)]" },
  epic:    { Icon: Zap,          color: "text-[var(--color-icon-epic)]" },
};

export function IssueTypeIcon({ type, size = 16 }: { type: IssueType | string; size?: number }) {
  const entry = ICON_MAP[type as IssueType];
  if (!entry) return null;
  const { Icon, color } = entry;
  return <Icon size={size} strokeWidth={1.5} className={color} />;
}

// Color map for use outside the icon component (e.g. backgrounds, borders)
export const ISSUE_TYPE_COLORS: Record<IssueType, string> = {
  story:   "var(--color-status-success)",
  bug:     "var(--color-status-error)",
  task:    "var(--color-icon-task)",
  subtask: "var(--color-icon-task)",
  spike:   "var(--color-status-warning)",
  epic:    "var(--color-icon-epic)",
};
