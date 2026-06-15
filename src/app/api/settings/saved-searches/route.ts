import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limiter";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";
import { resolveUserId, seedUserSettingFromGlobal, writeUserSetting } from "@/lib/user-settings";

// Re-scoped to the account (BRDG-343); envelope stays { searches }.
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
    const userId = await resolveUserId();
    const raw = await seedUserSettingFromGlobal(SETTING_KEY, userId);
    const searches = raw === null ? [] : (JSON.parse(raw) as SavedSearch[]);
    return NextResponse.json({ searches }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({ searches: [] }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}

export async function PUT(request: Request) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  try {
    const parsed = await parseJsonBody(request, bodySchema);
    if ("error" in parsed) return parsed.error;
    const searches = parsed.data.searches;
    const userId = await resolveUserId();
    await writeUserSetting(SETTING_KEY, userId, JSON.stringify(searches));

    return NextResponse.json({ searches });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("settings", "Failed to save searches", message);
    return errorResponse("Failed to save searches", 500);
  }
}
