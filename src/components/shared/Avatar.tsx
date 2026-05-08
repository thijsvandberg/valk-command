import { User } from "lucide-react";
import type { Assignee } from "@/types/ticket";

export function Avatar({ assignee, size = 24 }: { assignee: Assignee | null; size?: number }) {
  const iconSize = size * 0.55;

  if (!assignee) {
    return (
      <div
        className="flex items-center justify-center rounded-full border border-border-default bg-overlay-subtle"
        style={{ width: size, height: size }}
      >
        <User className="text-text-muted" style={{ width: iconSize, height: iconSize }} strokeWidth={1.5} />
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
