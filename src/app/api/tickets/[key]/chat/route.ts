import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversation, message, ticketSubtask } from "@/db/schema";
import { eq, and, like } from "drizzle-orm";
import { randomUUID } from "crypto";
import { validatePathParam } from "@/lib/api-validation";
import { applyRateLimit } from "@/lib/rate-limiter";

const TITLE_PREFIX = "Ticket Chat:";

function buildContextMessage(
  key: string,
  title: string,
  description: string | null,
  subtasks: Array<{ subtaskKey: string; title: string; status: string }>,
  meta: { storyPoints: number | null; status: string; type: string | null; priority: string | null; assignee: string | null },
): string {
  const parts: string[] = [
    `## Ticket Context: ${key} - ${title}`,
    "",
    `**Type:** ${meta.type ?? "Unknown"} | **Status:** ${meta.status} | **Priority:** ${meta.priority ?? "None"}`,
  ];

  if (meta.storyPoints != null) {
    parts.push(`**Story Points:** ${meta.storyPoints}`);
  }
  if (meta.assignee) {
    parts.push(`**Assignee:** ${meta.assignee}`);
  }

  if (description) {
    parts.push("", "### Description", "", description);
  }

  if (subtasks.length > 0) {
    parts.push("", "### Subtasks", "");
    for (const st of subtasks) {
      const check = st.status === "Done" ? "[x]" : "[ ]";
      parts.push(`- ${check} ${st.subtaskKey}: ${st.title} (${st.status})`);
    }
  }

  parts.push("", "---", "You can ask questions about this ticket, brainstorm subtasks, or discuss any aspect of this story.");

  return parts.join("\n");
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const limited = applyRateLimit("write");
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

  // Look for existing ticket-chat conversation
  const existing = await db
    .select()
    .from(conversation)
    .where(
      and(
        eq(conversation.relatedTicket, key),
        like(conversation.title, `${TITLE_PREFIX}%`),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json(existing[0]);
  }

  // Fetch subtasks for context
  const subtasks = await db.select().from(ticketSubtask).where(eq(ticketSubtask.ticketKey, key));

  // Create new conversation
  const convId = randomUUID();
  const ticketTitle = t.title.length > 80 ? t.title.slice(0, 77) + "..." : t.title;
  const conv = {
    id: convId,
    title: `${TITLE_PREFIX} ${key} - ${ticketTitle}`,
    type: "chat" as const,
    createdAt: new Date().toISOString(),
    relatedTicket: key,
    metadata: null,
  };

  await db.insert(conversation).values(conv);

  // Insert context message
  const contextContent = buildContextMessage(
    key,
    t.title,
    t.description,
    subtasks.map((s) => ({ subtaskKey: s.subtaskKey, title: s.title, status: s.status })),
    {
      storyPoints: t.storyPoints,
      status: t.status,
      type: t.type,
      priority: t.priority,
      assignee: t.assignee,
    },
  );

  await db.insert(message).values({
    id: randomUUID(),
    conversationId: convId,
    role: "user",
    content: contextContent,
    timestamp: new Date().toISOString(),
    status: "sent",
    sequence: 0,
  });

  return NextResponse.json(conv, { status: 201 });
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
    .where(
      and(
        eq(conversation.relatedTicket, key),
        like(conversation.title, `${TITLE_PREFIX}%`),
      ),
    )
    .limit(1);

  return NextResponse.json({
    conversationId: existing.length > 0 ? existing[0].id : null,
  });
}
