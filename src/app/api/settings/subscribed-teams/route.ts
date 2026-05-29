import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import {
  getSubscribedTeams,
  setSubscribedTeams,
  getAvailableTeams,
} from "@/lib/subscribed-teams";
import { applyRateLimit } from "@/lib/rate-limiter";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";

export async function GET() {
  return NextResponse.json({
    teams: getSubscribedTeams(),
    available: getAvailableTeams(),
  }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

const bodySchema = z.object({
  teams: z.array(z.string().min(1).max(20)).max(50),
});

export async function PUT(request: Request) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  try {
    const parsed = await parseJsonBody(request, bodySchema);
    if ("error" in parsed) return parsed.error;
    setSubscribedTeams(parsed.data.teams);
    return NextResponse.json({
      teams: parsed.data.teams,
      available: getAvailableTeams(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("settings", "Failed to save subscribed teams", message);
    return errorResponse("Failed to save subscribed teams", 500);
  }
}
