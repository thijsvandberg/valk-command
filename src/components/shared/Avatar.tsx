import { User } from "lucide-react";
import type { Assignee } from "@/types/ticket";

export function Avatar({ assignee, size = 24 }: { assignee: Assignee | null; size?: number }) {
  const iconSize = size * 0.55;

  if (!assignee) {
    return (
      <div
        className="flex items-center justify-center rounded-full border border-white/[0.06] bg-white/[0.03]"
        style={{ width: size, height: size }}
      >
        <User className="text-white/15" style={{ width: iconSize, height: iconSize }} strokeWidth={1.5} />
      </div>
    );
  }
  return (
    <div
      className="flex items-center justify-center rounded-full font-semibold text-white"
      style={{ backgroundColor: assignee.color, width: size, height: size, fontSize: size * 0.38 }}
      title={assignee.name}
    >
      {assignee.initials}
    </div>
  );
}
