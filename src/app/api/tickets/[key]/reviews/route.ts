import { NextResponse } from "next/server";
import { db } from "@/db";
import { storedReview, ticketMetadata, storyVersion, activityLog } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logActivity } from "@/lib/activity-logger";
import { safeJsonParse } from "@/lib/api-validation";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;

  const [rows, latestVersion] = await Promise.all([
    db.select().from(storedReview).where(eq(storedReview.ticketKey, key)).orderBy(desc(storedReview.createdAt)),
    db.query.storyVersion.findFirst({
      where: (sv, { eq: eqFn }) => eqFn(sv.jiraKey, key),
      orderBy: (sv, { desc: descFn }) => [descFn(sv.createdAt)],
    }),
  ]);

  const reviews = rows.map((r) => ({
    id: r.id,
    ticketKey: r.ticketKey,
    createdAt: r.createdAt,
    source: r.source,
    storyVersionHash: r.storyVersionHash,
    storyVersionNumber: r.storyVersionNumber,
    overallScore: r.overallScore,
    dimensions: safeJsonParse(r.dimensions, [], "reviews"),
    summary: r.summary,
    suggestions: safeJsonParse(r.suggestions, [], "reviews"),
  }));

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

  // Fetch latest version hash and total count in parallel — no need to load all version rows
  const [latestVersion, versionCountRows] = await Promise.all([
    db.query.storyVersion.findFirst({
      where: (sv, { eq: eqFn }) => eqFn(sv.jiraKey, key),
      orderBy: (sv, { desc: descFn }) => [descFn(sv.createdAt)],
      columns: { contentHash: true },
    }),
    db.select({ count: sql<number>`count(*)` }).from(storyVersion).where(eq(storyVersion.jiraKey, key)),
  ]);

  const versionHash = latestVersion?.contentHash ?? "no-version";
  const versionNumber = versionCountRows[0]?.count ?? 0;

  const id = randomUUID();
  const createdAt = new Date().toISOString();

  // Upsert qualityScore and insert review in parallel — ticketMetadata.jiraKey is the PK
  await Promise.all([
    db.insert(ticketMetadata)
      .values({ jiraKey: key, qualityScore: body.overallScore } as typeof ticketMetadata.$inferInsert)
      .onConflictDoUpdate({ target: ticketMetadata.jiraKey, set: { qualityScore: body.overallScore } }),
    db.insert(storedReview).values({
      id,
      ticketKey: key,
      source: body.source,
      storyVersionHash: versionHash,
      storyVersionNumber: versionNumber,
      overallScore: body.overallScore,
      dimensions: JSON.stringify(body.dimensions),
      summary: body.summary,
      suggestions: JSON.stringify(body.suggestions),
      createdAt,
    }),
  ]);

  await logActivity({
    type: body.source === "bulk-action" ? "bulk-action" : "review",
    scope: key,
    summary: `Review score ${body.overallScore} (${body.source})`,
  });

  return NextResponse.json({
    id,
    ticketKey: key,
    createdAt,
    source: body.source,
    storyVersionHash: versionHash,
    storyVersionNumber: versionNumber,
    overallScore: body.overallScore,
    dimensions: body.dimensions,
    summary: body.summary,
    suggestions: body.suggestions,
  }, { status: 201 });
}
