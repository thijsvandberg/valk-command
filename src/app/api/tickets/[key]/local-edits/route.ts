import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticketLocalEdit, storyVersion } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logActivity } from "@/lib/activity-logger";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;

  const edits = await db
    .select()
    .from(ticketLocalEdit)
    .where(eq(ticketLocalEdit.ticketKey, key))
    .all();

  return NextResponse.json(edits);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rawField = body.field;
  const localValue = body.localValue;
  const baseJiraVersion = body.baseJiraVersion as string | undefined;
  const isDraft = body.isDraft;

  if (!rawField || !["title", "description"].includes(rawField as string)) {
    return NextResponse.json(
      { error: "field must be 'title' or 'description'" },
      { status: 400 },
    );
  }
  const field = rawField as "title" | "description";

  if (typeof localValue !== "string") {
    return NextResponse.json(
      { error: "localValue must be a string" },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const draftFlag = isDraft === true;

  const existing = await db
    .select()
    .from(ticketLocalEdit)
    .where(and(eq(ticketLocalEdit.ticketKey, key), eq(ticketLocalEdit.field, field)))
    .get();

  // Resolve baseJiraVersion: use explicit value, keep existing, or look up latest
  let resolvedBase: string | null = baseJiraVersion ?? existing?.baseJiraVersion ?? null;
  if (!resolvedBase) {
    const latestVersion = await db.query.storyVersion.findFirst({
      where: eq(storyVersion.jiraKey, key),
      orderBy: [desc(storyVersion.createdAt)],
    });
    resolvedBase = latestVersion?.contentHash ?? null;
  }

  if (existing) {
    // When saving (isDraft=false) over a draft, promote it.
    // When auto-saving (isDraft=true) over a saved edit, keep it saved.
    const newDraftFlag = draftFlag && existing.isDraft;
    await db
      .update(ticketLocalEdit)
      .set({ localValue, modifiedAt: now, baseJiraVersion: resolvedBase, isDraft: newDraftFlag })
      .where(eq(ticketLocalEdit.id, existing.id));
  } else {
    await db.insert(ticketLocalEdit).values({
      id: randomUUID(),
      ticketKey: key,
      field: field as "title" | "description",
      localValue,
      baseJiraVersion: resolvedBase,
      isDraft: draftFlag,
      modifiedAt: now,
    });
  }

  const result = await db
    .select()
    .from(ticketLocalEdit)
    .where(and(eq(ticketLocalEdit.ticketKey, key), eq(ticketLocalEdit.field, field)))
    .get();

  if (!draftFlag) {
    await logActivity({
      type: "local-edit",
      scope: key,
      summary: `Edited ${field}`,
    });
  }

  return NextResponse.json(result);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  const url = new URL(request.url);
  const draftsOnly = url.searchParams.get("draftsOnly") === "true";

  if (draftsOnly) {
    await db
      .delete(ticketLocalEdit)
      .where(and(eq(ticketLocalEdit.ticketKey, key), eq(ticketLocalEdit.isDraft, true)));
  } else {
    await db
      .delete(ticketLocalEdit)
      .where(eq(ticketLocalEdit.ticketKey, key));

    await logActivity({
      type: "local-edit",
      scope: key,
      summary: "Discarded all local edits",
    });
  }

  return NextResponse.json({ success: true });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // No body is fine for rebase
  }

  // Promote drafts to saved edits
  if (body.promoteDrafts === true) {
    await db
      .update(ticketLocalEdit)
      .set({ isDraft: false, modifiedAt: new Date().toISOString() })
      .where(and(eq(ticketLocalEdit.ticketKey, key), eq(ticketLocalEdit.isDraft, true)));

    await logActivity({
      type: "local-edit",
      scope: key,
      summary: "Saved draft as local edit",
    });

    return NextResponse.json({ success: true });
  }

  // Rebase: update baseJiraVersion on all local edits to match the latest stored version
  const latestVersion = await db.query.storyVersion.findFirst({
    where: eq(storyVersion.jiraKey, key),
    orderBy: [desc(storyVersion.createdAt)],
  });

  if (!latestVersion) {
    return NextResponse.json({ error: "No version found to rebase onto" }, { status: 404 });
  }

  await db
    .update(ticketLocalEdit)
    .set({ baseJiraVersion: latestVersion.contentHash })
    .where(eq(ticketLocalEdit.ticketKey, key));

  await logActivity({
    type: "local-edit",
    scope: key,
    summary: "Rebased local edits onto latest Jira version",
  });

  return NextResponse.json({ success: true, newBase: latestVersion.contentHash });
}
