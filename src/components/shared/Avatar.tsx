import type { Assignee } from "@/types/ticket";

export function Avatar({ assignee, size = 24 }: { assignee: Assignee | null; size?: number }) {
  if (!assignee) {
    return (
      <div
        className="rounded-full"
        style={{
          width: size,
          height: size,
          border: "1.5px dashed var(--color-border-default)",
          opacity: 0.5,
        }}
      />
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
