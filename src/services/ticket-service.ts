import { db } from "@/db";
import { ticket, ticketLocalEdit, ticketMetadata, storyVersion } from "@/db/schema";
import type { TicketLocalEdit, TicketMetadata } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { randomUUID, createHash } from "crypto";
import { jiraClient, JiraApiError } from "@/lib/jira-client";
import { markdownToAdf } from "@/lib/markdown-to-adf";
import { adfToMarkdown } from "@/lib/adf-to-markdown";
import { logActivity } from "@/lib/activity-logger";
import { sanitizeHtml, sanitizeText } from "@/lib/sanitize";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { cache } from "@/lib/cache";
import {
  JiraUnavailableError,
  NotFoundError,
  ValidationError,
  JiraOperationError,
} from "./errors";

// ---------------------------------------------------------------------------
// push-to-jira
// ---------------------------------------------------------------------------

function contentHash(description: unknown, ac: string | null | undefined): string {
  const text = `${JSON.stringify(description ?? "")}|${ac ?? ""}`;
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

// Suppress unused-variable warning; kept for potential future use
void contentHash;

export interface PushToJiraResult {
  success: true;
  message: string;
  newContentHash: string | null;
}

export interface PushToJiraConflict {
  conflict: true;
  contentChanged: boolean;
  message: string;
}

export type PushToJiraOutcome = PushToJiraResult | PushToJiraConflict;

export async function pushToJira(key: string, force: boolean): Promise<PushToJiraOutcome> {
  if (!jiraClient.isLive) {
    throw new JiraUnavailableError();
  }

  const localEdits = await db
    .select()
    .from(ticketLocalEdit)
    .where(eq(ticketLocalEdit.ticketKey, key))
    .all();

  if (localEdits.length === 0) {
    throw new ValidationError("No local edits to push");
  }

  const pushedFields = localEdits.map((e) => e.field).join(", ");

  try {
    const remoteIssue = await jiraClient.getIssue(key);
    const remoteUpdated = remoteIssue.fields.updated;

    const localTicket = await db.query.ticket.findFirst({
      where: (row, { eq: eqFn }) => eqFn(row.jiraKey, key),
    });

    if (!localTicket) {
      throw new NotFoundError("Ticket", key);
    }

    const baseHash = localEdits[0].baseJiraVersion;

    if (localTicket.jiraUpdatedAt !== remoteUpdated) {
      // Remote changed since our mirror; refresh the mirror then check content
      const appUrl = env.NEXT_PUBLIC_APP_URL;
      await fetch(new URL("/api/jira/sync-tickets", appUrl), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketKeys: [key] }),
      });

      const newLatestVersion = await db.query.storyVersion.findFirst({
        where: (sv, { eq: eqFn }) => eqFn(sv.jiraKey, key),
        orderBy: (sv, { desc: descFn }) => [descFn(sv.createdAt)],
      });

      const contentChanged = newLatestVersion?.contentHash !== baseHash;

      if (contentChanged) {
        return {
          conflict: true,
          contentChanged: true,
          message: "Jira was updated since your edit. Review the diff before pushing.",
        };
      }

      if (!force) {
        return {
          conflict: true,
          contentChanged: false,
          message: "Jira metadata was updated since your last sync, but the content is unchanged. Review and confirm.",
        };
      }
    }

    const fields: Record<string, unknown> = {};
    for (const edit of localEdits) {
      if (edit.field === "title") {
        fields.summary = edit.localValue;
      } else if (edit.field === "description") {
        fields.description = markdownToAdf(edit.localValue);
      }
    }

    await jiraClient.updateIssue(key, fields);

    const refreshUrl = env.NEXT_PUBLIC_APP_URL;
    await fetch(new URL("/api/jira/sync-tickets", refreshUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketKeys: [key] }),
    });

    // Jira's API may return stale data immediately after a write (eventual
    // consistency). Overwrite the local mirror with the values we just pushed
    // so the ticket detail page always shows the correct content.
    const directUpdates: Record<string, unknown> = {};
    for (const edit of localEdits) {
      if (edit.field === "title") directUpdates.title = edit.localValue;
      else if (edit.field === "description") directUpdates.description = edit.localValue;
    }
    if (Object.keys(directUpdates).length > 0) {
      await db.update(ticket).set(directUpdates).where(eq(ticket.jiraKey, key));
      cache.invalidate(`/api/tickets/${key}`);
    }

    const postPushVersion = await db.query.storyVersion.findFirst({
      where: (sv, { eq: eqFn }) => eqFn(sv.jiraKey, key),
      orderBy: (sv, { desc: descFn }) => [descFn(sv.createdAt)],
    });

    await db
      .delete(ticketLocalEdit)
      .where(eq(ticketLocalEdit.ticketKey, key));

    await logActivity({
      type: "push-to-jira",
      scope: key,
      summary: `Pushed ${pushedFields} to Jira`,
    });

    return {
      success: true,
      message: "Local edits pushed to Jira successfully",
      newContentHash: postPushVersion?.contentHash ?? null,
    };
  } catch (err) {
    // Re-throw typed errors we already produced above (NotFoundError etc.)
    if (err instanceof JiraUnavailableError || err instanceof NotFoundError || err instanceof ValidationError) {
      throw err;
    }

    logger.error("push-to-jira", `failed for ${key}:`, err);

    let userMessage: string;
    let errorDetail: string;

    if (err instanceof JiraApiError) {
      let jiraDetail = err.responseBody;
      try {
        const parsed = JSON.parse(err.responseBody) as {
          errorMessages?: string[];
          errors?: Record<string, string>;
        };
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

    const pushedFieldsForLog = localEdits.map((e) => e.field).join(", ");
    await logActivity({
      type: "push-to-jira",
      scope: key,
      summary: `Failed to push ${pushedFieldsForLog} to Jira`,
      status: "failed",
      errorDetail,
    });

    throw new JiraOperationError("Failed to push to Jira", userMessage);
  }
}

// ---------------------------------------------------------------------------
// pull-from-jira
// ---------------------------------------------------------------------------

export async function pullFromJira(key: string): Promise<{ description: string; title: string }> {
  const issue = await jiraClient.getIssue(key);
  const fields = issue.fields;
  const description =
    typeof fields.description === "string"
      ? fields.description
      : adfToMarkdown(fields.description);

  return { description: description ?? "", title: fields.summary ?? "" };
}

// ---------------------------------------------------------------------------
// local-edits
// ---------------------------------------------------------------------------

export type TicketLocalEditRow = TicketLocalEdit;

export interface UpsertLocalEditInput {
  field: string;
  localValue: unknown;
  baseJiraVersion?: string;
  isDraft?: boolean;
}

export async function getLocalEdits(key: string): Promise<TicketLocalEditRow[]> {
  return db
    .select()
    .from(ticketLocalEdit)
    .where(eq(ticketLocalEdit.ticketKey, key))
    .all();
}

export async function upsertLocalEdit(
  key: string,
  input: UpsertLocalEditInput,
): Promise<TicketLocalEditRow> {
  const { field: rawField, localValue, baseJiraVersion, isDraft } = input;

  if (!rawField || !["title", "description"].includes(rawField as string)) {
    throw new ValidationError("field must be 'title' or 'description'");
  }
  const field = rawField as "title" | "description";

  if (typeof localValue !== "string") {
    throw new ValidationError("localValue must be a string");
  }

  const maxLen = field === "title" ? 500 : 50000;
  if (localValue.length > maxLen) {
    throw new ValidationError(`localValue must not exceed ${maxLen} characters`);
  }

  const sanitizedValue =
    field === "title" ? sanitizeText(localValue) : sanitizeHtml(localValue);

  const now = new Date().toISOString();
  const draftFlag = isDraft === true;

  const existing = await db
    .select()
    .from(ticketLocalEdit)
    .where(
      and(
        eq(ticketLocalEdit.ticketKey, key),
        eq(ticketLocalEdit.field, field),
      ),
    )
    .get();

  let resolvedBase: string | null = baseJiraVersion ?? existing?.baseJiraVersion ?? null;
  if (!resolvedBase) {
    const latestVersion = await db.query.storyVersion.findFirst({
      where: eq(storyVersion.jiraKey, key),
      orderBy: [desc(storyVersion.createdAt)],
    });
    resolvedBase = latestVersion?.contentHash ?? null;
  }

  if (existing) {
    // When saving over a draft, promote it. When auto-saving over a saved edit, keep it saved.
    const newDraftFlag = draftFlag && existing.isDraft;
    await db
      .update(ticketLocalEdit)
      .set({
        localValue: sanitizedValue,
        modifiedAt: now,
        baseJiraVersion: resolvedBase,
        isDraft: newDraftFlag,
      })
      .where(eq(ticketLocalEdit.id, existing.id));
  } else {
    await db.insert(ticketLocalEdit).values({
      id: randomUUID(),
      ticketKey: key,
      field,
      localValue: sanitizedValue,
      baseJiraVersion: resolvedBase,
      isDraft: draftFlag,
      modifiedAt: now,
    });
  }

  const result = await db
    .select()
    .from(ticketLocalEdit)
    .where(
      and(
        eq(ticketLocalEdit.ticketKey, key),
        eq(ticketLocalEdit.field, field),
      ),
    )
    .get();

  if (!draftFlag) {
    await logActivity({
      type: "local-edit",
      scope: key,
      summary: `Edited ${field}`,
    });
  }

  return result!;
}

export async function deleteLocalEdits(
  key: string,
  options: { draftsOnly: boolean },
): Promise<void> {
  if (options.draftsOnly) {
    await db
      .delete(ticketLocalEdit)
      .where(
        and(
          eq(ticketLocalEdit.ticketKey, key),
          eq(ticketLocalEdit.isDraft, true),
        ),
      );
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
}

export async function rebaseLocalEdits(key: string): Promise<{ newBase: string }> {
  const latestVersion = await db.query.storyVersion.findFirst({
    where: eq(storyVersion.jiraKey, key),
    orderBy: [desc(storyVersion.createdAt)],
  });

  if (!latestVersion) {
    throw new NotFoundError("StoryVersion", key);
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

  return { newBase: latestVersion.contentHash };
}

export async function promoteDrafts(key: string): Promise<void> {
  await db
    .update(ticketLocalEdit)
    .set({ isDraft: false, modifiedAt: new Date().toISOString() })
    .where(
      and(
        eq(ticketLocalEdit.ticketKey, key),
        eq(ticketLocalEdit.isDraft, true),
      ),
    );

  await logActivity({
    type: "local-edit",
    scope: key,
    summary: "Saved draft as local edit",
  });
}

// ---------------------------------------------------------------------------
// metadata
// ---------------------------------------------------------------------------

export type TicketMetadataRow = TicketMetadata;

export interface UpdateMetadataInput {
  readiness?: string | null;
  poStatus?: string | null;
  qualityScore?: number | null;
  poNotes?: string | null;
  businessValue?: number | null;
}

const VALID_READINESS_VALUES = [
  null,
  "drafting",
  "waiting_for_feedback",
  "ready_to_refine",
  "on_hold",
];

const VALID_PO_STATUSES = [
  null,
  "New",
  "Draft",
  "Awaiting Feedback",
  "Ready for Refinement",
  "Ready",
  "On Hold",
];

export async function updateTicketMetadata(
  key: string,
  input: UpdateMetadataInput,
): Promise<TicketMetadataRow> {
  const t = await db.query.ticket.findFirst({
    where: (row, { eq: eqFn }) => eqFn(row.jiraKey, key),
  });

  if (!t) {
    throw new NotFoundError("Ticket", key);
  }

  const existing = await db.query.ticketMetadata.findFirst({
    where: (m, { eq: eqFn }) => eqFn(m.jiraKey, key),
  });

  const updates: Record<string, unknown> = {};

  if (input.readiness !== undefined) {
    if (!VALID_READINESS_VALUES.includes(input.readiness)) {
      throw new ValidationError("Invalid readiness value");
    }
    updates.readiness = input.readiness;
  }

  if (input.poStatus !== undefined) {
    if (!VALID_PO_STATUSES.includes(input.poStatus)) {
      throw new ValidationError("Invalid poStatus value");
    }
    updates.poStatus = input.poStatus;
  }

  if (input.qualityScore !== undefined) {
    if (input.qualityScore !== null) {
      if (
        typeof input.qualityScore !== "number" ||
        input.qualityScore < 0 ||
        input.qualityScore > 100
      ) {
        throw new ValidationError(
          "qualityScore must be a number between 0 and 100, or null",
        );
      }
    }
    updates.qualityScore = input.qualityScore;
  }

  if (input.poNotes !== undefined) {
    if (input.poNotes !== null && typeof input.poNotes !== "string") {
      throw new ValidationError("poNotes must be a string or null");
    }
    if (typeof input.poNotes === "string" && input.poNotes.length > 5000) {
      throw new ValidationError("poNotes must not exceed 5000 characters");
    }
    updates.poNotes =
      typeof input.poNotes === "string"
        ? sanitizeHtml(input.poNotes)
        : input.poNotes;
  }

  if (input.businessValue !== undefined) {
    if (input.businessValue !== null) {
      if (
        !Number.isInteger(input.businessValue) ||
        input.businessValue < 0 ||
        input.businessValue > 7
      ) {
        throw new ValidationError(
          "businessValue must be an integer between 0 and 7, or null",
        );
      }
    }
    updates.businessValue = input.businessValue;
  }

  if (existing) {
    await db
      .update(ticketMetadata)
      .set(updates)
      .where(eq(ticketMetadata.jiraKey, key));
  } else {
    await db.insert(ticketMetadata).values({
      jiraKey: key,
      ...updates,
    } as typeof ticketMetadata.$inferInsert);
  }

  const result = await db.query.ticketMetadata.findFirst({
    where: (m, { eq: eqFn }) => eqFn(m.jiraKey, key),
  });

  cache.invalidate(`/api/tickets/${key}`);
  cache.invalidate(/^\/api\/tickets(\?|$)/);

  const changedFields = Object.keys(updates).join(", ");
  await logActivity({
    type: "metadata-update",
    scope: key,
    summary: `Updated ${changedFields}`,
  });

  return result!;
}
