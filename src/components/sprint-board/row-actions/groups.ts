import type { LucideIcon } from "lucide-react";
import {
  ArrowRightLeft,
  Bookmark,
  Boxes,
  Copy,
  FilePen,
  Flag,
  MailOpen,
  RefreshCw,
  Sparkles,
} from "lucide-react";

/**
 * Declarative registry for the shared row-actions surface (BRDG-374). Both presentations
 * - the right-click menu and the multi-select bar - render from this single definition, so
 * they cannot drift and a new action benefits every surface that enables its group at once.
 *
 * The registry carries group IDENTITY (id/label/icon) and PRESENTATION flags (where each group
 * renders). The dynamic, surface-specific content of the rich groups (the live quick-move list,
 * the status/readiness/epic/assignee/label sub-pickers, the refinement-session list) is supplied
 * at render time by `useRowActions`; the registry only fixes the structure they slot into.
 */

export type RowActionGroupId =
  | "triage"
  | "move"
  | "update"
  | "flag"
  | "assist"
  | "refine"
  | "copy"
  | "refresh"
  | "bookmark";

export interface RowActionGroup {
  id: RowActionGroupId;
  /** Human label (group name + tooltip in the bar, parent label in the menu). */
  label: string;
  icon: LucideIcon;
  /** Right-click menu: render the actions inline near the top (Move = most used). */
  prominent?: boolean;
  /** Right-click menu: collapse behind a single parent item that opens a sub-menu. */
  nested?: boolean;
  /** List-level op (Copy / Refresh): only in the multi-select bar, never the row menu. */
  barOnly?: boolean;
  /** Reserved for a future capability; shown in tooling but not wired on real surfaces yet. */
  future?: boolean;
}

// Display order = the order groups appear in both presentations.
export const ROW_ACTION_GROUPS: RowActionGroup[] = [
  { id: "triage", label: "Triage", icon: MailOpen },
  { id: "move", label: "Move", icon: ArrowRightLeft, prominent: true },
  { id: "update", label: "Update", icon: FilePen, nested: true },
  { id: "flag", label: "Flag", icon: Flag },
  { id: "assist", label: "Assist", icon: Sparkles, nested: true },
  { id: "refine", label: "Refinement", icon: Boxes, nested: true },
  { id: "copy", label: "Copy", icon: Copy, barOnly: true },
  { id: "refresh", label: "Refresh", icon: RefreshCw, barOnly: true },
  { id: "bookmark", label: "Bookmark", icon: Bookmark, future: true },
];

export const ROW_ACTION_GROUP_BY_ID = Object.fromEntries(
  ROW_ACTION_GROUPS.map((g) => [g.id, g]),
) as Record<RowActionGroupId, RowActionGroup>;

/**
 * What a surface enables. `rank` = the list has a manual order (Move to top/bottom);
 * `metrics` = points/value are tracked (the SP/BV counters on the bar). The `triage` group is
 * itself a capability flag (the headline "Mark as read" primary), enabled via `groups`.
 */
export interface SurfaceDescriptor {
  id: string;
  groups: RowActionGroupId[];
  rank: boolean;
  metrics: boolean;
}

export const SURFACE_PRESETS: Record<"board" | "epic" | "inbox", SurfaceDescriptor> = {
  board: {
    id: "board",
    groups: ["move", "update", "flag", "assist", "refine", "copy", "refresh"],
    rank: true,
    metrics: true,
  },
  epic: {
    id: "epic",
    groups: ["move", "update", "flag", "assist", "refine", "copy"],
    rank: false,
    metrics: true,
  },
  inbox: {
    id: "inbox",
    groups: ["triage", "move", "update", "flag", "assist", "refine", "copy"],
    rank: false,
    metrics: false,
  },
};

/** Groups a surface shows in the right-click menu, in registry order (excludes bar-only ops). */
export function menuGroups(surface: SurfaceDescriptor): RowActionGroup[] {
  return ROW_ACTION_GROUPS.filter((g) => surface.groups.includes(g.id) && !g.barOnly);
}

/** Groups a surface shows in the multi-select bar, in registry order. */
export function barGroups(surface: SurfaceDescriptor): RowActionGroup[] {
  return ROW_ACTION_GROUPS.filter((g) => surface.groups.includes(g.id));
}
