import type { Assignee } from "../sprint-board/mock-data";

export function Avatar({ assignee, size = 24 }: { assignee: Assignee | null; size?: number }) {
  const iconSize = size * 0.55;

  if (!assignee) {
    return (
      <div
        className="flex items-center justify-center rounded-full border border-white/[0.06] bg-white/[0.03]"
        style={{ width: size, height: size }}
      >
        <svg viewBox="0 0 16 16" className="text-white/15" style={{ width: iconSize, height: iconSize }}>
          <path d="M8 8a3 3 0 100-6 3 3 0 000 6zm0 2c-3.3 0-6 1.34-6 3v1h12v-1c0-1.66-2.7-3-6-3z" fill="currentColor" />
        </svg>
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
