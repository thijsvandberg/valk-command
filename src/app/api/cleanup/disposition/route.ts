/**
 * Bulk disposition API for the Backlog Deprecation Review epic (BRDG-289).
 *
 * POST applies one disposition action (confirm | dismiss | reset) to a set of
 * ticket keys selected via the /cleanup multi-select. Dismiss snoozes each for
 * the standard cooldown. Local-only on ticketMetadata; never writes Jira.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";
import { applyRateLimit } from "@/lib/rate-limiter";
import { applyDisposition } from "@/lib/cleanup-disposition-service";
import { MAX_DISPOSITION_NOTE_LENGTH } from "@/lib/cleanup-disposition";

const MAX_BULK = 200;

const bodySchema = z.object({
  action: z.enum(["confirm", "dismiss", "reset"]),
  keys: z.array(z.string().min(1).max(64)).min(1).max(MAX_BULK),
  note: z.string().max(MAX_DISPOSITION_NOTE_LENGTH).optional(),
});

export async function POST(request: Request) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;

  const validation = bodySchema.safeParse(parsed.data);
  if (!validation.success) {
    return errorResponse(validation.error.issues[0]?.message ?? "Invalid request body", 400);
  }

  const { action, keys, note } = validation.data;
  // De-dupe so a doubled selection cannot inflate counts or double-log.
  const unique = [...new Set(keys)];
  const result = await applyDisposition(unique, action, { note });

  return NextResponse.json({
    action,
    requested: unique.length,
    applied: result.applied.length,
    appliedKeys: result.applied,
    skipped: result.skipped,
  });
}
