import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { followedSprint } from "@/db/schema";
import { eq } from "drizzle-orm";
import { applyRateLimit } from "@/lib/rate-limiter";
import { errorResponse } from "@/lib/api-response";
import { parseJsonBody } from "@/lib/request-parser";

const followSprintSchema = z.object({
  sprintName: z.string().min(1).max(200),
});

// GET /api/followed-sprints - list all followed sprint names
export async function GET() {
  const rows = db.select().from(followedSprint).all();
  return NextResponse.json(rows.map((r) => r.sprintName), {
    headers: { "Cache-Control": "private, no-store" },
  });
}

// POST /api/followed-sprints - follow a sprint (idempotent)
export async function POST(request: Request) {
  const limited = applyRateLimit("write");
  if (limited) return limited;

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;

  const validation = followSprintSchema.safeParse(parsed.data);
  if (!validation.success) {
    return errorResponse(validation.error.issues[0]?.message ?? "Invalid request body", 400);
  }

  const { sprintName } = validation.data;

  // Atomic insert: sprintName is primary key, so concurrent inserts are safe
  db.insert(followedSprint).values({ sprintName }).onConflictDoNothing().run();
  return NextResponse.json({ sprintName });
}

// DELETE /api/followed-sprints - unfollow a sprint
export async function DELETE(request: Request) {
  const limited = applyRateLimit("delete");
  if (limited) return limited;

  const url = new URL(request.url);
  const sprintName = url.searchParams.get("sprintName");
  if (!sprintName) {
    return errorResponse("sprintName required", 400);
  }

  db.delete(followedSprint).where(eq(followedSprint.sprintName, sprintName)).run();
  return NextResponse.json({ sprintName });
}
