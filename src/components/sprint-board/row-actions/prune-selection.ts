/**
 * Prune a multi-select down to the keys that are still visible (BRDG-415).
 *
 * After a refetch / filter / move drops a row, its key would otherwise linger in the
 * selection Set, drifting the "N selected" count and letting a bulk action target an
 * off-screen row. Each host applies this during render (a setState-in-effect is
 * build-blocking under the React Compiler) guarded by identity:
 *
 *   const pruned = pruneSelectionToVisible(selected, visibleKeys);
 *   if (pruned !== selected) setSelected(pruned);
 *
 * The function returns the SAME Set reference when nothing is stale, so the guarded
 * setState fires only when a key actually needs dropping (no render loop, no churn).
 */
export function pruneSelectionToVisible(
  selection: Set<string>,
  visibleKeys: Set<string>,
): Set<string> {
  let hasStale = false;
  for (const key of selection) {
    if (!visibleKeys.has(key)) {
      hasStale = true;
      break;
    }
  }
  if (!hasStale) return selection;
  return new Set([...selection].filter((key) => visibleKeys.has(key)));
}
