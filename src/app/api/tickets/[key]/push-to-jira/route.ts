import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket, ticketLocalEdit, storyVersion } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { jiraClient } from "@/lib/jira-client";
import { markdownToAdf } from "@/lib/markdown-to-adf";
import { createHash } from "crypto";

function contentHash(description: unknown, ac: string | null | undefined): string {
  const text = `${JSON.stringify(description ?? "")}|${ac ?? ""}`;
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

/**
 * POST /api/tickets/[key]/push-to-jira
 *
 * Pushes local edits to Jira. Pre-checks that the local mirror is up-to-date
 * with the remote. If not, updates the mirror and returns conflict status.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;

  if (!jiraClient.isLive) {
    return NextResponse.json(
      { error: "Jira is not configured" },
      { status: 503 },
    );
  }

  // Fetch local edits
  const localEdits = await db
    .select()
    .from(ticketLocalEdit)
    .where(eq(ticketLocalEdit.ticketKey, key))
    .all();

  if (localEdits.length === 0) {
    return NextResponse.json(
      { error: "No local edits to push" },
      { status: 400 },
    );
  }

  // Pre-push check: fetch latest from Jira and compare with our mirror
  const remoteIssue = await jiraClient.getIssue(key);
  const remoteUpdated = remoteIssue.fields.updated;

  const localTicket = await db.query.ticket.findFirst({
    where: (row, { eq: eqFn }) => eqFn(row.jiraKey, key),
  });

  if (!localTicket) {
    return NextResponse.json({ error: "Ticket not found locally" }, { status: 404 });
  }

  // Check if the remote has been updated since our last mirror
  const latestVersion = await db.query.storyVersion.findFirst({
    where: (sv, { eq: eqFn }) => eqFn(sv.jiraKey, key),
    orderBy: (sv, { desc }) => [desc(sv.createdAt)],
  });

  const baseHash = localEdits[0].baseJiraVersion;
  const currentMirrorHash = latestVersion?.contentHash ?? null;

  if (localTicket.jiraUpdatedAt !== remoteUpdated) {
    // Remote changed since our mirror. Update mirror first, then check for conflict.
    await fetch(new URL("/api/jira/sync-tickets", "http://localhost:3100"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketKeys: [key] }),
    });

    // Re-check: did the content actually change?
    const newLatestVersion = await db.query.storyVersion.findFirst({
      where: (sv, { eq: eqFn }) => eqFn(sv.jiraKey, key),
      orderBy: (sv, { desc }) => [desc(sv.createdAt)],
    });

    if (newLatestVersion?.contentHash !== baseHash) {
      return NextResponse.json({
        conflict: true,
        message: "Jira was updated since your edit. Review the diff before pushing.",
      });
    }
  }

  // Build the update payload from local edits
  const fields: Record<string, unknown> = {};
  for (const edit of localEdits) {
    if (edit.field === "title") {
      fields.summary = edit.localValue;
    } else if (edit.field === "description") {
      fields.description = markdownToAdf(edit.localValue);
    }
  }

  // Push to Jira
  await jiraClient.updateIssue(key, fields);

  // Refresh mirror from Jira after push
  await fetch(new URL("/api/jira/sync-tickets", "http://localhost:3100"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticketKeys: [key] }),
  });

  // Verify: check if the pushed content matches the new mirror
  const postPushVersion = await db.query.storyVersion.findFirst({
    where: (sv, { eq: eqFn }) => eqFn(sv.jiraKey, key),
    orderBy: (sv, { desc }) => [desc(sv.createdAt)],
  });

  // Delete local edits now that they are pushed
  await db
    .delete(ticketLocalEdit)
    .where(eq(ticketLocalEdit.ticketKey, key));

  return NextResponse.json({
    success: true,
    message: "Local edits pushed to Jira successfully",
    newContentHash: postPushVersion?.contentHash ?? null,
  });
}
