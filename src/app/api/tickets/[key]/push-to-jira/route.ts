import { NextResponse } from "next/server";
import { db } from "@/db";
import { ticket, ticketLocalEdit, storyVersion } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { jiraClient, JiraApiError } from "@/lib/jira-client";
import { markdownToAdf } from "@/lib/markdown-to-adf";
import { createHash } from "crypto";
import { logActivity } from "@/lib/activity-logger";

function contentHash(description: unknown, ac: string | null | undefined): string {
  const text = `${JSON.stringify(description ?? "")}|${ac ?? ""}`;
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

/**
 * POST /api/tickets/[key]/push-to-jira
 *
 * Pushes local edits to Jira. Pre-checks that the local mirror is up-to-date
 * with the remote. If not, updates the mirror and returns conflict status.
 *
 * Body (optional): { force: true } to skip the remote-change check (used
 * after the user has reviewed the diff and confirmed the push).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;

  let force = false;
  try {
    const body = await request.json();
    force = body?.force === true;
  } catch {
    // No body or invalid JSON is fine
  }

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

  const pushedFields = localEdits.map((e) => e.field).join(", ");

  try {
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

    if (localTicket.jiraUpdatedAt !== remoteUpdated) {
      // Remote changed since our mirror. Update mirror first, then check for conflict.
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3100";
      await fetch(new URL("/api/jira/sync-tickets", appUrl), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketKeys: [key] }),
      });

      // Re-check: did the content actually change?
      const newLatestVersion = await db.query.storyVersion.findFirst({
        where: (sv, { eq: eqFn }) => eqFn(sv.jiraKey, key),
        orderBy: (sv, { desc }) => [desc(sv.createdAt)],
      });

      const contentChanged = newLatestVersion?.contentHash !== baseHash;

      if (contentChanged) {
        return NextResponse.json({
          conflict: true,
          contentChanged: true,
          message: "Jira was updated since your edit. Review the diff before pushing.",
        });
      }

      // Content is the same but metadata changed (status transition, comment, etc.)
      if (!force) {
        return NextResponse.json({
          conflict: true,
          contentChanged: false,
          message: "Jira metadata was updated since your last sync, but the content is unchanged. Review and confirm.",
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
    const refreshUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3100";
    await fetch(new URL("/api/jira/sync-tickets", refreshUrl), {
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

    await logActivity({
      type: "push-to-jira",
      scope: key,
      summary: `Pushed ${pushedFields} to Jira`,
    });

    return NextResponse.json({
      success: true,
      message: "Local edits pushed to Jira successfully",
      newContentHash: postPushVersion?.contentHash ?? null,
    });
  } catch (err) {
    console.error(`push-to-jira failed for ${key}:`, err);

    let userMessage: string;
    let errorDetail: string;

    if (err instanceof JiraApiError) {
      // Try to extract a readable error from the Jira response body
      let jiraDetail = err.responseBody;
      try {
        const parsed = JSON.parse(err.responseBody) as { errorMessages?: string[]; errors?: Record<string, string> };
        const parts: string[] = [];
        if (parsed.errorMessages?.length) parts.push(...parsed.errorMessages);
        if (parsed.errors) parts.push(...Object.entries(parsed.errors).map(([k, v]) => `${k}: ${v}`));
        if (parts.length) jiraDetail = parts.join("; ");
      } catch {
        // response body was not JSON, use as-is
      }
      userMessage = `Jira ${err.status}: ${jiraDetail || err.statusText}`;
      errorDetail = userMessage;
    } else {
      errorDetail = err instanceof Error ? err.message : String(err);
      userMessage = errorDetail;
    }

    await logActivity({
      type: "push-to-jira",
      scope: key,
      summary: `Failed to push ${pushedFields} to Jira`,
      status: "failed",
      errorDetail,
    });

    return NextResponse.json(
      { error: "Failed to push to Jira", detail: userMessage },
      { status: 500 },
    );
  }
}
