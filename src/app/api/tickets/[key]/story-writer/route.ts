import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { storyWriterSession, storyWriterDraft, conversation, message, storyVersion, ticket, ticketLocalEdit, relatedStoryCandidate } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";

const patchSessionSchema = z.object({
  localDraft: z.string().optional(),
  localTitle: z.string().optional(),
  targetLocalDraft: z.string().optional(),
  targetLocalTitle: z.string().optional(),
  clearSplit: z.boolean().optional(),
  status: z.enum(["active", "completed", "discarded"]).optional(),
  acceptDraftId: z.string().optional(),
});

type RouteContext = { params: Promise<{ key: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const { key } = await params;
  const { searchParams } = new URL(request.url);
  const draftsOnly = searchParams.get("draftsOnly") === "true";

  try {
    const session = await db
      .select()
      .from(storyWriterSession)
      .where(
        and(
          eq(storyWriterSession.ticketKey, key),
          eq(storyWriterSession.status, "active"),
        ),
      )
      .get();

    if (!session) {
      return NextResponse.json({ session: null, messages: [], aiDrafts: [], relatedCandidates: [] });
    }

    // If targetLocalDraft is empty but the target ticket has a local edit, recover it and persist
    // so subsequent loads are instant. This heals sessions broken by earlier clearing bugs.
    let resolvedSession = session;
    if (session.targetTicketKey && !session.targetLocalDraft) {
      const targetEdit = await db
        .select()
        .from(ticketLocalEdit)
        .where(
          and(
            eq(ticketLocalEdit.ticketKey, session.targetTicketKey),
            eq(ticketLocalEdit.field, "description"),
          ),
        )
        .get();
      if (targetEdit?.localValue) {
        await db
          .update(storyWriterSession)
          .set({ targetLocalDraft: targetEdit.localValue, updatedAt: new Date().toISOString() })
          .where(eq(storyWriterSession.id, session.id));
        resolvedSession = { ...session, targetLocalDraft: targetEdit.localValue };
      }
    }

    const aiDrafts = await db.select().from(storyWriterDraft)
      .where(eq(storyWriterDraft.sessionId, session.id))
      .orderBy(storyWriterDraft.draftIndex)
      .all();

    const relatedCandidates = await db.select().from(relatedStoryCandidate)
      .where(eq(relatedStoryCandidate.sessionId, session.id))
      .all();

    if (draftsOnly) {
      return NextResponse.json({ session: resolvedSession, messages: [], aiDrafts, relatedCandidates });
    }

    const messages = await db.select().from(message)
      .where(eq(message.conversationId, session.conversationId))
      .orderBy(message.timestamp)
      .all();

    return NextResponse.json({ session: resolvedSession, messages, aiDrafts, relatedCandidates });
  } catch (err) {
    logger.error("story-writer", "GET failed", err);
    return NextResponse.json({ error: "Failed to load story writer session" }, { status: 500 });
  }
}

export async function POST(_request: Request, { params }: RouteContext) {
  const { key } = await params;

  try {
    const ticketRow = await db
      .select()
      .from(ticket)
      .where(eq(ticket.jiraKey, key))
      .get();

    if (!ticketRow) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    const [latestVersion, descLocalEdit, titleLocalEdit] = await Promise.all([
      db.query.storyVersion.findFirst({
        where: eq(storyVersion.jiraKey, key),
        orderBy: [desc(storyVersion.createdAt)],
      }),
      db.select().from(ticketLocalEdit).where(
        and(eq(ticketLocalEdit.ticketKey, key), eq(ticketLocalEdit.field, "description")),
      ).get(),
      db.select().from(ticketLocalEdit).where(
        and(eq(ticketLocalEdit.ticketKey, key), eq(ticketLocalEdit.field, "title")),
      ).get(),
    ]);

    // Use local edit (draft or saved) over raw Jira description/title
    const initialDraft = descLocalEdit?.localValue ?? ticketRow.description ?? "";
    const initialTitle = titleLocalEdit?.localValue ?? ticketRow.title ?? "";

    // Reuse existing conversation for this ticket to avoid duplicates in the sidebar
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
        title: `Story Writer: ${key}`,
        relatedTicket: key,
      });
    }

    const sessionId = randomUUID();

    // Use a transaction to atomically check for an existing active session and insert.
    // This prevents two concurrent requests from both passing the existence check.
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
        localDraft: initialDraft,
        localTitle: initialTitle,
        baseVersionHash: latestVersion?.contentHash ?? null,
      }).run();

      return null;
    });

    if (conflictError === "conflict") {
      return NextResponse.json(
        { error: "An active story writer session already exists for this ticket" },
        { status: 409 },
      );
    }

    const session = await db
      .select()
      .from(storyWriterSession)
      .where(eq(storyWriterSession.id, sessionId))
      .get();

    await logActivity({
      type: "story-writer",
      scope: key,
      summary: "Started story writer session",
    });

    return NextResponse.json({ session, messages: [], aiDrafts: [] }, { status: 201 });
  } catch (err) {
    logger.error("story-writer", "POST failed", err);
    return NextResponse.json({ error: "Failed to create story writer session" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const { key } = await params;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSessionSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
      { status: 400 },
    );
  }

  const body = parsed.data;

  const session = await db
    .select()
    .from(storyWriterSession)
    .where(
      and(
        eq(storyWriterSession.ticketKey, key),
        eq(storyWriterSession.status, "active"),
      ),
    )
    .get();

  if (!session) {
    return NextResponse.json({ error: "No active session" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };

  if (body.localDraft !== undefined) {
    updates.localDraft = body.localDraft;
  }
  if (body.localTitle !== undefined) {
    updates.localTitle = body.localTitle;
  }
  if (body.targetLocalDraft !== undefined) {
    updates.targetLocalDraft = body.targetLocalDraft;
  }
  if (body.targetLocalTitle !== undefined) {
    updates.targetLocalTitle = body.targetLocalTitle;
  }
  if (body.clearSplit === true) {
    updates.targetTicketKey = null;
    updates.targetLocalDraft = null;
  }
  if (body.status !== undefined) {
    updates.status = body.status;
  }

  // Accept a specific AI draft: copy its content to localDraft or targetLocalDraft
  if (body.acceptDraftId !== undefined) {
    const draft = await db
      .select()
      .from(storyWriterDraft)
      .where(eq(storyWriterDraft.id, body.acceptDraftId))
      .get();
    if (draft) {
      if (draft.storySlot === "target") {
        updates.targetLocalDraft = draft.content;
      } else {
        updates.localDraft = draft.content;
      }
    }
  }

  await db
    .update(storyWriterSession)
    .set(updates)
    .where(eq(storyWriterSession.id, session.id));

  const updated = await db
    .select()
    .from(storyWriterSession)
    .where(eq(storyWriterSession.id, session.id))
    .get();

  return NextResponse.json({ session: updated });
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const { key } = await params;
  const url = new URL(request.url);
  const deleteConversation = url.searchParams.get("deleteConversation") === "true";

  const session = await db
    .select()
    .from(storyWriterSession)
    .where(
      and(
        eq(storyWriterSession.ticketKey, key),
        eq(storyWriterSession.status, "active"),
      ),
    )
    .get();

  if (!session) {
    return NextResponse.json({ error: "No active session" }, { status: 404 });
  }

  if (deleteConversation) {
    // Drafts cascade-delete from session FK. Delete session, then conversation.
    await db.delete(storyWriterSession).where(eq(storyWriterSession.id, session.id));
    await db.delete(conversation).where(eq(conversation.id, session.conversationId));
  } else {
    // Discard session; drafts cascade-delete, conversation kept
    await db.delete(storyWriterDraft).where(eq(storyWriterDraft.sessionId, session.id));
    // Clean up orphaned (pending/failed) messages
    await db
      .delete(message)
      .where(
        and(
          eq(message.conversationId, session.conversationId),
          sql`${message.status} IN ('pending', 'failed')`,
        ),
      );
    await db
      .update(storyWriterSession)
      .set({ status: "discarded", updatedAt: new Date().toISOString() })
      .where(eq(storyWriterSession.id, session.id));
  }

  await logActivity({
    type: "story-writer",
    scope: key,
    summary: "Discarded story writer session",
  });

  return NextResponse.json({});
}
