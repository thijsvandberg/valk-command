import { db } from "@/db";
import { ticket, ticketLocalEdit, ticketMetadata, storyVersion, storyWriterSession } from "@/db/schema";
import type { TicketLocalEdit, TicketMetadata } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { randomUUID, createHash } from "crypto";
import { jiraClient, JiraApiError, FLAGGED_FIELD } from "@/lib/jira-client";
import { markdownToAdf } from "@/lib/markdown-to-adf";
import { adfToMarkdown } from "@/lib/adf-to-markdown";
import { logActivity } from "@/lib/activity-logger";
import { sanitizeText } from "@/lib/sanitize";
import { syncIndividualTickets } from "@/lib/sync-tickets-service";
import { logger } from "@/lib/logger";
import { cache } from "@/lib/cache";
import { emitTicketEvent } from "@/lib/ticket-events";
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
      // Remote changed since our mirror; refresh the mirror then check content.
      // Call the sync service directly rather than via an HTTP request to our
      // own server: a self-fetch in next dev can stall indefinitely and, unlike
      // the Jira client, carries no request timeout, which hung the push.
      await syncIndividualTickets([key]);

      // Only check for conflicts when we have a previous sync baseline.
      // Tickets created via Bridge start with jiraUpdatedAt=null and no
      // storyVersion, so there is nothing meaningful to conflict with.
      if (localTicket.jiraUpdatedAt !== null) {
        const newLatestVersion = await db.query.storyVersion.findFirst({
          where: (sv, { eq: eqFn }) => eqFn(sv.jiraKey, key),
          orderBy: (sv, { desc: descFn }) => [descFn(sv.createdAt)],
        });

        const contentChanged = baseHash !== null && newLatestVersion?.contentHash !== baseHash;

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

    // Write the pushed values directly to the local mirror instead of
    // re-fetching from Jira. A sync right after a write often returns stale
    // data due to Jira's eventual consistency, which overwrites the title/
    // description we just pushed. The next page load will reconcile via the
    // deferred checkUpdated mechanism.
    const directUpdates: Record<string, unknown> = {};
    for (const edit of localEdits) {
      if (edit.field === "title") directUpdates.title = edit.localValue;
      else if (edit.field === "description") directUpdates.description = edit.localValue;
    }
    if (Object.keys(directUpdates).length > 0) {
      db.update(ticket).set(directUpdates).where(eq(ticket.jiraKey, key)).run();
    }

    const postPushVersion = await db.query.storyVersion.findFirst({
      where: (sv, { eq: eqFn }) => eqFn(sv.jiraKey, key),
      orderBy: (sv, { desc: descFn }) => [descFn(sv.createdAt)],
    });

    db.delete(ticketLocalEdit)
      .where(eq(ticketLocalEdit.ticketKey, key))
      .run();

    // Rebase any active Story Writer session onto the just-pushed version so its
    // draft is not falsely flagged as outdated immediately after a push.
    if (postPushVersion?.contentHash) {
      db.update(storyWriterSession)
        .set({ baseVersionHash: postPushVersion.contentHash, updatedAt: new Date().toISOString() })
        .where(and(eq(storyWriterSession.ticketKey, key), eq(storyWriterSession.status, "active")))
        .run();
    }

    cache.invalidate(`/api/tickets/${key}`);
    cache.invalidate(/^\/api\/tickets(\?|$)/);

    await logActivity({
      type: "push-to-jira",
      scope: key,
      summary: `Pushed ${pushedFields} to Jira`,
    });

    // Let an open editor (e.g. Story Writer in another tab) react to the push.
    emitTicketEvent({ type: "content:changed", ticketKey: key });

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

  // Sync flagged + title from the full Jira response
  const rawFlagged = (fields as unknown as Record<string, unknown>)[FLAGGED_FIELD];
  const isFlagged = Array.isArray(rawFlagged) ? rawFlagged.length > 0 : Boolean(rawFlagged);
  await db.update(ticket).set({
    flagged: isFlagged,
    title: fields.summary,
  }).where(eq(ticket.jiraKey, key));

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

  // Title: strip HTML tags. Description: store raw markdown (rendered safely via React JSX).
  const sanitizedValue =
    field === "title" ? sanitizeText(localValue) : localValue;

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
  guestimation?: number | null;
}

// Forward-planning guestimation (BRDG-303): same Fibonacci scale as story points.
// 0 means N/A (mirrors the SP "-" option); null clears it.
const VALID_GUESTIMATION_VALUES = [0, 1, 2, 3, 5, 8];

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
        ? input.poNotes
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

  if (input.guestimation !== undefined) {
    if (input.guestimation !== null && !VALID_GUESTIMATION_VALUES.includes(input.guestimation)) {
      throw new ValidationError(
        "guestimation must be null or one of 0, 1, 2, 3, 5, 8",
      );
    }
    updates.guestimation = input.guestimation;
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
