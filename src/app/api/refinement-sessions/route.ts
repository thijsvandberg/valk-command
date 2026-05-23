import { NextResponse } from "next/server";
import { db } from "@/db";
import { refinementSession } from "@/db/schema";
import { desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { applyRateLimit } from "@/lib/rate-limiter";

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
  const limited = applyRateLimit("write");
  if (limited) return limited;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

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
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }

  return NextResponse.json(
    {
      ...created,
      ticketKeys: JSON.parse(created.ticketKeys) as string[],
      ticketCount: ticketKeys.length,
    },
    { status: 201 },
  );
}
