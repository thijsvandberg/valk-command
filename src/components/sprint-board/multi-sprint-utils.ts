import { COLUMNS } from "./FilterBar";
import type { ColumnId } from "./FilterBar";

// Header labels for all columns in compare view
export const COMPARE_HEADER_LABELS: Record<ColumnId, string> = {
  type: "", key: "Key", title: "Title", epic: "Epic", sprint: "Sprint",
  jiraStatus: "Status", flagged: "", points: "SP", bv: "BV",
  notes: "", pipeline: "CI", assignee: "", poStatus: "Readiness",
  quality: "QS",
};

// Column widths for the compare view (pixels). Title takes remaining space.
export const COMPARE_COL_WIDTHS: Record<ColumnId, number | undefined> = {
  type: 32, key: 120, title: undefined, epic: 130, sprint: 100,
  jiraStatus: 90, flagged: 36, points: 46, bv: 46,
  notes: 36, pipeline: 70, assignee: 36, poStatus: 70, quality: 56,
};

const COMPARE_LS_KEY = "bridge:compare-columns";
// Device-local (BRDG-343): the split position depends on this screen's width.
const COMPARE_SPLIT_LS_KEY = "bridge:compare-split";
export const COMPARE_DEFAULT_VISIBLE: ColumnId[] = ["key", "title", "points", "assignee"];
export const COMPARE_DEFAULT_ORDER: ColumnId[] = COLUMNS.map((c) => c.id);
export const COMPARE_MIN_COL_WIDTH = 28;

export interface CompareColState {
  visible: ColumnId[];
  order: ColumnId[];
  widths: Partial<Record<ColumnId, number>>;
}

export function loadCompareColumns(): CompareColState {
  try {
    const raw = localStorage.getItem(COMPARE_LS_KEY);
    if (raw) {
      const data = JSON.parse(raw) as { visible?: string[]; order?: string[]; widths?: Record<string, number> };
      const validIds = new Set<string>(COLUMNS.map((c) => c.id));
      const visible = (data.visible ?? COMPARE_DEFAULT_VISIBLE).filter((id) => validIds.has(id)) as ColumnId[];
      const savedOrder = (data.order ?? []).filter((id) => validIds.has(id)) as ColumnId[];
      const savedSet = new Set(savedOrder);
      const order = [...savedOrder, ...COMPARE_DEFAULT_ORDER.filter((id) => !savedSet.has(id))];
      const widths: Partial<Record<ColumnId, number>> = {};
      if (data.widths) {
        for (const [k, v] of Object.entries(data.widths)) {
          if (validIds.has(k) && typeof v === "number") widths[k as ColumnId] = v;
        }
      }
      return { visible, order, widths };
    }
  } catch { /* ignore */ }
  return { visible: COMPARE_DEFAULT_VISIBLE, order: COMPARE_DEFAULT_ORDER, widths: {} };
}

export function saveCompareColumns(state: CompareColState) {
  try {
    localStorage.setItem(COMPARE_LS_KEY, JSON.stringify(state));
  } catch { /* ignore */ }
}

export function loadSplitRatio(): number {
  try {
    const raw = localStorage.getItem(COMPARE_SPLIT_LS_KEY);
    if (raw) {
      const v = parseFloat(raw);
      if (v >= 0.2 && v <= 0.8) return v;
    }
  } catch { /* ignore */ }
  return 0.5;
}

export function saveSplitRatio(ratio: number) {
  try {
    localStorage.setItem(COMPARE_SPLIT_LS_KEY, String(ratio));
  } catch { /* ignore */ }
}
