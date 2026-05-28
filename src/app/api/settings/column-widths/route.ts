import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { appSetting } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limiter";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";

const SETTING_KEY = "sprint_board_column_widths";

type ColumnWidths = Record<string, number>;

const columnWidthsBodySchema = z.object({
  widths: z.record(z.string(), z.number().positive()).refine(
    (v) => Object.keys(v).length <= 100,
    { message: "Too many column width entries (max 100)" },
  ),
});

export async function GET() {
  try {
    const row = await db.query.appSetting.findFirst({
      where: (r, { eq: eqFn }) => eqFn(r.key, SETTING_KEY),
    });
    if (!row) {
      return NextResponse.json({ widths: {} }, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    return NextResponse.json({ widths: JSON.parse(row.value) as ColumnWidths }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({ widths: {} }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}

export async function PUT(request: Request) {
  const limited = applyRateLimit("write");
  if (limited) return limited;

  try {
    const parsed = await parseJsonBody(request, columnWidthsBodySchema);
    if ("error" in parsed) return parsed.error;

    const { widths } = parsed.data;
    const payload = JSON.stringify(widths);

    await db.insert(appSetting)
      .values({ key: SETTING_KEY, value: payload })
      .onConflictDoUpdate({ target: appSetting.key, set: { value: payload } });

    return NextResponse.json({ widths });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("settings", "Failed to save column widths", message);
    return errorResponse("Failed to save column widths", 500);
  }
}
