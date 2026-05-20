import { NextResponse } from "next/server";
import { db } from "@/db";
import { appSetting } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { logger } from "@/lib/logger";

const SETTING_KEY = "saved_searches";
const MAX_SAVED = 10;

export type SavedSearch = {
  id: string;
  label: string;
  query: string;
  filters: {
    sections: string[];
    status: string[];
    poStatus: string[];
    type: string[];
    assignee: string[];
    sprint: string[];
    dateRange: string | null;
  };
};

const serializedFiltersSchema = z.object({
  sections: z.array(z.string()).max(10),
  status: z.array(z.string()).max(20),
  poStatus: z.array(z.string()).max(20),
  type: z.array(z.string()).max(10),
  assignee: z.array(z.string()).max(50),
  sprint: z.array(z.string()).max(50),
  dateRange: z.string().nullable(),
});

const savedSearchSchema = z.object({
  id: z.string().max(50),
  label: z.string().min(1).max(200),
  query: z.string().max(500),
  filters: serializedFiltersSchema,
});

const bodySchema = z.object({
  searches: z.array(savedSearchSchema).max(MAX_SAVED),
});

export async function GET() {
  try {
    const row = await db.query.appSetting.findFirst({
      where: (r, { eq: eqFn }) => eqFn(r.key, SETTING_KEY),
    });
    if (!row) {
      return NextResponse.json({ searches: [] });
    }
    return NextResponse.json({ searches: JSON.parse(row.value) as SavedSearch[] });
  } catch {
    return NextResponse.json({ searches: [] });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid saved searches format" }, { status: 400 });
    }
    const searches = parsed.data.searches;
    const payload = JSON.stringify(searches);

    const existing = await db.query.appSetting.findFirst({
      where: (r, { eq: eqFn }) => eqFn(r.key, SETTING_KEY),
    });
    if (existing) {
      await db.update(appSetting).set({ value: payload }).where(eq(appSetting.key, SETTING_KEY));
    } else {
      await db.insert(appSetting).values({ key: SETTING_KEY, value: payload });
    }

    return NextResponse.json({ searches });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("settings", "Failed to save searches", message);
    return NextResponse.json({ error: "Failed to save searches" }, { status: 500 });
  }
}
