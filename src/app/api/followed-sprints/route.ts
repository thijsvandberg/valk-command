import { NextResponse } from "next/server";
import { db } from "@/db";
import { followedSprint } from "@/db/schema";
import { eq } from "drizzle-orm";

// GET /api/followed-sprints - list all followed sprint names
export async function GET() {
  const rows = db.select().from(followedSprint).all();
  return NextResponse.json(rows.map((r) => r.sprintName));
}

// POST /api/followed-sprints - follow a sprint
export async function POST(request: Request) {
  const body = await request.json();
  const sprintName = body.sprintName as string;
  if (!sprintName) {
    return NextResponse.json({ error: "sprintName required" }, { status: 400 });
  }

  const existing = db
    .select()
    .from(followedSprint)
    .where(eq(followedSprint.sprintName, sprintName))
    .get();

  if (existing) {
    return NextResponse.json({ status: "already_followed" });
  }

  db.insert(followedSprint).values({ sprintName }).run();
  return NextResponse.json({ status: "followed" });
}

// DELETE /api/followed-sprints - unfollow a sprint
export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const sprintName = url.searchParams.get("sprintName");
  if (!sprintName) {
    return NextResponse.json({ error: "sprintName required" }, { status: 400 });
  }

  db.delete(followedSprint).where(eq(followedSprint.sprintName, sprintName)).run();
  return NextResponse.json({ status: "unfollowed" });
}
