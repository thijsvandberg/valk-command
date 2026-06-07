import { NextResponse } from "next/server";
import { validatePathParam } from "@/lib/api-validation";
import { errorResponse } from "@/lib/api-response";
import { db } from "@/db";
import {
  storyWriterSession,
  storyWriterDraft,
  epicChildDraft,
  conversation,
  message,
  storyVersion,
  ticket,
  ticketLocalEdit,
} from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limiter";

type RouteContext = { params: Promise<{ key: string }> };

/**
 * Loads the active epic-mode Story Writer session for an epic, including its
 * phase, chat history, and AI drafts. Resumable: reopening restores everything.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  const { key } = await params;
  const invalid = validatePathParam(key);
  if (invalid) return invalid;

  try {
    const session = await db
      .select()
      .from(storyWriterSession)
      .where(
        and(
          eq(storyWriterSession.ticketKey, key),
          eq(storyWriterSession.status, "active"),
          eq(storyWriterSession.mode, "epic"),
        ),
      )
      .get();

    if (!session) {
      return NextResponse.json({ session: null, messages: [], aiDrafts: [], cards: [] });
    }

    // Heal an empty draft from the epic's local edit or live description, the
    // same recovery the Story Writer applies (the draft is a one-time snapshot
    // at creation, so a later-arriving description would otherwise be missed).
    let resolvedSession = session;
    if (!session.localDraft) {
      const [descEdit, ticketRow] = await Promise.all([
        db
          .select()
          .from(ticketLocalEdit)
          .where(
            and(
              eq(ticketLocalEdit.ticketKey, key),
              eq(ticketLocalEdit.field, "description"),
            ),
          )
          .get(),
        db.query.ticket.findFirst({ where: eq(ticket.jiraKey, key) }),
      ]);
      const recovered = descEdit?.localValue ?? ticketRow?.description ?? "";
      if (recovered) {
        await db
          .update(storyWriterSession)
          .set({ localDraft: recovered, updatedAt: new Date().toISOString() })
          .where(eq(storyWriterSession.id, session.id));
        resolvedSession = { ...resolvedSession, localDraft: recovered };
      }
    }

    const [aiDrafts, messages, cards] = await Promise.all([
      db
        .select()
        .from(storyWriterDraft)
        .where(eq(storyWriterDraft.sessionId, session.id))
        .orderBy(storyWriterDraft.draftIndex)
        .all(),
      db
        .select()
        .from(message)
        .where(eq(message.conversationId, session.conversationId))
        .orderBy(message.timestamp)
        .all(),
      db
        .select()
        .from(epicChildDraft)
        .where(eq(epicChildDraft.sessionId, session.id))
        .orderBy(epicChildDraft.cardIndex)
        .all(),
    ]);

    return NextResponse.json({ session: resolvedSession, messages, aiDrafts, cards });
  } catch (err) {
    logger.error("epic-writer", "GET session failed", err);
    return errorResponse("Failed to load epic writer session", 500);
  }
}

/**
 * Creates (or resumes) an epic-mode session. The epic is a ticket row of type
 * epic, so all FKs resolve and the session is keyed by the epic key. A
 * near-empty epic is a valid starting point: localDraft becomes "".
 */
export async function POST(_request: Request, { params }: RouteContext) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const { key } = await params;
  const invalid = validatePathParam(key);
  if (invalid) return invalid;

  try {
    const ticketRow = await db
      .select()
      .from(ticket)
      .where(eq(ticket.jiraKey, key))
      .get();

    if (!ticketRow) {
      return errorResponse("Epic not found", 404);
    }

    const [latestVersion, descLocalEdit] = await Promise.all([
      db.query.storyVersion.findFirst({
        where: eq(storyVersion.jiraKey, key),
        orderBy: [desc(storyVersion.createdAt)],
      }),
      db
        .select()
        .from(ticketLocalEdit)
        .where(
          and(eq(ticketLocalEdit.ticketKey, key), eq(ticketLocalEdit.field, "description")),
        )
        .get(),
    ]);

    // Near-empty epic -> "" is a supported starting point.
    const initialDraft = descLocalEdit?.localValue ?? ticketRow.description ?? "";
    const initialTitle = ticketRow.title ?? "";

    // Reuse an existing conversation for this epic to avoid sidebar duplicates.
    const existingConversation = await db
      .select()
      .from(conversation)
      .where(eq(conversation.relatedTicket, key))
      .get();

    let conversationId: string;
    if (existingConversation) {
      conversationId = existingConversation.id;
    } else {
      conversationId = randomUUID();
      await db.insert(conversation).values({
        id: conversationId,
        title: `Epic Writer: ${key}`,
        relatedTicket: key,
      });
    }

    const sessionId = randomUUID();

    // Atomic existence-check + insert prevents two concurrent creates from both
    // passing the guard (mirrors the Story Writer conflict guard).
    const conflictError = db.transaction((tx) => {
      const existing = tx
        .select()
        .from(storyWriterSession)
        .where(
          and(
            eq(storyWriterSession.ticketKey, key),
            eq(storyWriterSession.status, "active"),
          ),
        )
        .get();

      if (existing) return "conflict";

      tx.insert(storyWriterSession).values({
        id: sessionId,
        ticketKey: key,
        conversationId,
        status: "active",
        mode: "epic",
        phase: "feed",
        localDraft: initialDraft,
        localTitle: initialTitle,
        baseVersionHash: latestVersion?.contentHash ?? null,
      }).run();

      return null;
    });

    if (conflictError === "conflict") {
      return errorResponse("An active writer session already exists for this epic", 409);
    }

    const session = await db
      .select()
      .from(storyWriterSession)
      .where(eq(storyWriterSession.id, sessionId))
      .get();

    await logActivity({
      type: "story-writer",
      scope: key,
      summary: "Started epic writer session",
    });

    return NextResponse.json({ session, messages: [], aiDrafts: [], cards: [] }, { status: 201 });
  } catch (err) {
    logger.error("epic-writer", "POST session failed", err);
    return errorResponse("Failed to create epic writer session", 500);
  }
}
