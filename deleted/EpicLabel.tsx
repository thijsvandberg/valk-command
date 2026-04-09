import { getEpicColor } from "@/types/ticket";

export function EpicLabel({ epic }: { epic: string | null }) {
  if (!epic) return null;
  const color = getEpicColor(epic);
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
