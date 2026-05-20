import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import {
  getSubscribedTeams,
  setSubscribedTeams,
  getAvailableTeams,
} from "@/lib/subscribed-teams";
import { applyRateLimit } from "@/lib/rate-limiter";

export async function GET() {
  return NextResponse.json({
    teams: getSubscribedTeams(),
    available: getAvailableTeams(),
  });
}

const bodySchema = z.object({
  teams: z.array(z.string().min(1).max(20)).max(50),
});

export async function PUT(request: Request) {
  const limited = applyRateLimit("write");
  if (limited) return limited;

  try {
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid format" }, { status: 400 });
    }
    setSubscribedTeams(parsed.data.teams);
    return NextResponse.json({
      teams: parsed.data.teams,
      available: getAvailableTeams(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("settings", "Failed to save subscribed teams", message);
    return NextResponse.json({ error: "Failed to save subscribed teams" }, { status: 500 });
  }
}
