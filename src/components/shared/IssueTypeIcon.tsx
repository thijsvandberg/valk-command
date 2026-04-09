import { CheckSquare, Bug, Bookmark, SquareMinus, HelpCircle, Zap } from "lucide-react";
import type { IssueType } from "@/types/ticket";

const ICON_MAP: Record<IssueType, { Icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>; color: string }> = {
  task:    { Icon: CheckSquare,  color: "text-[#4a90d9]" },
  bug:     { Icon: Bug,          color: "text-[#e5534b]" },
  story:   { Icon: Bookmark,     color: "text-[#4aaa60]" },
  subtask: { Icon: SquareMinus,  color: "text-[#4a90d9]" },
  spike:   { Icon: HelpCircle,   color: "text-[#f97316]" },
  epic:    { Icon: Zap,          color: "text-[#9b6cd4]" },
};

export function IssueTypeIcon({ type, size = 16 }: { type: IssueType | string; size?: number }) {
  const entry = ICON_MAP[type as IssueType];
  if (!entry) return null;
  const { Icon, color } = entry;
  return <Icon size={size} strokeWidth={1.5} className={color} />;
}

// Color map for use outside the icon component (e.g. backgrounds, borders)
export const ISSUE_TYPE_COLORS: Record<IssueType, string> = {
  story:   "#4aaa60",
  bug:     "#e5534b",
  task:    "#4a90d9",
  subtask: "#4a90d9",
  spike:   "#f97316",
  epic:    "#9b6cd4",
};
