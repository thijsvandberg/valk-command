import { NextResponse } from "next/server";
import { db } from "@/db";
import { storyWriterSession, message, ticket, jiraComment } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { agentUrl, agentHeaders } from "@/lib/agent-proxy";

type RouteContext = { params: Promise<{ key: string }> };

/**
 * Sends a message in the story writer conversation.
 * First message: creates a workspace task with the write-story-draft skill.
 * Follow-up: sends to the workspace conversation endpoint (resumes CLI session).
 * On 410 (session lost): recovers by re-sending with current context as a new first message.
 */
export async function POST(request: Request, { params }: RouteContext) {
  const { key } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  const codebaseResearch = body.codebaseResearch === true;
  const model = typeof body.model === "string" ? body.model : undefined;
  const skill = typeof body.skill === "string" ? body.skill : null;

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
    return NextResponse.json({ error: "No active story writer session" }, { status: 404 });
  }

  // Save user message locally and bump session activity timestamp
  const messageId = randomUUID();
  await db.insert(message).values({
    id: messageId,
    conversationId: session.conversationId,
    role: "user",
    content,
  });
  await db
    .update(storyWriterSession)
    .set({ updatedAt: new Date().toISOString() })
    .where(eq(storyWriterSession.id, session.id));

  // Check if this is the first message (no assistant messages yet)
  const assistantMessages = await db
    .select()
    .from(message)
    .where(
      and(
        eq(message.conversationId, session.conversationId),
        eq(message.role, "assistant"),
      ),
    )
    .all();

  const isFirstMessage = assistantMessages.length === 0;

  try {
    let taskData: { id?: string; error?: string };
    let status: number;

    if (skill === "find-related") {
      // Invoke the find-related skill with the ticket key as the search source.
      // Uses the existing conversationId regardless of whether this is the first message.
      const res = await fetch(agentUrl("/api/tasks"), {
        method: "POST",
        headers: agentHeaders(),
        body: JSON.stringify({
          skill: "find-related",
          args: { args: key },
          conversationId: session.conversationId,
          model,
        }),
      });

      status = res.status;
      taskData = await res.json();
    } else if (isFirstMessage) {
      // First message: invoke the write-story-draft skill with enriched context
      const ticketRow = await db
        .select()
        .from(ticket)
        .where(eq(ticket.jiraKey, key))
        .get();

      const comments = await db
        .select()
        .from(jiraComment)
        .where(eq(jiraComment.ticketKey, key))
        .all();

      const contextParts = [];
      if (ticketRow) {
        contextParts.push(`Ticket: ${key} - ${ticketRow.title}`);
        contextParts.push(`Current description:\n${ticketRow.description ?? "(empty)"}`);
      }
      if (comments.length > 0) {
        const formatted = comments
          .map((c) => `[${c.authorName}] ${c.content}`)
          .join("\n---\n");
        contextParts.push(`Jira comments (${comments.length}):\n${formatted}`);
      }

      // Inject target story context when in split mode
      if (session.targetTicketKey) {
        const targetTicketRow = await db
          .select()
          .from(ticket)
          .where(eq(ticket.jiraKey, session.targetTicketKey))
          .get();
        contextParts.push(
          `[Split mode] You are helping redistribute content between two stories.\n` +
          `Original story: ${key}${ticketRow ? ` - ${ticketRow.title}` : ""}\n` +
          `Target story: ${session.targetTicketKey}${targetTicketRow ? ` - ${targetTicketRow.title}` : ""}\n` +
          `Target story current content:\n${session.targetLocalDraft || "(empty)"}\n\n` +
          `Output a revised version of the original story using <story-draft> and a revised version of the target story using <story-draft slot="target">.`,
        );
      }

      const researchFlag = `[codebase-research: ${codebaseResearch ? "on" : "off"}]`;
      contextParts.push(
        `${researchFlag}\n\nUser request: ${content}\n\n` +
        `Important: Besides the <story-draft> block, always include a brief commentary outside the tags explaining what you changed and why. When relevant, end with a follow-up question to guide the next iteration.`
      );

      const res = await fetch(agentUrl("/api/tasks"), {
        method: "POST",
        headers: agentHeaders(),
        body: JSON.stringify({
          skill: "write-story-draft",
          args: { args: contextParts.join("\n\n") },
          conversationId: session.conversationId,
          model,
        }),
      });

      status = res.status;
      taskData = await res.json();
    } else {
      // Follow-up message: resume the existing workspace conversation
      const researchFlag = `[codebase-research: ${codebaseResearch ? "on" : "off"}]`;

      // Always inject the current draft so the workspace AI has context even if it lost
      // its conversation history (happens when the remote session is evicted).
      const draftContext = session.localDraft
        ? `\n\n[Current story draft]\n${session.localDraft}\n[End of draft]`
        : "";

      // In split mode, remind the AI of the split context and expected output format
      let splitReminder = "";
      if (session.targetTicketKey) {
        splitReminder =
          `\n\n[Split mode: original=${key}, target=${session.targetTicketKey}. ` +
          `Output <story-draft> for original and <story-draft slot="target"> for target story.]`;
      }

      const res = await fetch(
        agentUrl(`/api/conversations/${session.conversationId}/messages`),
        {
          method: "POST",
          headers: agentHeaders(),
          body: JSON.stringify({
            content: `${researchFlag}${draftContext}\n\n${content}${splitReminder}\n\n[Remember: besides the <story-draft> block, include a brief commentary explaining what you changed. When relevant, end with a follow-up question.]`,
            model,
          }),
        },
      );

      // Session lost on workspace side: recover
      if (res.status === 410) {
        const recovered = await recoverSession(session, key, content);
        return NextResponse.json(recovered.body, { status: recovered.status });
      }

      status = res.status;
      taskData = await res.json();
    }

    if (status >= 400) {
      return NextResponse.json(
        { error: taskData.error ?? "Workspace request failed" },
        { status },
      );
    }

    const taskId = taskData.id ?? "";
    return NextResponse.json({
      messageId,
      taskId,
      streamUrl: `/api/workspace-tasks/${taskId}/stream`,
      isFirstMessage,
    }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Agent unreachable" }, { status: 502 });
  }
}

/**
 * Recovers a lost workspace session by re-sending context + user message
 * as a new first message with the write-story-draft skill.
 */
async function recoverSession(
  session: { conversationId: string; localDraft: string | null; ticketKey: string },
  key: string,
  userMessage: string,
): Promise<{ body: Record<string, unknown>; status: number }> {
  const ticketRow = await db
    .select()
    .from(ticket)
    .where(eq(ticket.jiraKey, key))
    .get();

  const recoveryPrompt = [
    `[Session recovery] The previous conversation context was lost. Here is the current state:`,
    `Ticket: ${key}${ticketRow ? ` - ${ticketRow.title}` : ""}`,
    ticketRow?.description ? `Current Jira description:\n${ticketRow.description}` : "",
    session.localDraft ? `Current working draft:\n${session.localDraft}` : "",
    `\nUser message: ${userMessage}`,
  ].filter(Boolean).join("\n\n");

  try {
    const res = await fetch(agentUrl("/api/tasks"), {
      method: "POST",
      headers: agentHeaders(),
      body: JSON.stringify({
        skill: "write-story-draft",
        args: { args: recoveryPrompt },
        conversationId: session.conversationId,
      }),
    });

    const taskData = await res.json();

    if (res.status >= 400) {
      return {
        body: { error: taskData.error ?? "Recovery failed" },
        status: res.status,
      };
    }

    const taskId = taskData.id ?? "";
    return {
      body: {
        messageId: `recovered-${Date.now()}`,
        taskId,
        streamUrl: `/api/workspace-tasks/${taskId}/stream`,
        isFirstMessage: true,
        recovered: true,
      },
      status: 201,
    };
  } catch {
    return { body: { error: "Agent unreachable during recovery" }, status: 502 };
  }
}
