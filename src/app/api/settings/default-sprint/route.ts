import { NextResponse } from "next/server";
import { db } from "@/db";
import { appSetting } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limiter";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";

const SETTING_KEY = "default_sprint_id";

export async function GET() {
  try {
    const row = await db.query.appSetting.findFirst({
      where: (r, { eq: eqFn }) => eqFn(r.key, SETTING_KEY),
    });
    const sprintId = row?.value ?? "";
    return NextResponse.json({ sprintId }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({ sprintId: "" }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}

const bodySchema = z.object({
  sprintId: z.string().max(200),
});

export async function PUT(request: Request) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  try {
    const parsed = await parseJsonBody(request, bodySchema);
    if ("error" in parsed) return parsed.error;
    const { sprintId } = parsed.data;

    const existing = await db.query.appSetting.findFirst({
      where: (r, { eq: eqFn }) => eqFn(r.key, SETTING_KEY),
    });

    if (existing) {
      await db.update(appSetting).set({ value: sprintId }).where(eq(appSetting.key, SETTING_KEY));
    } else {
      await db.insert(appSetting).values({ key: SETTING_KEY, value: sprintId });
    }

    return NextResponse.json({ sprintId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("settings", "Failed to save default sprint", message);
    return errorResponse("Failed to save default sprint", 500);
  }
}
