import { NextResponse } from "next/server";
import { agentFetch } from "@/lib/agent-fetch";
import { applyRateLimit } from "@/lib/rate-limiter";

export async function POST(request: Request) {
  const limited = applyRateLimit("workspace");
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "Request body must be a JSON object" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  // Accept both "skillName" and "skill" for compatibility
  const skillName = typeof b.skillName === "string" ? b.skillName : typeof b.skill === "string" ? b.skill : null;
  if (!skillName) {
    return NextResponse.json({ error: "skillName (string) is required" }, { status: 400 });
  }

  // Normalise body for the agent: ensure skill is set and provide a default conversationId
  const agentBody = {
    ...b,
    skill: skillName,
    conversationId: b.conversationId || `auto-${Date.now()}`,
  };

  const result = await agentFetch("/api/tasks", {
    method: "POST",
    body: agentBody,
    retries: 2,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.error, code: result.error.code },
      { status: result.status || 502 },
    );
  }

  return NextResponse.json(result.data, { status: result.status });
}

export async function GET() {
  const result = await agentFetch("/api/tasks");

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error.error, code: result.error.code },
      { status: result.status || 502 },
    );
  }

  return NextResponse.json(result.data, { status: result.status });
}
