import { NextResponse } from "next/server";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limiter";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";
import { upsertSetting } from "@/lib/upsert-setting";
import {
  AUTO_GENERATE_TEST_DOC_KEY,
  getAutoGenerateTestDoc,
} from "@/lib/auto-generate-test-doc-setting";

export async function GET() {
  const value = await getAutoGenerateTestDoc();
  return NextResponse.json({ value }, { headers: { "Cache-Control": "private, no-store" } });
}

const bodySchema = z.object({ value: z.boolean() });

export async function PUT(request: Request) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  try {
    const parsed = await parseJsonBody(request, bodySchema);
    if ("error" in parsed) return parsed.error;

    const { value } = parsed.data;
    await upsertSetting(AUTO_GENERATE_TEST_DOC_KEY, String(value));

    return NextResponse.json({ value });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse(`Failed to save setting: ${message}`, 500);
  }
}
