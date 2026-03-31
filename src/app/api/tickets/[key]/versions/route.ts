import { NextResponse } from "next/server";
import { db } from "@/db";
import { storyVersion } from "@/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;

  const versions = await db
    .select()
    .from(storyVersion)
    .where(eq(storyVersion.jiraKey, key));

  return NextResponse.json(versions);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;

  let body: { description: string; tag?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.description || typeof body.description !== "string") {
    return NextResponse.json(
      { error: "description is required" },
      { status: 400 },
    );
  }

  const validTags = ["pre-refinement", "post-refinement", "final"];
  if (body.tag && !validTags.includes(body.tag)) {
    return NextResponse.json(
      { error: `tag must be one of: ${validTags.join(", ")}` },
      { status: 400 },
    );
  }

  const id = `sv-${crypto.randomUUID()}`;
  const contentHash = crypto
    .createHash("sha256")
    .update(body.description)
    .digest("hex")
    .slice(0, 12);

  const newVersion = {
    id,
    jiraKey: key,
    description: body.description,
    contentHash,
    tag: body.tag ?? null,
  };

  await db.insert(storyVersion).values(newVersion);

  const inserted = await db
    .select()
    .from(storyVersion)
    .where(eq(storyVersion.id, id));

  return NextResponse.json(inserted[0], { status: 201 });
}
