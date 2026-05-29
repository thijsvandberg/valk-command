import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { appSetting } from "@/db/schema";
import { logger } from "@/lib/logger";
import { safeJsonParse } from "@/lib/api-validation";
import { applyRateLimit } from "@/lib/rate-limiter";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";

function settingKey(section: string) {
  return `section_visibility_${section}`;
}

const VALID_SECTIONS = ["epic-children", "subtasks", "refinement-pill"];

interface SectionVisibility {
  visible: string[];
  allKnown?: string[];
}

const putSchema = z.object({
  section: z.string().refine((s) => VALID_SECTIONS.includes(s), { message: "Invalid section" }),
  visible: z.array(z.string()).max(20),
  allKnown: z.array(z.string()).max(20).optional(),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const section = searchParams.get("section");

  if (!section || !VALID_SECTIONS.includes(section)) {
    return NextResponse.json({ visible: null }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  try {
    const row = await db.query.appSetting.findFirst({
      where: (r, { eq: eqFn }) => eqFn(r.key, settingKey(section)),
    });
    if (!row) {
      return NextResponse.json({ visible: null }, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    const parsed = safeJsonParse<SectionVisibility>(row.value, { visible: [] }, "section-visibility");
    return NextResponse.json({ visible: parsed.visible ?? null, allKnown: parsed.allKnown ?? null }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({ visible: null }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}

export async function PUT(request: Request) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  try {
    const parsed = await parseJsonBody(request, putSchema);
    if ("error" in parsed) return parsed.error;

    const { section, visible, allKnown } = parsed.data;
    const payload = JSON.stringify({ visible, allKnown });

    await db.insert(appSetting)
      .values({ key: settingKey(section), value: payload })
      .onConflictDoUpdate({ target: appSetting.key, set: { value: payload } });

    return NextResponse.json({ visible, allKnown });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("settings", "Failed to save section visibility", message);
    return errorResponse("Failed to save section visibility", 500);
  }
}
