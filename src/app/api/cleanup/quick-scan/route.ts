/**
 * Tier-1 quick (staleness) scan API (Backlog Deprecation Review epic).
 *
 * POST runs the cheap, local, no-AI staleness pass synchronously for an explicit
 * set of ticket keys and returns how many were scored vs skipped. Unlike the
 * deep-scan endpoint (which only ENQUEUES work for a background runner), this
 * runs immediately because the staleness pass is local and inexpensive. No Jira
 * reads or writes: it only fills the local scan-state fields on ticketMetadata.
 *
 * The rolling scheduled task and this endpoint share one implementation
 * (`scoreStalenessForKeys` -> `scoreRows` in deprecation-staleness-runner.ts), so
 * an on-demand quick-scan produces the same scores the background scan would.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limiter";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";
import { scoreStalenessForKeys } from "@/lib/deprecation-staleness-runner";

// Cap mirrors the deep-scan endpoint's MAX_TOP_X: a sane ceiling on a single
// request so a runaway selection cannot score an unbounded set in one call.
const MAX_KEYS = 200;

const bodySchema = z.object({
  keys: z.array(z.string().min(1).max(64)).min(1).max(MAX_KEYS),
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

  const { scored, skipped } = await scoreStalenessForKeys(validation.data.keys);

  return NextResponse.json({ scored, skipped });
}
