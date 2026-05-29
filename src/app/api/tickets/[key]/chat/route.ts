import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversation, ticket, ticketSubtask } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { validatePathParam } from "@/lib/api-validation";
import { applyRateLimit } from "@/lib/rate-limiter";

function buildTicketContext(
  key: string,
  title: string,
  description: string | null,
  subtasks: Array<{ subtaskKey: string; title: string; status: string }>,
  meta: { storyPoints: number | null; status: string; type: string | null; priority: string | null; assignee: string | null },
): string {
  const parts: string[] = [
    `Ticket ${key}: ${title}`,
    `Type: ${meta.type ?? "Unknown"} | Status: ${meta.status} | Priority: ${meta.priority ?? "None"}`,
  ];

  if (meta.storyPoints != null) parts.push(`Story Points: ${meta.storyPoints}`);
  if (meta.assignee) parts.push(`Assignee: ${meta.assignee}`);

  if (description) {
    parts.push("", "Description:", description);
  }

  if (subtasks.length > 0) {
    parts.push("", "Subtasks:");
    for (const st of subtasks) {
      const check = st.status === "Done" ? "[x]" : "[ ]";
      parts.push(`- ${check} ${st.subtaskKey}: ${st.title} (${st.status})`);
    }
  }

  return parts.join("\n");
}

// Reuse the existing conversation for this ticket (same as Story Writer),
// or create one if none exists. No context message is injected: the
// conversation only appears in the chat list once the user sends a message.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const limited = await applyRateLimit("write");
  if (limited) return limited;

  const { key } = await params;
  const invalid = validatePathParam(key);
  if (invalid) return invalid;

  const t = await db.query.ticket.findFirst({
    where: (row, { eq: eqFn }) => eqFn(row.jiraKey, key),
  });

  if (!t) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  // Reuse existing conversation for this ticket (shared with Story Writer)
  const existing = await db
    .select()
    .from(conversation)
    .where(eq(conversation.relatedTicket, key))
    .limit(1);

  if (existing.length > 0) {
    // Build context from current ticket state
    const subtasks = await db.select().from(ticketSubtask).where(eq(ticketSubtask.ticketKey, key));
    const context = buildTicketContext(
      key, t.title, t.description,
      subtasks.map((s) => ({ subtaskKey: s.subtaskKey, title: s.title, status: s.status })),
      { storyPoints: t.storyPoints, status: t.status, type: t.type, priority: t.priority, assignee: t.assignee },
    );

    return NextResponse.json({ ...existing[0], ticketContext: context });
  }

  // Create new conversation (no messages yet, so it stays hidden in the chat list)
  const convId = randomUUID();
  const ticketTitle = t.title.length > 80 ? t.title.slice(0, 77) + "..." : t.title;
  const conv = {
    id: convId,
    title: `Ticket Chat: ${key} - ${ticketTitle}`,
    type: "chat" as const,
    createdAt: new Date().toISOString(),
    relatedTicket: key,
    metadata: null,
  };

  await db.insert(conversation).values(conv);

  // Build context
  const subtasks = await db.select().from(ticketSubtask).where(eq(ticketSubtask.ticketKey, key));
  const context = buildTicketContext(
    key, t.title, t.description,
    subtasks.map((s) => ({ subtaskKey: s.subtaskKey, title: s.title, status: s.status })),
    { storyPoints: t.storyPoints, status: t.status, type: t.type, priority: t.priority, assignee: t.assignee },
  );

  return NextResponse.json({ ...conv, ticketContext: context }, { status: 201 });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  const invalid = validatePathParam(key);
  if (invalid) return invalid;

  const existing = await db
    .select()
    .from(conversation)
    .where(eq(conversation.relatedTicket, key))
    .limit(1);

  return NextResponse.json({
    conversationId: existing.length > 0 ? existing[0].id : null,
  });
}
