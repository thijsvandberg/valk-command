import { NextResponse } from "next/server";
import { db } from "@/db";
import { refinementSession } from "@/db/schema";
import { desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { applyRateLimit } from "@/lib/rate-limiter";
import { emitRefinementEvent } from "@/lib/refinement-events";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";

export async function GET() {
  const rows = await db
    .select()
    .from(refinementSession)
    .orderBy(desc(refinementSession.createdAt))
    .limit(50);

  const result = rows.map((r) => ({
    ...r,
    ticketKeys: JSON.parse(r.ticketKeys) as string[],
    ticketCount: (JSON.parse(r.ticketKeys) as string[]).length,
  }));

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data as Record<string, unknown>;

  const name =
    typeof body.name === "string" && body.name.trim()
      ? body.name.trim()
      : `Refinement ${new Date().toISOString().slice(0, 10)}`;

  let ticketKeys: string[] = [];
  if (Array.isArray(body.ticketKeys)) {
    ticketKeys = body.ticketKeys.filter(
      (k): k is string => typeof k === "string" && k.trim() !== "",
    );
  }

  const id = randomUUID();
  const now = new Date().toISOString();

  await db.insert(refinementSession).values({
    id,
    name,
    ticketKeys: JSON.stringify(ticketKeys),
    status: "draft",
    createdAt: now,
    updatedAt: now,
  });

  const created = await db.query.refinementSession.findFirst({
    where: (rs, { eq }) => eq(rs.id, id),
  });

  if (!created) {
    return errorResponse("Failed to create session", 500);
  }

  emitRefinementEvent({ type: "session:created", sessionId: id });

  return NextResponse.json(
    {
      ...created,
      ticketKeys: JSON.parse(created.ticketKeys) as string[],
      ticketCount: ticketKeys.length,
    },
    { status: 201 },
  );
}
