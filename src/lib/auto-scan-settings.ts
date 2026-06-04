/**
 * Auto background scan settings (BRDG-290) — shared constants + reader.
 *
 * These live outside the route module because Next.js forbids route files
 * (`route.ts`) from exporting anything other than HTTP handlers and a small
 * set of config fields. The scheduled auto-enqueue task and the tests need
 * these keys/defaults, so they belong in a plain lib module.
 *
 * Storing `enabled` and `dailyCount` as separate app_setting keys (rather than
 * one JSON blob) keeps reads cheap and atomic: the auto-enqueue task reads each
 * key independently without parsing a larger settings object.
 */

import { db } from "@/db";
import { appSetting } from "@/db/schema";
import { inArray } from "drizzle-orm";

export const AUTO_SCAN_ENABLED_KEY = "deprecation-auto-scan:enabled";
export const AUTO_SCAN_DAILY_COUNT_KEY = "deprecation-auto-scan:daily-count";

/** Prefix for the per-day budget counter. Full key: `${PREFIX}:<YYYY-MM-DD>`. */
export const AUTO_SCAN_BUDGET_KEY_PREFIX = "deprecation-auto-scan:budget";

export const AUTO_SCAN_DEFAULT_ENABLED = false;
export const AUTO_SCAN_DEFAULT_DAILY_COUNT = 10;

export interface AutoScanSettings {
  enabled: boolean;
  dailyCount: number;
}

export async function readAutoScanSettings(): Promise<AutoScanSettings> {
  const rows = await db
    .select({ key: appSetting.key, value: appSetting.value })
    .from(appSetting)
    .where(inArray(appSetting.key, [AUTO_SCAN_ENABLED_KEY, AUTO_SCAN_DAILY_COUNT_KEY]));

  const map = new Map(rows.map((r) => [r.key, r.value]));
  const enabledVal = map.get(AUTO_SCAN_ENABLED_KEY);
  const countVal = map.get(AUTO_SCAN_DAILY_COUNT_KEY);

  return {
    enabled: enabledVal !== undefined ? enabledVal === "true" : AUTO_SCAN_DEFAULT_ENABLED,
    dailyCount:
      countVal !== undefined
        ? Math.max(1, parseInt(countVal, 10) || AUTO_SCAN_DEFAULT_DAILY_COUNT)
        : AUTO_SCAN_DEFAULT_DAILY_COUNT,
  };
}
