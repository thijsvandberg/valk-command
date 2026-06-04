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
import { applyRateLimit } from "@/lib/rate-limiter";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";
import {
  AUTO_SCAN_ENABLED_KEY,
  AUTO_SCAN_DAILY_COUNT_KEY,
  readAutoScanSettings,
} from "@/lib/auto-scan-settings";

const bodySchema = z.object({
  enabled: z.boolean().optional(),
  dailyCount: z.number().int().min(1).max(200).optional(),
});

export async function GET() {
  const settings = await readAutoScanSettings();
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

  const settings = await readAutoScanSettings();
  return NextResponse.json(settings);
}
