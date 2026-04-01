import { CheckSquare, Bug, Bookmark, SquareMinus } from "lucide-react";
import type { IssueType } from "@/types/ticket";

const ICON_MAP: Record<IssueType, { Icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>; color: string }> = {
  task:    { Icon: CheckSquare,  color: "text-[#4a90d9]" },
  bug:     { Icon: Bug,          color: "text-[#e5534b]" },
  story:   { Icon: Bookmark,     color: "text-[#4aaa60]" },
  subtask: { Icon: SquareMinus,  color: "text-[#4a90d9]" },
};

export function IssueTypeIcon({ type, size = 16 }: { type: IssueType; size?: number }) {
  const entry = ICON_MAP[type];
  if (!entry) return null;
  const { Icon, color } = entry;
  return <Icon size={size} strokeWidth={1.5} className={color} />;
}
