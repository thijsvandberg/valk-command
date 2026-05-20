import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { appSetting } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { safeJsonParse } from "@/lib/api-validation";
import { applyRateLimit } from "@/lib/rate-limiter";

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
    const row = await db.query.appSetting.findFirst({
      where: (r, { eq: eqFn }) => eqFn(r.key, SETTING_KEY),
    });
    if (!row) {
      return NextResponse.json({ order: null, visible: null });
    }
    const parsed = safeJsonParse<ColumnConfig>(row.value, { order: [], visible: [] }, "column-config");
    return NextResponse.json({
      order: parsed.order ?? null,
      visible: parsed.visible ?? null,
    });
  } catch {
    return NextResponse.json({ order: null, visible: null });
  }
}

export async function PUT(request: Request) {
  const limited = applyRateLimit("write");
  if (limited) return limited;

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = columnConfigBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
        { status: 400 },
      );
    }

    const { order, visible } = parsed.data;

    const existing = await db.query.appSetting.findFirst({
      where: (r, { eq: eqFn }) => eqFn(r.key, SETTING_KEY),
    });

    const current: ColumnConfig = safeJsonParse(existing?.value, { order: [], visible: [] }, "column-config");

    if (order !== undefined) current.order = order;
    if (visible !== undefined) current.visible = visible;

    const payload = JSON.stringify(current);

    await db.insert(appSetting)
      .values({ key: SETTING_KEY, value: payload })
      .onConflictDoUpdate({ target: appSetting.key, set: { value: payload } });

    return NextResponse.json({ order: current.order, visible: current.visible });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("settings", "Failed to save column config", message);
    return NextResponse.json({ error: "Failed to save column config" }, { status: 500 });
  }
}
