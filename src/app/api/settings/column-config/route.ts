import { NextResponse } from "next/server";
import { db } from "@/db";
import { appSetting } from "@/db/schema";
import { eq } from "drizzle-orm";

const SETTING_KEY = "sprint_board_column_config";

interface ColumnConfig {
  order: string[];
  visible: string[];
}

export async function GET() {
  try {
    const row = await db.query.appSetting.findFirst({
      where: (r, { eq: eqFn }) => eqFn(r.key, SETTING_KEY),
    });
    if (!row) {
      return NextResponse.json({ order: null, visible: null });
    }
    const parsed = JSON.parse(row.value) as ColumnConfig;
    return NextResponse.json({
      order: parsed.order ?? null,
      visible: parsed.visible ?? null,
    });
  } catch {
    return NextResponse.json({ order: null, visible: null });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { order, visible } = body as Partial<ColumnConfig>;

    if (order !== undefined && !Array.isArray(order)) {
      return NextResponse.json({ error: "Invalid order" }, { status: 400 });
    }
    if (visible !== undefined && !Array.isArray(visible)) {
      return NextResponse.json({ error: "Invalid visible" }, { status: 400 });
    }

    const existing = await db.query.appSetting.findFirst({
      where: (r, { eq: eqFn }) => eqFn(r.key, SETTING_KEY),
    });

    const current: ColumnConfig = existing
      ? JSON.parse(existing.value)
      : { order: [], visible: [] };

    if (order !== undefined) current.order = order;
    if (visible !== undefined) current.visible = visible;

    const payload = JSON.stringify(current);

    if (existing) {
      await db.update(appSetting).set({ value: payload }).where(eq(appSetting.key, SETTING_KEY));
    } else {
      await db.insert(appSetting).values({ key: SETTING_KEY, value: payload });
    }

    return NextResponse.json({ order: current.order, visible: current.visible });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
