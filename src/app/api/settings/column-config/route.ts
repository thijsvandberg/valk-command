import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { safeJsonParse } from "@/lib/api-validation";
import { applyRateLimit } from "@/lib/rate-limiter";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";
import { resolveUserId, seedUserSettingFromGlobal, writeUserSetting } from "@/lib/user-settings";

const SETTING_KEY = "sprint_board_column_config";

interface ColumnConfig {
  order: string[];
  visible: string[];
}

const columnConfigBodySchema = z.object({
  order: z.array(z.string()).max(50).optional(),
  visible: z.array(z.string()).max(50).optional(),
});

export async function GET() {
  try {
    const userId = await resolveUserId();
    const raw = await seedUserSettingFromGlobal(SETTING_KEY, userId);
    if (raw === null) {
      return NextResponse.json({ order: null, visible: null }, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    const parsed = safeJsonParse<ColumnConfig>(raw, { order: [], visible: [] }, "column-config");
    return NextResponse.json({
      order: parsed.order ?? null,
      visible: parsed.visible ?? null,
    }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({ order: null, visible: null }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}

export async function PUT(request: Request) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  try {
    const parsed = await parseJsonBody(request, columnConfigBodySchema);
    if ("error" in parsed) return parsed.error;

    const { order, visible } = parsed.data;

    const userId = await resolveUserId();
    // Partial PUTs merge onto the account's current value, seeding from the legacy
    // global config the first time so a partial update doesn't drop the other half.
    const existing = await seedUserSettingFromGlobal(SETTING_KEY, userId);
    const current: ColumnConfig = safeJsonParse(existing ?? undefined, { order: [], visible: [] }, "column-config");

    if (order !== undefined) current.order = order;
    if (visible !== undefined) current.visible = visible;

    await writeUserSetting(SETTING_KEY, userId, JSON.stringify(current));

    return NextResponse.json({ order: current.order, visible: current.visible });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("settings", "Failed to save column config", message);
    return errorResponse("Failed to save column config", 500);
  }
}
