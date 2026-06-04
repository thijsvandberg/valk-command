/**
 * Auto background scan settings API (BRDG-290).
 *
 * GET  — returns { enabled: boolean, dailyCount: number }
 * POST — accepts { enabled?: boolean, dailyCount?: number }, merges with
 *        current values and persists each field as its own app_setting key.
 *
 * Storing enabled and dailyCount as separate keys (rather than one JSON blob)
 * keeps reads cheap and atomic: the auto-enqueue task reads each key
 * independently without parsing a larger settings object.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { appSetting } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { applyRateLimit } from "@/lib/rate-limiter";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";

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

const bodySchema = z.object({
  enabled: z.boolean().optional(),
  dailyCount: z.number().int().min(1).max(200).optional(),
});

async function readSettings(): Promise<AutoScanSettings> {
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

export async function GET() {
  const settings = await readSettings();
  return NextResponse.json(settings, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: Request) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;

  const validation = bodySchema.safeParse(parsed.data);
  if (!validation.success) {
    return errorResponse(validation.error.issues[0]?.message ?? "Invalid request body", 400);
  }

  const { enabled, dailyCount } = validation.data;

  // Write only the fields that were provided; leave others untouched.
  const writes: Array<{ key: string; value: string }> = [];
  if (enabled !== undefined) {
    writes.push({ key: AUTO_SCAN_ENABLED_KEY, value: String(enabled) });
  }
  if (dailyCount !== undefined) {
    writes.push({ key: AUTO_SCAN_DAILY_COUNT_KEY, value: String(dailyCount) });
  }

  for (const { key, value } of writes) {
    await db
      .insert(appSetting)
      .values({ key, value })
      .onConflictDoUpdate({ target: appSetting.key, set: { value } });
  }

  const settings = await readSettings();
  return NextResponse.json(settings);
}
