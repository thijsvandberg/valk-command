import { NextResponse } from "next/server";
import { db } from "@/db";
import { storedReview, ticketMetadata, storyVersion, activityLog } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logActivity } from "@/lib/activity-logger";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;

  const rows = await db
    .select()
    .from(storedReview)
    .where(eq(storedReview.ticketKey, key))
    .orderBy(desc(storedReview.createdAt));

  const reviews = rows.map((r) => ({
    id: r.id,
    ticketKey: r.ticketKey,
    createdAt: r.createdAt,
    source: r.source,
    storyVersionHash: r.storyVersionHash,
    storyVersionNumber: r.storyVersionNumber,
    overallScore: r.overallScore,
    dimensions: JSON.parse(r.dimensions),
    summary: r.summary,
    suggestions: JSON.parse(r.suggestions),
  }));

  // Include the current version hash so clients can determine freshness
  const latestVersion = await db.query.storyVersion.findFirst({
    where: (sv, { eq: eqFn }) => eqFn(sv.jiraKey, key),
    orderBy: (sv, { desc: descFn }) => [descFn(sv.createdAt)],
  });

  return NextResponse.json({
    reviews,
    currentVersionHash: latestVersion?.contentHash ?? null,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;

  const t = await db.query.ticket.findFirst({
    where: (row, { eq: eqFn }) => eqFn(row.jiraKey, key),
  });

  if (!t) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  let body: {
    source: "ticket-detail" | "chat" | "bulk-action";
    overallScore: number;
    dimensions: { key: string; label: string; score: number; feedback: string }[];
    summary: string;
    suggestions: string[];
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (
    typeof body.overallScore !== "number" ||
    body.overallScore < 0 ||
    body.overallScore > 100
  ) {
    return NextResponse.json(
      { error: "overallScore must be 0-100" },
      { status: 400 },
    );
  }

  const validSources = ["ticket-detail", "chat", "bulk-action"];
  if (!validSources.includes(body.source)) {
    return NextResponse.json(
      { error: "source must be ticket-detail, chat, or bulk-action" },
      { status: 400 },
    );
  }

  // Get current story version for hash + version number
  const versions = await db
    .select()
    .from(storyVersion)
    .where(eq(storyVersion.jiraKey, key))
    .orderBy(desc(storyVersion.createdAt));

  const latestVersion = versions[0];
  const versionHash = latestVersion?.contentHash ?? "no-version";
  const versionNumber = versions.length;

  const id = randomUUID();

  await db.insert(storedReview).values({
    id,
    ticketKey: key,
    source: body.source,
    storyVersionHash: versionHash,
    storyVersionNumber: versionNumber,
    overallScore: body.overallScore,
    dimensions: JSON.stringify(body.dimensions),
    summary: body.summary,
    suggestions: JSON.stringify(body.suggestions),
  });

  // Update qualityScore on ticketMetadata
  const existingMeta = await db.query.ticketMetadata.findFirst({
    where: (m, { eq: eqFn }) => eqFn(m.jiraKey, key),
  });

  if (existingMeta) {
    await db
      .update(ticketMetadata)
      .set({ qualityScore: body.overallScore })
      .where(eq(ticketMetadata.jiraKey, key));
  } else {
    await db.insert(ticketMetadata).values({
      jiraKey: key,
      qualityScore: body.overallScore,
    } as typeof ticketMetadata.$inferInsert);
  }

  const saved = await db.query.storedReview.findFirst({
    where: (r, { eq: eqFn }) => eqFn(r.id, id),
  });

  await logActivity({
    type: body.source === "bulk-action" ? "bulk-action" : "review",
    scope: key,
    summary: `Review score ${body.overallScore} (${body.source})`,
  });

  return NextResponse.json({
    ...saved,
    dimensions: JSON.parse(saved!.dimensions),
    suggestions: JSON.parse(saved!.suggestions),
  }, { status: 201 });
}
