import { User } from "lucide-react";
import type { Assignee } from "@/types/ticket";
import { Tooltip } from "@/components/shared/Tooltip";

// `richTooltip` swaps the native title for the styled Tooltip (opt-in so the many
// avatars living inside their own hover cards / pickers keep the plain title).
export function Avatar({
  assignee,
  size = 24,
  richTooltip = false,
}: {
  assignee: Assignee | null;
  size?: number;
  richTooltip?: boolean;
}) {
  if (!assignee) {
    const placeholder = (
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
    return richTooltip ? <Tooltip content="Unassigned">{placeholder}</Tooltip> : placeholder;
  }
  const avatar = (
    <div
      className="flex items-center justify-center rounded-full font-semibold text-white"
      style={{ backgroundColor: assignee.color, width: size, height: size, fontSize: size * 0.38 }}
      title={richTooltip ? undefined : assignee.name}
    >
      {assignee.initials}
    </div>
  );
  return richTooltip ? <Tooltip content={assignee.name}>{avatar}</Tooltip> : avatar;
}
