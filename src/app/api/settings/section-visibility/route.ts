import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { appSetting } from "@/db/schema";
import { logger } from "@/lib/logger";
import { safeJsonParse } from "@/lib/api-validation";
import { applyRateLimit } from "@/lib/rate-limiter";

function settingKey(section: string) {
  return `section_visibility_${section}`;
}

const VALID_SECTIONS = ["epic-children", "subtasks"];

interface SectionVisibility {
  visible: string[];
}

const putSchema = z.object({
  section: z.string().refine((s) => VALID_SECTIONS.includes(s), { message: "Invalid section" }),
  visible: z.array(z.string()).max(20),
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
    return NextResponse.json({ visible: parsed.visible ?? null }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({ visible: null }, {
      headers: { "Cache-Control": "private, no-store" },
    });
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

    const parsed = putSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
        { status: 400 },
      );
    }

    const { section, visible } = parsed.data;
    const payload = JSON.stringify({ visible });

    await db.insert(appSetting)
      .values({ key: settingKey(section), value: payload })
      .onConflictDoUpdate({ target: appSetting.key, set: { value: payload } });

    return NextResponse.json({ visible });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("settings", "Failed to save section visibility", message);
    return NextResponse.json({ error: "Failed to save section visibility" }, { status: 500 });
  }
}
