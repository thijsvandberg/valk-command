import { describe, it, expect } from "vitest";
import {
  excludeCooldown,
  orderByWorstStaleness,
  orderByOldestScanned,
  selectDeepScanKeys,
  type SelectableTicket,
} from "./deprecation-deep-scan-selection";

function t(jiraKey: string, opts: Partial<SelectableTicket> = {}): SelectableTicket {
  return {
    jiraKey,
    scanOverall: opts.scanOverall ?? null,
    lastScannedAt: opts.lastScannedAt ?? null,
    disposition: opts.disposition ?? null,
    dispositionUntil: opts.dispositionUntil ?? null,
  };
}

const NOW = Date.parse("2026-06-04T00:00:00Z");

describe("orderByWorstStaleness", () => {
  it("orders highest scanOverall first, nulls last, ties by key", () => {
    const ordered = orderByWorstStaleness([
      t("BT-3", { scanOverall: 0.3 }),
      t("BT-N"),
      t("BT-9", { scanOverall: 0.9 }),
      t("BT-9b", { scanOverall: 0.9 }),
    ]);
    expect(ordered.map((x) => x.jiraKey)).toEqual(["BT-9", "BT-9b", "BT-3", "BT-N"]);
  });
});

describe("orderByOldestScanned", () => {
  it("orders never-scanned first, then oldest timestamp first", () => {
    const ordered = orderByOldestScanned([
      t("BT-NEW", { lastScannedAt: "2026-06-03T00:00:00Z" }),
      t("BT-NEVER"),
      t("BT-OLD", { lastScannedAt: "2026-01-01T00:00:00Z" }),
    ]);
    expect(ordered.map((x) => x.jiraKey)).toEqual(["BT-NEVER", "BT-OLD", "BT-NEW"]);
  });
});

describe("excludeCooldown", () => {
  it("drops dismissed tickets still inside their cooldown", () => {
    const future = new Date(NOW + 86400000).toISOString();
    const past = new Date(NOW - 86400000).toISOString();
    const kept = excludeCooldown(
      [
        t("BT-COOL", { disposition: "dismissed", dispositionUntil: future }),
        t("BT-EXPIRED", { disposition: "dismissed", dispositionUntil: past }),
        t("BT-DISMISS-NOCD", { disposition: "dismissed" }),
        t("BT-CAND", { disposition: "candidate" }),
      ],
      NOW,
    );
    expect(kept.map((x) => x.jiraKey).sort()).toEqual(["BT-CAND", "BT-DISMISS-NOCD", "BT-EXPIRED"]);
  });
});

describe("selectDeepScanKeys", () => {
  const pool: SelectableTicket[] = [
    t("BT-1", { scanOverall: 0.9, lastScannedAt: "2026-06-01T00:00:00Z" }),
    t("BT-2", { scanOverall: 0.5, lastScannedAt: "2026-01-01T00:00:00Z" }),
    t("BT-3", { scanOverall: 0.7, lastScannedAt: null }),
    t("BT-COOL", { scanOverall: 1, disposition: "dismissed", dispositionUntil: new Date(NOW + 86400000).toISOString() }),
  ];

  it("worst-staleness top-X picks highest overall, excluding cooldown", () => {
    const keys = selectDeepScanKeys("worst-staleness", pool, 2, NOW);
    expect(keys).toEqual(["BT-1", "BT-3"]); // BT-COOL excluded despite 1.0
  });

  it("oldest top-X picks never-scanned then oldest, excluding cooldown", () => {
    const keys = selectDeepScanKeys("oldest", pool, 2, NOW);
    expect(keys).toEqual(["BT-3", "BT-2"]);
  });

  it("respects top-X", () => {
    expect(selectDeepScanKeys("worst-staleness", pool, 1, NOW)).toEqual(["BT-1"]);
  });
});
