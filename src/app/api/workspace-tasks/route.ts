import { NextResponse } from "next/server";
import { agentUrl, agentHeaders } from "@/lib/agent-proxy";

export async function POST(request: Request) {
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

  try {
    const res = await fetch(agentUrl("/api/tasks"), {
      method: "POST",
      headers: agentHeaders(),
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Agent unreachable" }, { status: 502 });
  }
}

export async function GET() {
  try {
    const res = await fetch(agentUrl("/api/tasks"), {
      headers: agentHeaders(),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Agent unreachable" }, { status: 502 });
  }
}
