import { User } from "lucide-react";
import type { Assignee } from "@/types/ticket";

export function Avatar({ assignee, size = 24 }: { assignee: Assignee | null; size?: number }) {
  if (!assignee) {
    return (
      <div
        className="flex items-center justify-center rounded-full bg-overlay-subtle"
        style={{
          width: size,
          height: size,
        }}
      >
        <User size={size * 0.62} strokeWidth={1.85} className="text-text-muted" style={{ opacity: 0.6 }} />
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
