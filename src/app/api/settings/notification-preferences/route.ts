import { NextResponse } from "next/server";
import { db } from "@/db";
import { appSetting } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { logger } from "@/lib/logger";
import {
  DEFAULT_PREFERENCES,
  NOTIFICATION_PREFS_KEY,
  getPreferences,
} from "@/lib/notification-preferences";
import { applyRateLimit } from "@/lib/rate-limiter";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";

export type { NotificationCategory, NotificationPreferences } from "@/lib/notification-preferences";

// Intentionally NOT re-scoped per-account in BRDG-343: the notification sender
// (src/lib/notifications.ts) reads these preferences synchronously from outside
// any request to decide whether to deliver a system event, so it has no
// resolvable account. Re-scoping only this route would split the toggles the PO
// sees from the gate the sender checks. Deferred until notification delivery
// itself becomes per-recipient (out of scope here: notifications are shared).
export async function GET() {
  return NextResponse.json({ preferences: getPreferences() }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

const preferencesBodySchema = z.object({
  preferences: z.record(z.string(), z.boolean()),
});

export async function PUT(request: Request) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  try {
    const parsed = await parseJsonBody(request, preferencesBodySchema);
    if ("error" in parsed) return parsed.error;

    const merged = { ...DEFAULT_PREFERENCES, ...parsed.data.preferences };
    const payload = JSON.stringify(merged);

    const existing = db.select().from(appSetting).where(eq(appSetting.key, NOTIFICATION_PREFS_KEY)).get();
    if (existing) {
      db.update(appSetting).set({ value: payload }).where(eq(appSetting.key, NOTIFICATION_PREFS_KEY)).run();
    } else {
      db.insert(appSetting).values({ key: NOTIFICATION_PREFS_KEY, value: payload }).run();
    }

    return NextResponse.json({ preferences: merged });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("settings", "Failed to save preferences", message);
    return errorResponse("Failed to save preferences", 500);
  }
}
