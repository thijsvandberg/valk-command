// Device-local (BRDG-343): the split position depends on this screen's width.
const COMPARE_SPLIT_LS_KEY = "bridge:compare-split";

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
