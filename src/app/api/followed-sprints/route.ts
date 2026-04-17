import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { followedSprint } from "@/db/schema";
import { eq } from "drizzle-orm";

const followSprintSchema = z.object({
  sprintName: z.string().min(1).max(200),
});

// GET /api/followed-sprints - list all followed sprint names
export async function GET() {
  const rows = db.select().from(followedSprint).all();
  return NextResponse.json(rows.map((r) => r.sprintName));
}

// POST /api/followed-sprints - follow a sprint (idempotent)
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = followSprintSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
      { status: 400 },
    );
  }

  const { sprintName } = parsed.data;

  // Atomic insert: sprintName is primary key, so concurrent inserts are safe
  db.insert(followedSprint).values({ sprintName }).onConflictDoNothing().run();
  return NextResponse.json({ sprintName });
}

// DELETE /api/followed-sprints - unfollow a sprint
export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const sprintName = url.searchParams.get("sprintName");
  if (!sprintName) {
    return NextResponse.json({ error: "sprintName required" }, { status: 400 });
  }

  db.delete(followedSprint).where(eq(followedSprint.sprintName, sprintName)).run();
  return NextResponse.json({ sprintName });
}
