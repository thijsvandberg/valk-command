"use client";

import { Bookmark } from "lucide-react";
import { Tooltip } from "@/components/shared/Tooltip";

// Board/backlog row tag that a ticket is bookmarked (BRDG-355). Display-only: the
// toggle lives in the right-click menu, side panel, detail and editor. Rendered in
// violet from the row-marker family (Slate + Violet) so it reads as kin to the
// SP/BV markers, and theme-aware via --meta-bv-fg. Renders nothing when not
// bookmarked, so callers can drop it in a marker cluster unconditionally.
export function BookmarkBadge({
  bookmarked,
  className = "",
}: {
  bookmarked?: boolean;
  className?: string;
}) {
  if (!bookmarked) return null;
  return (
    <Tooltip content="Bookmarked" className={`shrink-0 ${className}`}>
      <Bookmark
        className="h-3.5 w-3.5 shrink-0"
        style={{ color: "var(--meta-bv-fg)" }}
        fill="currentColor"
        strokeWidth={1.5}
        aria-label="Bookmarked"
      />
    </Tooltip>
  );
}
