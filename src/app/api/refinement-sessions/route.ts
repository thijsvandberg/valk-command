import { NextResponse } from "next/server";
import { db } from "@/db";
import { refinementSession } from "@/db/schema";
import { desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { applyRateLimit } from "@/lib/rate-limiter";
import { emitRefinementEvent } from "@/lib/refinement-events";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";
import { resolveSessionTicketKeys } from "@/lib/draft-sync";

export async function GET() {
  const rows = await db
    .select()
    .from(refinementSession)
    .orderBy(desc(refinementSession.createdAt))
    .limit(50);

  const result = rows.map((r) => {
    const ticketKeys = resolveSessionTicketKeys(JSON.parse(r.ticketKeys) as string[]);
    return { ...r, ticketKeys, ticketCount: ticketKeys.length };
  });

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const body = parsed.data as Record<string, unknown>;

  const name =
    typeof body.name === "string" && body.name.trim() ? body.name.trim() : null;

  let scheduledFor: string | null = null;
  if (body.scheduledFor !== undefined && body.scheduledFor !== null) {
    if (
      typeof body.scheduledFor !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(body.scheduledFor)
    ) {
      return errorResponse("scheduledFor must be a YYYY-MM-DD date", 400);
    }
    scheduledFor = body.scheduledFor;
  }

  if (!name && !scheduledFor) {
    return errorResponse("Provide a name or a date", 400);
  }

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
    scheduledFor,
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

  const resolvedKeys = resolveSessionTicketKeys(JSON.parse(created.ticketKeys) as string[]);
  return NextResponse.json(
    {
      ...created,
      ticketKeys: resolvedKeys,
      ticketCount: resolvedKeys.length,
    },
    { status: 201 },
  );
}
