import { NextResponse } from "next/server";
import { db } from "@/db";
import { appSetting } from "@/db/schema";
import { eq } from "drizzle-orm";

const SETTING_KEY = "sprint_board_column_widths";

type ColumnWidths = Record<string, number>;

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
    const body = await request.json();
    const widths = body.widths as ColumnWidths;
    if (typeof widths !== "object" || widths === null) {
      return NextResponse.json({ error: "Invalid widths" }, { status: 400 });
    }
    const payload = JSON.stringify(widths);

    const existing = await db.query.appSetting.findFirst({
      where: (r, { eq: eqFn }) => eqFn(r.key, SETTING_KEY),
    });

    if (existing) {
      await db.update(appSetting).set({ value: payload }).where(eq(appSetting.key, SETTING_KEY));
    } else {
      await db.insert(appSetting).values({ key: SETTING_KEY, value: payload });
    }

    return NextResponse.json({ widths });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
