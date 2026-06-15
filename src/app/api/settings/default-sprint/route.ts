import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limiter";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";
import { resolveUserId, seedUserSettingFromGlobal, writeUserSetting } from "@/lib/user-settings";

// Re-scoped to the account (BRDG-343): the stored sprintId is a raw string, so it
// round-trips through the user store directly. Legacy global values seed the
// account on first read; the envelope stays { sprintId } so consumers are unchanged.
const SETTING_KEY = "default_sprint_id";

export async function GET() {
  try {
    const userId = await resolveUserId();
    const sprintId = (await seedUserSettingFromGlobal(SETTING_KEY, userId)) ?? "";
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

    const userId = await resolveUserId();
    await writeUserSetting(SETTING_KEY, userId, sprintId);

    return NextResponse.json({ sprintId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("settings", "Failed to save default sprint", message);
    return errorResponse("Failed to save default sprint", 500);
  }
}
