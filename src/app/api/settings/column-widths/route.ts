import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { appSetting } from "@/db/schema";
import { eq } from "drizzle-orm";

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
      return NextResponse.json({ widths: {} });
    }
    return NextResponse.json({ widths: JSON.parse(row.value) as ColumnWidths });
  } catch {
    return NextResponse.json({ widths: {} });
  }
}

export async function PUT(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = columnWidthsBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
        { status: 400 },
      );
    }

    const { widths } = parsed.data;
    const payload = JSON.stringify(widths);

    await db.insert(appSetting)
      .values({ key: SETTING_KEY, value: payload })
      .onConflictDoUpdate({ target: appSetting.key, set: { value: payload } });

    return NextResponse.json({ widths });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
