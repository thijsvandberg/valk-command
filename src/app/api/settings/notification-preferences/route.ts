import { NextResponse } from "next/server";
import { db } from "@/db";
import { appSetting } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  DEFAULT_PREFERENCES,
  NOTIFICATION_PREFS_KEY,
  getPreferences,
} from "@/lib/notification-preferences";

export type { NotificationCategory, NotificationPreferences } from "@/lib/notification-preferences";

export async function GET() {
  return NextResponse.json({ preferences: getPreferences() });
}

const preferencesBodySchema = z.object({
  preferences: z.record(z.string(), z.boolean()),
});

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const parsed = preferencesBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid preferences format" }, { status: 400 });
    }

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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
