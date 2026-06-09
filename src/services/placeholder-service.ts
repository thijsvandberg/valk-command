import { db } from "@/db";
import { placeholderTicket, ticketLocalEdit } from "@/db/schema";
import type { PlaceholderTicketRow } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { cache } from "@/lib/cache";
import { logActivity } from "@/lib/activity-logger";
import { createTicketWithJira } from "@/lib/create-ticket";
import { updateTicketMetadata } from "@/services/ticket-service";
import { ValidationError, NotFoundError } from "@/services/errors";

// Bridge-local placeholder tickets (BRDG-304). Forward-planning stand-ins that
// never touch Jira until promoted. All validation lives here so the routes stay
// thin; promotion reuses the shared createTicketWithJira path.

const VALID_BUSINESS_VALUES = [0, 1, 2, 3, 4, 5, 6, 7];
// Same Fibonacci scale as the BRDG-303 guestimation (0 = N/A).
const VALID_GUESTIMATION_VALUES = [0, 1, 2, 3, 5, 8];
const VALID_TYPES = ["story", "task", "bug", "spike"];
// Maps the stored lower-case type to the capitalized Jira issue type on promotion.
const JIRA_ISSUE_TYPE: Record<string, string> = {
  story: "Story",
  task: "Task",
  bug: "Bug",
  spike: "Spike",
};

export interface PlaceholderListFilter {
  sprintId?: string | null;
  epicKey?: string | null;
}

export interface CreatePlaceholderInput {
  title: string;
  description?: string;
  type?: string;
  sprintId?: string | null;
  epicKey?: string | null;
  businessValue?: number | null;
  guestimation?: number | null;
}

export interface UpdatePlaceholderInput {
  title?: string;
  description?: string;
  type?: string;
  sprintId?: string | null;
  epicKey?: string | null;
  businessValue?: number | null;
  guestimation?: number | null;
}

function invalidateTicketCaches(): void {
  cache.invalidate(/^\/api\/tickets(\?|$)/);
}

async function resolveSprintName(sprintId: string | null | undefined): Promise<string | null> {
  if (!sprintId) return null;
  const row = await db.query.sprintNameCache.findFirst({
    where: (s, { eq: eqFn }) => eqFn(s.sprintId, sprintId),
  });
  return row?.displayName ?? null;
}

async function resolveEpicTitle(epicKey: string | null | undefined): Promise<string | null> {
  if (!epicKey) return null;
  const row = await db.query.ticket.findFirst({
    where: (t, { eq: eqFn }) => eqFn(t.jiraKey, epicKey),
  });
  return row?.title ?? null;
}

function validateType(type: string): string {
  const lowered = type.toLowerCase();
  if (!VALID_TYPES.includes(lowered)) {
    throw new ValidationError(`type must be one of: ${VALID_TYPES.join(", ")}`);
  }
  return lowered;
}

function validateBusinessValue(value: number | null): void {
  if (value !== null && !VALID_BUSINESS_VALUES.includes(value)) {
    throw new ValidationError("businessValue must be an integer between 0 and 7, or null");
  }
}

function validateGuestimation(value: number | null): void {
  if (value !== null && !VALID_GUESTIMATION_VALUES.includes(value)) {
    throw new ValidationError("guestimation must be null or one of 0, 1, 2, 3, 5, 8");
  }
}

export async function listPlaceholders(filter: PlaceholderListFilter = {}): Promise<PlaceholderTicketRow[]> {
  const conditions = [eq(placeholderTicket.status, "active")];
  if (filter.sprintId !== undefined && filter.sprintId !== null) {
    conditions.push(eq(placeholderTicket.sprintId, filter.sprintId));
  }
  if (filter.epicKey !== undefined && filter.epicKey !== null) {
    conditions.push(eq(placeholderTicket.epicKey, filter.epicKey));
  }
  return db
    .select()
    .from(placeholderTicket)
    .where(and(...conditions))
    .orderBy(desc(placeholderTicket.createdAt));
}

export async function createPlaceholder(input: CreatePlaceholderInput): Promise<PlaceholderTicketRow> {
  const title = input.title?.trim();
  if (!title) {
    throw new ValidationError("title is required");
  }
  const type = input.type ? validateType(input.type) : "story";
  const businessValue = input.businessValue ?? null;
  const guestimation = input.guestimation ?? null;
  validateBusinessValue(businessValue);
  validateGuestimation(guestimation);

  const sprintId = input.sprintId ?? null;
  const epicKey = input.epicKey ?? null;
  const id = `PLH-${randomUUID()}`;

  await db.insert(placeholderTicket).values({
    id,
    title,
    description: input.description ?? "",
    type,
    sprintId,
    sprintName: await resolveSprintName(sprintId),
    epicKey,
    epic: await resolveEpicTitle(epicKey),
    businessValue,
    guestimation,
    status: "active",
  });

  invalidateTicketCaches();
  await logActivity({
    type: "metadata-update",
    scope: id,
    summary: `Created placeholder: ${title}`,
  });

  const row = await db.query.placeholderTicket.findFirst({
    where: (p, { eq: eqFn }) => eqFn(p.id, id),
  });
  return row!;
}

export async function updatePlaceholder(id: string, input: UpdatePlaceholderInput): Promise<PlaceholderTicketRow> {
  const existing = await db.query.placeholderTicket.findFirst({
    where: (p, { eq: eqFn }) => eqFn(p.id, id),
  });
  if (!existing) {
    throw new NotFoundError("Placeholder", id);
  }

  const updates: Partial<typeof placeholderTicket.$inferInsert> = {};

  if (input.title !== undefined) {
    const title = input.title.trim();
    if (!title) throw new ValidationError("title must not be empty");
    updates.title = title;
  }
  if (input.description !== undefined) {
    if (typeof input.description !== "string") throw new ValidationError("description must be a string");
    updates.description = input.description;
  }
  if (input.type !== undefined) {
    updates.type = validateType(input.type);
  }
  if (input.businessValue !== undefined) {
    validateBusinessValue(input.businessValue);
    updates.businessValue = input.businessValue;
  }
  if (input.guestimation !== undefined) {
    validateGuestimation(input.guestimation);
    updates.guestimation = input.guestimation;
  }
  if (input.sprintId !== undefined) {
    updates.sprintId = input.sprintId;
    updates.sprintName = await resolveSprintName(input.sprintId);
  }
  if (input.epicKey !== undefined) {
    updates.epicKey = input.epicKey;
    updates.epic = await resolveEpicTitle(input.epicKey);
  }

  updates.updatedAt = new Date().toISOString();

  await db.update(placeholderTicket).set(updates).where(eq(placeholderTicket.id, id));
  invalidateTicketCaches();

  const row = await db.query.placeholderTicket.findFirst({
    where: (p, { eq: eqFn }) => eqFn(p.id, id),
  });
  return row!;
}

export async function deletePlaceholder(id: string): Promise<void> {
  const existing = await db.query.placeholderTicket.findFirst({
    where: (p, { eq: eqFn }) => eqFn(p.id, id),
  });
  if (!existing) {
    throw new NotFoundError("Placeholder", id);
  }
  await db.delete(placeholderTicket).where(eq(placeholderTicket.id, id));
  invalidateTicketCaches();
  await logActivity({
    type: "metadata-update",
    scope: id,
    summary: `Deleted placeholder: ${existing.title}`,
  });
}

export interface PromotePlaceholderResult {
  key: string;
}

/**
 * Promotes a placeholder into a real Jira ticket: creates the issue via the
 * shared create path, carries the description over as a local edit (pushable to
 * Jira) and the BV + guestimation into ticketMetadata, then marks the placeholder
 * promoted with the new key. The active-only list filter means the placeholder
 * row disappears and the real ticket takes its place, leaving no duplicate.
 */
export async function promotePlaceholder(id: string): Promise<PromotePlaceholderResult> {
  const placeholder = await db.query.placeholderTicket.findFirst({
    where: (p, { eq: eqFn }) => eqFn(p.id, id),
  });
  if (!placeholder) {
    throw new NotFoundError("Placeholder", id);
  }
  if (placeholder.status !== "active") {
    throw new ValidationError("Placeholder has already been promoted");
  }

  const issueType = JIRA_ISSUE_TYPE[placeholder.type] ?? "Story";
  const created = await createTicketWithJira({
    title: placeholder.title,
    issueType,
    sprintId: placeholder.sprintId ?? undefined,
    epicKey: placeholder.epicKey ?? undefined,
  });

  // Carry the description over as a committed local edit so it surfaces in Bridge
  // and can be pushed to Jira. A freshly created ticket has no Jira baseline, which
  // pushToJira handles explicitly (null baseJiraVersion).
  if (placeholder.description.trim()) {
    await db.insert(ticketLocalEdit).values({
      id: randomUUID(),
      ticketKey: created.key,
      field: "description",
      localValue: placeholder.description,
      baseJiraVersion: null,
      isDraft: false,
    });
  }

  // BV + guestimation ride into the Bridge metadata layer via the canonical writer.
  if (placeholder.businessValue !== null || placeholder.guestimation !== null) {
    await updateTicketMetadata(created.key, {
      businessValue: placeholder.businessValue,
      guestimation: placeholder.guestimation,
    });
  }

  await db
    .update(placeholderTicket)
    .set({ status: "promoted", promotedToKey: created.key, updatedAt: new Date().toISOString() })
    .where(eq(placeholderTicket.id, id));

  invalidateTicketCaches();
  await logActivity({
    type: "metadata-update",
    scope: created.key,
    summary: `Promoted placeholder to ${created.key}: ${placeholder.title}`,
  });

  return { key: created.key };
}
