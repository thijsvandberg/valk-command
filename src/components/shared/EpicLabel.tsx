import { EPIC_COLORS } from "../sprint-board/mock-data";

export function EpicLabel({ epic }: { epic: string | null }) {
  if (!epic) return null;
  const color = EPIC_COLORS[epic];
  if (!color) return null;

  return (
    <span
      className="inline-block max-w-full truncate rounded px-1.5 py-0.5 text-xs font-medium"
      style={{ backgroundColor: color.bg, color: color.text }}
    >
      {epic}
    </span>
  );
}
