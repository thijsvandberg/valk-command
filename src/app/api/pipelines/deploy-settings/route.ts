import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { appSetting } from "@/db/schema";
import { eq } from "drizzle-orm";
import { applyRateLimit } from "@/lib/rate-limiter";
import { parseJsonBody } from "@/lib/request-parser";

const SETTINGS_KEY = "deploy-notification-settings";

export interface DeployNotificationSettings {
  enabled: boolean;
  environments: Record<string, boolean>;
}

const settingsSchema = z.object({
  enabled: z.boolean(),
  environments: z.record(z.string(), z.boolean()),
});

const DEFAULTS: DeployNotificationSettings = {
  enabled: true,
  environments: {
    Production: true,
    Staging: true,
    UAT1: true,
    UAT2: true,
    UAT3: true,
    Test: false,
  },
};

// GET /api/pipelines/deploy-settings
export async function GET() {
  const row = db.select().from(appSetting).where(eq(appSetting.key, SETTINGS_KEY)).get();
  if (!row) return NextResponse.json(DEFAULTS, {
    headers: { "Cache-Control": "private, no-store" },
  });
  try {
    return NextResponse.json(JSON.parse(row.value), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json(DEFAULTS, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}

// PUT /api/pipelines/deploy-settings
export async function PUT(request: Request) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const parsed = await parseJsonBody(request, settingsSchema);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data;

  const existing = db.select().from(appSetting).where(eq(appSetting.key, SETTINGS_KEY)).get();
  const value = JSON.stringify(body);

  if (existing) {
    db.update(appSetting).set({ value }).where(eq(appSetting.key, SETTINGS_KEY)).run();
  } else {
    db.insert(appSetting).values({ key: SETTINGS_KEY, value }).run();
  }

  return NextResponse.json(body);
}
