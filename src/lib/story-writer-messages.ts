import { db } from "@/db";
import {
  storyWriterSession,
  message,
  ticket,
  jiraComment,
  ticketConfluenceLink,
  ticketAttachment,
  epicChildDraft,
  appSetting,
  sprintNameCache,
} from "@/db/schema";
import { eq, and, ne, sql } from "drizzle-orm";
import { randomUUID, createHash } from "crypto";
import { agentFetch, type AgentError as AgentFetchError } from "@/lib/agent-fetch";
import { logActivity } from "@/lib/activity-logger";
import { nextSequence } from "@/db/next-sequence";
import { hasEditIntent } from "@/lib/edit-intent";
import { resolveSprintMention } from "@/lib/sprint-utils";

// find-related does keyword extraction + scoring, not deep reasoning, so it runs on a
// lighter, faster model by default regardless of the compose model the PO selected.
// This is the single biggest lever on find-related latency (BRDG-397).
export const FIND_RELATED_MODEL = "claude-haiku-4-5";

// BRDG-435: contract that lets a chat investigation be surfaced as a postable
// Jira comment. When the PO asks to investigate/research (rather than edit the
// story), the result must come back wrapped in <investigation> so Bridge renders
// it as a card instead of folding it into a <story-draft>.
export const INVESTIGATION_INSTRUCTION =
  `If the user asks you to investigate or research (rather than edit the story), do NOT return a <story-draft>; ` +
  `instead return your findings wrapped in a single <investigation>...</investigation> block, formatted as markdown ` +
  `(headings, lists, code) so it can be posted as a Jira comment. Keep any short commentary outside the tag.`;

export interface FindRelatedArgs {
  key: string;
  // Topic to search for. When set, find-related runs a targeted search instead of a
  // broad sweep over the source ticket. Falls back to the key when absent.
  query?: string;
  // Resolved Jira sprint id + name. When present the skill applies a hard sprint
  // filter; absent means search the topic without a sprint constraint.
  sprintId?: string;
  sprintName?: string;
}

// Build the /api/tasks body for a find-related run. The `args.args` string carries the
// query (or key) so even the not-yet-updated skill degrades to a topic search; the
// structured fields drive the targeted/hard-filter behaviour once the skill reads them.
export function buildFindRelatedTaskBody(
  args: FindRelatedArgs,
  conversationId: string,
  model: string = FIND_RELATED_MODEL,
): Record<string, unknown> {
  const query = args.query?.trim();
  const innerArgs: Record<string, unknown> = { args: query || args.key, key: args.key, depth: "quick" };
  if (query) innerArgs.query = query;
  if (args.sprintId) {
    innerArgs.sprintId = args.sprintId;
    if (args.sprintName) innerArgs.sprintName = args.sprintName;
  }
  return { skill: "find-related", args: innerArgs, conversationId, model };
}

// The cached sprint list lives in app_setting (jira_sprints), written by sync-sprints.
// Read synchronously from the local DB so no Jira round-trip lands on the chat path.
async function loadCachedSprints(): Promise<{ id: string; name: string; state?: string }[]> {
  const row = await db.select().from(appSetting).where(eq(appSetting.key, "jira_sprints")).get();
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.value);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((s: { id: number | string; name: string; state?: string }) => ({
      id: String(s.id),
      name: s.name,
      state: s.state,
    }));
  } catch {
    return [];
  }
}

// The source ticket's sprint display name, used to infer the team prefix when the PO's
// mention omits it. ticket.sprintName stores the sprint id; resolve it via the cache.
async function currentTicketSprintName(key: string): Promise<string | null> {
  const t = await db.select({ sprintName: ticket.sprintName }).from(ticket).where(eq(ticket.jiraKey, key)).get();
  const sid = t?.sprintName;
  if (!sid) return null;
  if (!/^\d+$/.test(sid)) return sid; // legacy name stored directly
  const n = await db.select().from(sprintNameCache).where(eq(sprintNameCache.sprintId, sid)).get();
  return n?.displayName ?? null;
}

export interface TargetedRelatedParams {
  key: string;
  query: string;
  sprint: string | null;
}

export interface TargetedRelatedResult {
  taskId: string;
  streamUrl: string;
  sprintId: string | null;
  sprintName: string | null;
}

// Auto-chained from a chat message that asked to find/link a related story. Resolves
// the loose sprint mention against the cached list and dispatches a targeted
// find-related into the same conversation, so its <related-stories> output flows
// through the existing apply-related path (BRDG-397).
export async function dispatchTargetedRelated(params: TargetedRelatedParams): Promise<TargetedRelatedResult> {
  const { key, query, sprint } = params;
  const session = await db
    .select()
    .from(storyWriterSession)
    .where(and(eq(storyWriterSession.ticketKey, key), eq(storyWriterSession.status, "active")))
    .get();
  if (!session) throw new StoryWriterError("No active story writer session", 404);

  let resolved: { id: string; name: string } | null = null;
  if (sprint) {
    const [sprints, currentName] = await Promise.all([loadCachedSprints(), currentTicketSprintName(key)]);
    resolved = resolveSprintMention(sprint, currentName, sprints);
  }

  const body = buildFindRelatedTaskBody(
    { key, query, sprintId: resolved?.id, sprintName: resolved?.name },
    session.conversationId,
  );
  const result = await agentFetch<TaskResponse>("/api/tasks", { method: "POST", body, retries: 2 });
  if (!result.ok) throw new StoryWriterAgentError(result.error, result.status || 502);

  const taskId = result.data.id ?? "";
  return {
    taskId,
    streamUrl: `/api/workspace-tasks/${taskId}/stream`,
    sprintId: resolved?.id ?? null,
    sprintName: resolved?.name ?? null,
  };
}

export interface SendMessageParams {
  key: string;
  content: string;
  codebaseResearch: boolean;
  model?: string;
  skill?: string | null;
  retryMessageId?: string | null;
}

export interface SendMessageResult {
  messageId: string;
  taskId: string;
  streamUrl: string;
  isFirstMessage: boolean;
  recovered?: boolean;
}

export class StoryWriterError extends Error {
  status: number;
  code?: string;
  /** Persisted id of the message that was marked failed, so the client can reconcile its temp id (BRDG-459). */
  messageId?: string;
  constructor(message: string, status: number, code?: string, messageId?: string) {
    super(message);
    this.name = "StoryWriterError";
    this.status = status;
    this.code = code;
    this.messageId = messageId;
  }
}

export class StoryWriterAgentError extends Error {
  status: number;
  agentError: AgentFetchError;
  /** Persisted id of the message that was marked failed, so the client can reconcile its temp id (BRDG-459). */
  messageId?: string;
  constructor(agentError: AgentFetchError, status: number, messageId?: string) {
    super(agentError.error);
    this.name = "StoryWriterAgentError";
    this.status = status;
    this.agentError = agentError;
    this.messageId = messageId;
  }
}

export function computeContentHash(conversationId: string, content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  return createHash("sha256").update(conversationId + normalized).digest("hex");
}

async function markMessageFailed(messageId: string) {
  await db.update(message).set({ status: "failed" }).where(eq(message.id, messageId));
}

export function ticketNeedsTitle(title: string | null | undefined): boolean {
  if (!title) return true;
  const t = title.trim();
  return !t || t === "Untitled draft";
}

/**
 * The editor draft (localDraft) is the content the PO is actively working on and
 * the source of truth for what to send, even when it hasn't been pushed to Jira yet.
 * Only fall back to the Jira-synced description when the editor is genuinely untouched.
 */
export function selectCurrentDescription(
  localDraft: string | null | undefined,
  jiraDescription: string | null | undefined,
): string {
  if (localDraft?.trim()) return localDraft;
  if (jiraDescription?.trim()) return jiraDescription;
  return "(empty)";
}

async function markMessageSent(messageId: string, taskId: string) {
  await db
    .update(message)
    .set({ workspaceTaskId: taskId || null, status: "sent" })
    .where(eq(message.id, messageId));
}

function buildSendResult(messageId: string, taskId: string, isFirstMessage: boolean, recovered?: boolean): SendMessageResult {
  return {
    messageId,
    taskId,
    streamUrl: `/api/workspace-tasks/${taskId}/stream`,
    isFirstMessage,
    ...(recovered ? { recovered } : {}),
  };
}

interface TaskResponse { id?: string; error?: string }

async function logAndThrowAgentError(
  key: string,
  messageId: string,
  result: { ok: false; error: AgentFetchError; status: number; retryCount?: number },
  summary: string,
  messageStart: number,
  messageStartedAt: string,
): Promise<never> {
  await markMessageFailed(messageId);
  await logActivity({
    type: "story-writer",
    scope: key,
    status: "failed",
    summary,
    errorDetail: JSON.stringify({ code: result.error.code, error: result.error.error, httpStatus: result.status, retryCount: result.retryCount }),
    durationMs: Date.now() - messageStart,
    startedAt: messageStartedAt,
  });
  throw new StoryWriterAgentError(result.error, result.status, messageId);
}

async function logSuccess(key: string, summary: string, messageStart: number, messageStartedAt: string) {
  await logActivity({
    type: "story-writer",
    scope: key,
    status: "success",
    summary,
    durationMs: Date.now() - messageStart,
    startedAt: messageStartedAt,
  });
}

/**
 * Assembles the epic-mode context block: the epic itself, its child stories,
 * linked Confluence pages (titles + URLs only, to bound token cost), and
 * attachments (filenames/types). This is the context the AI sees when working
 * out an epic. Child filtering mirrors /api/epics/[key]/tickets (excludes the
 * epic itself and removed/draft tickets).
 */
export async function buildEpicContext(key: string): Promise<string> {
  const [epicRow, children, confluence, attachments] = await Promise.all([
    db.select().from(ticket).where(eq(ticket.jiraKey, key)).get(),
    db
      .select({ jiraKey: ticket.jiraKey, title: ticket.title, type: ticket.type, status: ticket.status })
      .from(ticket)
      .where(and(eq(ticket.epicKey, key), ne(ticket.type, "epic")))
      .all(),
    db
      .select({ pageTitle: ticketConfluenceLink.pageTitle, pageUrl: ticketConfluenceLink.pageUrl })
      .from(ticketConfluenceLink)
      .where(eq(ticketConfluenceLink.ticketKey, key))
      .all(),
    db
      .select({ filename: ticketAttachment.filename, mimeType: ticketAttachment.mimeType })
      .from(ticketAttachment)
      .where(eq(ticketAttachment.ticketKey, key))
      .all(),
  ]);

  const parts: string[] = [];
  parts.push(`You are helping work out an epic. The epic is the subject.`);
  if (epicRow) {
    parts.push(`Epic: ${key} - ${epicRow.title}`);
    parts.push(`Epic description:\n${selectCurrentDescription(null, epicRow.description)}`);
  } else {
    parts.push(`Epic: ${key}`);
  }

  if (children.length > 0) {
    const formatted = children
      .map((c) => `- ${c.jiraKey} [${c.type ?? "story"}, ${c.status ?? "TO DO"}]: ${c.title}`)
      .join("\n");
    parts.push(`Existing child stories (${children.length}):\n${formatted}`);
  } else {
    parts.push(`Existing child stories: none yet.`);
  }

  if (confluence.length > 0) {
    const formatted = confluence
      .map((c) => `- ${c.pageTitle} (${c.pageUrl})`)
      .join("\n");
    parts.push(`Linked Confluence pages (${confluence.length}):\n${formatted}`);
  }

  if (attachments.length > 0) {
    const formatted = attachments
      .map((a) => `- ${a.filename} (${a.mimeType})`)
      .join("\n");
    parts.push(`Attachments (${attachments.length}):\n${formatted}`);
  }

  return parts.join("\n\n");
}

/**
 * Phases where the break-down-epic skill drives the turn (it emits the tagged
 * breakdown blocks). The "feed" phase stays on the regular write-story-draft
 * flow because it enriches the epic's own body (the <story-draft> contract);
 * the sharpened epic summary is therefore handled by the 292 epic draft path.
 */
export function epicPhaseUsesBreakdownSkill(phase: string | null | undefined): boolean {
  return phase === "discovery" || phase === "breakdown" || phase === "refine"
    || phase === "detail" || phase === "sprints";
}

/**
 * Serializes the current child cards so the phase-aware skill can refine them
 * in place ("split card 3", "remove card 5") instead of starting over. Indexes
 * are 0-based to match the AI's <epic-breakdown> ordering.
 */
export async function buildBreakdownStateForSession(sessionId: string): Promise<string> {
  const cards = await db
    .select()
    .from(epicChildDraft)
    .where(eq(epicChildDraft.sessionId, sessionId))
    .orderBy(epicChildDraft.cardIndex)
    .all();

  if (cards.length === 0) {
    return "[No breakdown yet. This is the first breakdown for this epic.]";
  }

  const serialized = cards.map((c) => ({
    index: c.cardIndex,
    title: c.title,
    bullets: c.bullets ?? [],
    body: c.body ?? undefined,
  }));
  return `[Current breakdown (${cards.length} cards), refine in place; return the full updated set]:\n${JSON.stringify(serialized, null, 2)}`;
}

/**
 * Detail-phase guidance for the break-down-epic skill. Naming the exact tag
 * contract here (rather than only in the VRW skill) keeps the parser and the
 * prompt in lock-step: one <story-detail index="N"> block per deepened card,
 * carrying a full description + acceptance criteria as markdown. Cards are
 * referenced by their 0-based index from the current breakdown state.
 */
export const STORY_DETAIL_INSTRUCTION =
  `When you work out (deepen) one or more stories into a full description and acceptance criteria, ` +
  `return each one in its own <story-detail index="N">...</story-detail> block, where N is the ` +
  `0-based index of the card in the current breakdown. The block body is markdown (description + ` +
  `acceptance criteria). Detail only the stories the user asked for; leave the others untouched. ` +
  `Keep each detailed story aligned with how a single story is written so it can later open as a ` +
  `full Story Writer draft. Include a brief commentary outside the tags explaining what you did.`;

/**
 * Builds the break-down-epic invocation for a phase that uses the breakdown
 * skill. Carries the current phase and the existing breakdown so the skill
 * returns the block relevant to that phase. In the detail phase it also carries
 * the <story-detail> tag contract so deepened cards land back on the board.
 */
async function buildEpicBreakdownBody(
  session: { id: string; conversationId: string; phase?: string | null },
  key: string,
  content: string,
  codebaseResearch: boolean,
  model: string | undefined,
) {
  const epicContext = await buildEpicContext(key);
  const researchFlag = `[codebase-research: ${codebaseResearch ? "on" : "off"}]`;
  const phase = session.phase ?? "breakdown";
  const breakdownState = await buildBreakdownStateForSession(session.id);
  const detailInstruction = phase === "detail" ? `\n\n${STORY_DETAIL_INSTRUCTION}` : "";

  const args =
    `${epicContext}\n\n` +
    `${researchFlag}\n\n` +
    `[phase: ${phase}]\n\n` +
    `${breakdownState}\n\n` +
    `User request: ${content}${detailInstruction}`;

  return {
    skill: "break-down-epic",
    args: { args },
    conversationId: session.conversationId,
    model,
  };
}

export async function buildEpicFirstMessageBody(
  session: { id: string; conversationId: string; localDraft: string | null; phase?: string | null },
  key: string,
  content: string,
  codebaseResearch: boolean,
  model: string | undefined,
) {
  if (epicPhaseUsesBreakdownSkill(session.phase)) {
    return buildEpicBreakdownBody(session, key, content, codebaseResearch, model);
  }

  const epicContext = await buildEpicContext(key);
  const researchFlag = `[codebase-research: ${codebaseResearch ? "on" : "off"}]`;

  // The epic itself is refined via the regular single-story draft flow (epic as
  // subject), so we keep the write-story-draft skill and its <story-draft>
  // contract. We suppress the story-only epic-suggestion and title-suggestion
  // blocks, which make no sense when the subject is itself an epic.
  const args =
    `${epicContext}\n\n` +
    `${researchFlag}\n\n` +
    `User request: ${content}\n\n` +
    `Important: When you sharpen or rewrite the epic's own description, return it in a <story-draft> block (the epic is the subject ticket). ` +
    `Always include a brief commentary outside the tags explaining what you changed and why, and when relevant end with a follow-up question to guide the next iteration.`;

  return {
    skill: "write-story-draft",
    args: { args },
    conversationId: session.conversationId,
    model,
  };
}

export async function buildFirstMessageBody(
  session: { id: string; conversationId: string; localDraft: string | null; localTitle: string | null; targetTicketKey: string | null; targetLocalDraft: string | null; mode?: string | null; phase?: string | null },
  key: string,
  content: string,
  codebaseResearch: boolean,
  model: string | undefined,
) {
  if (session.mode === "epic") {
    return buildEpicFirstMessageBody(session, key, content, codebaseResearch, model);
  }
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

  const needsTitle = ticketNeedsTitle(session.localTitle) && ticketNeedsTitle(ticketRow?.title);
  const needsEpic = !ticketRow?.epicKey;

  const contextParts = [];
  if (ticketRow) {
    contextParts.push(`Ticket: ${key} - ${ticketRow.title}`);
    contextParts.push(`Issue type: ${ticketRow.type ?? "story"}`);
    contextParts.push(`Current description:\n${selectCurrentDescription(session.localDraft, ticketRow.description)}`);
  }
  if (comments.length > 0) {
    const formatted = comments
      .map((c) => `[${c.authorName}] ${c.content}`)
      .join("\n---\n");
    contextParts.push(`Jira comments (${comments.length}):\n${formatted}`);
  }

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

  const titleInstruction = needsTitle
    ? `\nThis ticket has no title yet. Along with your response, suggest 3 concise, descriptive title options using a <title-suggestions> tag (one title per line inside the tag).`
    : "";

  let epicInstruction = "";
  if (needsEpic) {
    const epicRows = await db
      .select({ jiraKey: ticket.jiraKey, title: ticket.title })
      .from(ticket)
      // Never offer deprecated epics as suggestion targets.
      .where(and(eq(ticket.type, "epic"), ne(ticket.status, "DEPRECATED")))
      .all();
    if (epicRows.length > 0) {
      const epicList = epicRows.map((e) => `${e.jiraKey}: ${e.title}`).join("\n");
      epicInstruction =
        `\nThis ticket is not linked to an epic yet. Based on the story content, suggest the best-fitting epic using: <epic-suggestion><epic key="EPIC-KEY" confidence="high|medium|low" reason="brief reason" /></epic-suggestion>. ` +
        `Only suggest when a good match exists.\nAvailable epics:\n${epicList}`;
    }
  }

  const researchFlag = `[codebase-research: ${codebaseResearch ? "on" : "off"}]`;
  contextParts.push(
    `${researchFlag}\n\nUser request: ${content}\n\n` +
    `Important: Besides the <story-draft> block, always include a brief commentary outside the tags explaining what you changed and why. When relevant, end with a follow-up question to guide the next iteration.${titleInstruction}${epicInstruction}\n` +
    `If the content clearly fits a different issue type (story, bug, task, spike), include a <type-suggestion>type</type-suggestion> tag to suggest changing it. Only suggest when it is clearly warranted.\n` +
    `When you mention or discover related issues that should be linked to this ticket, include link suggestions using: <link-suggestion key="ISSUE-KEY" relation="relates to" /> (or for multiple: <link-suggestions><link key="..." relation="..." /></link-suggestions>). Valid relations: "relates to", "blocks", "is blocked by", "clones", "is cloned by", "duplicates", "is duplicated by". Proactively suggest links during story review when you identify issues that should be connected.\n` +
    INVESTIGATION_INSTRUCTION
  );

  return {
    skill: "write-story-draft",
    args: { args: contextParts.join("\n\n") },
    conversationId: session.conversationId,
    model,
  };
}

export function buildFollowUpContent(
  session: { localDraft: string | null; localTitle: string | null; targetTicketKey: string | null; mode?: string | null; phase?: string | null },
  key: string,
  content: string,
  codebaseResearch: boolean,
  breakdownState?: string,
): { content: string; isEdit: boolean } {
  if (session.mode === "epic") {
    const researchFlag = `[codebase-research: ${codebaseResearch ? "on" : "off"}]`;

    // Breakdown phases steer the same break-down-epic session: carry the phase
    // and the current cards so the skill returns the matching tagged block and
    // can mutate the breakdown in place (split/add/remove a card).
    if (epicPhaseUsesBreakdownSkill(session.phase)) {
      const phase = session.phase ?? "breakdown";
      const state = breakdownState ?? "[Current breakdown state unavailable.]";
      const detailInstruction = phase === "detail" ? `\n\n${STORY_DETAIL_INSTRUCTION}` : "";
      return {
        content: `${researchFlag}\n\n[phase: ${phase}]\n\n${state}\n\n${content}${detailInstruction}`,
        // The breakdown itself is the artifact being edited each turn.
        isEdit: true,
      };
    }

    const isEdit = hasEditIntent(content, { splitMode: false });
    const draftContext = isEdit && session.localDraft
      ? `\n\n[Current epic draft]\n${session.localDraft}\n[End of draft]`
      : "";
    const instructions = isEdit
      ? `[Remember: when you change the epic description, return it in a <story-draft> block, and include a brief commentary explaining what you changed.]`
      : `[If your answer requires editing the epic description, include a <story-draft> block.]`;
    return {
      content: `${researchFlag}${draftContext}\n\n${content}\n\n${instructions}`,
      isEdit,
    };
  }

  const isEdit = hasEditIntent(content, { splitMode: !!session.targetTicketKey });
  const researchFlag = `[codebase-research: ${codebaseResearch ? "on" : "off"}]`;

  const draftContext = isEdit && session.localDraft
    ? `\n\n[Current story draft]\n${session.localDraft}\n[End of draft]`
    : "";

  let splitReminder = "";
  if (session.targetTicketKey) {
    splitReminder =
      `\n\n[Split mode: original=${key}, target=${session.targetTicketKey}. ` +
      `Output <story-draft> for original and <story-draft slot="target"> for target story.]`;
  }

  const titleReminder = ticketNeedsTitle(session.localTitle)
    ? " If this ticket still has no title, suggest 3 options using a <title-suggestions> tag."
    : "";

  const instructions = isEdit
    ? `[Remember: besides the <story-draft> block, include a brief commentary explaining what you changed. When relevant, end with a follow-up question. If the content clearly fits a different issue type (story, bug, task, spike), include a <type-suggestion>type</type-suggestion> tag. When you mention or discover related issues, include <link-suggestion key="ISSUE-KEY" relation="relates to" /> tags to suggest linking them.${titleReminder} ${INVESTIGATION_INSTRUCTION}]`
    : `[If your answer requires editing the story, include a <story-draft> block.${titleReminder} ${INVESTIGATION_INSTRUCTION}]`;

  return {
    content: `${researchFlag}${draftContext}\n\n${content}${splitReminder}\n\n${instructions}`,
    isEdit,
  };
}

export async function recoverSession(
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

  const result = await agentFetch<{ id?: string; error?: string }>("/api/tasks", {
    method: "POST",
    body: {
      skill: "write-story-draft",
      args: { args: recoveryPrompt },
      conversationId: session.conversationId,
    },
    retries: 2,
  });

  if (!result.ok) {
    return {
      body: { error: result.error.error, code: result.error.code },
      status: result.status || 502,
    };
  }

  const taskId = result.data.id ?? "";
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
}

/**
 * Core message-sending logic for the story writer.
 * Handles dedup, first-message vs follow-up routing, skill dispatch, and session recovery.
 */
export async function sendStoryWriterMessage(params: SendMessageParams): Promise<SendMessageResult> {
  const { key, content, codebaseResearch, model, skill, retryMessageId } = params;

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
    throw new StoryWriterError("No active story writer session", 404);
  }

  const contentHash = computeContentHash(session.conversationId, content);

  // Server-side dedup
  if (!retryMessageId) {
    const recent = await db
      .select({ id: message.id })
      .from(message)
      .where(
        and(
          eq(message.conversationId, session.conversationId),
          eq(message.contentHash, contentHash),
          sql`${message.timestamp} > datetime('now', '-30 seconds')`,
        ),
      )
      .get();

    if (recent) {
      throw new StoryWriterError("Duplicate message", 409, "DUPLICATE");
    }
  }

  let messageId: string;

  if (retryMessageId) {
    await db
      .update(message)
      .set({ status: "pending", contentHash })
      .where(eq(message.id, retryMessageId));
    messageId = retryMessageId;
  } else {
    messageId = randomUUID();
    await db.insert(message).values({
      id: messageId,
      conversationId: session.conversationId,
      role: "user",
      content,
      status: "pending",
      contentHash,
      timestamp: new Date().toISOString(),
      sequence: nextSequence(session.conversationId),
    });
  }

  await db
    .update(storyWriterSession)
    .set({ updatedAt: new Date().toISOString() })
    .where(eq(storyWriterSession.id, session.id));

  const allMessages = await db
    .select()
    .from(message)
    .where(eq(message.conversationId, session.conversationId))
    .orderBy(message.timestamp)
    .all();

  const hasCancelledMessages = allMessages.some((m) => m.cancelled);
  const nonCancelledAssistants = allMessages.filter((m) => m.role === "assistant" && !m.cancelled);
  const isFirstMessage = nonCancelledAssistants.length === 0;
  const needsFreshSession = hasCancelledMessages;

  const messageStart = Date.now();
  const messageStartedAt = new Date().toISOString();

  // Skill: find-related
  if (skill === "find-related") {
    const result = await agentFetch<TaskResponse>("/api/tasks", {
      method: "POST",
      body: buildFindRelatedTaskBody({ key }, session.conversationId),
      retries: 2,
    });

    if (!result.ok) {
      return logAndThrowAgentError(key, messageId, result, `Story writer message failed for ${key}: ${result.error.code}`, messageStart, messageStartedAt);
    }
    await logSuccess(key, `Story writer message sent for ${key}`, messageStart, messageStartedAt);
    const taskId = result.data.id ?? "";
    await markMessageSent(messageId, taskId);
    return buildSendResult(messageId, taskId, isFirstMessage);
  }

  // Skill: match-epic
  if (skill === "match-epic") {
    const ticketRow = await db
      .select({ jiraKey: ticket.jiraKey, title: ticket.title, description: ticket.description })
      .from(ticket)
      .where(eq(ticket.jiraKey, key))
      .get();

    const epicRows = await db
      .select({ jiraKey: ticket.jiraKey, title: ticket.title, summary: ticket.summary })
      .from(ticket)
      .where(eq(ticket.type, "epic"))
      .all();

    if (epicRows.length === 0) {
      await markMessageFailed(messageId);
      throw new StoryWriterError("No epics available", 404, undefined, messageId);
    }

    const epicsPayload = epicRows.map((e) => ({
      key: e.jiraKey,
      name: e.title,
      summary: e.summary ?? null,
    }));

    const result = await agentFetch<TaskResponse>("/api/tasks", {
      method: "POST",
      body: {
        skill: "suggest-epic",
        args: {
          ticketKey: ticketRow?.jiraKey ?? key,
          ticketTitle: ticketRow?.title ?? "",
          ticketDescription: ticketRow?.description ?? "",
          epics: JSON.stringify(epicsPayload),
        },
        conversationId: session.conversationId,
        model,
      },
      retries: 2,
    });

    if (!result.ok) {
      return logAndThrowAgentError(key, messageId, result, `Story writer match-epic failed for ${key}: ${result.error.code}`, messageStart, messageStartedAt);
    }
    await logSuccess(key, `Story writer match-epic sent for ${key}`, messageStart, messageStartedAt);
    const taskId = result.data.id ?? "";
    await markMessageSent(messageId, taskId);
    return buildSendResult(messageId, taskId, isFirstMessage);
  }

  // First message or fresh session
  if (isFirstMessage || needsFreshSession) {
    const taskBody = await buildFirstMessageBody(session, key, content, codebaseResearch, model);

    if (needsFreshSession) {
      (taskBody as Record<string, unknown>).conversationId = randomUUID();

      const history = allMessages
        .filter((m) => !m.cancelled && m.id !== messageId)
        .map((m) => `[${m.role === "user" ? "User" : "Assistant"}]: ${m.content.slice(0, 2000)}`)
        .join("\n\n---\n\n");

      if (history) {
        const args = (taskBody as Record<string, unknown>).args as Record<string, string>;
        args.args = `Previous conversation (for context):\n${history}\n\n---\n\n${args.args}`;
      }
    }

    const result = await agentFetch<TaskResponse>("/api/tasks", {
      method: "POST",
      body: taskBody,
      retries: 2,
    });

    if (!result.ok) {
      return logAndThrowAgentError(key, messageId, result, `Story writer message failed for ${key}: ${result.error.code}`, messageStart, messageStartedAt);
    }
    await logSuccess(key, `Story writer message sent for ${key}`, messageStart, messageStartedAt);
    const taskId = result.data.id ?? "";
    await markMessageSent(messageId, taskId);
    return buildSendResult(messageId, taskId, isFirstMessage || needsFreshSession);
  }

  // Follow-up message
  const breakdownState = session.mode === "epic" && epicPhaseUsesBreakdownSkill(session.phase)
    ? await buildBreakdownStateForSession(session.id)
    : undefined;
  const { content: followUpContent, isEdit } = buildFollowUpContent(session, key, content, codebaseResearch, breakdownState);

  console.info(
    `[story-writer] follow-up prompt: key=${key} editIntent=${isEdit} chars=${followUpContent.length} ~tokens=${Math.ceil(followUpContent.length / 4)}`,
  );

  const result = await agentFetch<TaskResponse>(
    `/api/conversations/${session.conversationId}/messages`,
    {
      method: "POST",
      body: { content: followUpContent, model },
      retries: 2,
    },
  );

  // Session lost: attempt recovery
  if (!result.ok && result.status === 410) {
    await logActivity({
      type: "story-writer",
      scope: key,
      status: "failed",
      summary: `Story writer message failed for ${key}: session lost (410)`,
      errorDetail: JSON.stringify({ code: result.error.code, error: result.error.error, httpStatus: 410, retryCount: result.retryCount }),
      durationMs: Date.now() - messageStart,
      startedAt: messageStartedAt,
    });

    const recoveryStart = Date.now();
    const recoveryStartedAt = new Date().toISOString();
    const recovered = await recoverSession(session, key, content);

    await logActivity({
      type: "story-writer",
      scope: key,
      status: recovered.status === 201 ? "success" : "failed",
      summary: recovered.status === 201
        ? `Story writer session recovered for ${key}`
        : `Story writer session recovery failed for ${key}`,
      durationMs: Date.now() - recoveryStart,
      startedAt: recoveryStartedAt,
    });

    if (recovered.status !== 201) {
      await markMessageFailed(messageId);
      throw new StoryWriterError(
        (recovered.body.error as string) ?? "Recovery failed",
        recovered.status,
        undefined,
        messageId,
      );
    }

    const taskId = (recovered.body.taskId as string) ?? "";
    await markMessageSent(messageId, taskId);
    return buildSendResult(messageId, taskId, true, true);
  }

  if (!result.ok) {
    return logAndThrowAgentError(key, messageId, result, `Story writer message failed for ${key}: ${result.error.code}`, messageStart, messageStartedAt);
  }

  await logSuccess(key, `Story writer message sent for ${key}`, messageStart, messageStartedAt);
  const taskId = result.data.id ?? "";
  await markMessageSent(messageId, taskId);
  return buildSendResult(messageId, taskId, isFirstMessage);
}

/**
 * Deletes a single message from the active session's conversation. Scoped to
 * pending/failed rows because dismiss is only offered on failed sends; sent
 * messages are conversation history and must never be deleted this way.
 */
export async function deleteMessage(key: string, messageId: string): Promise<{ success: boolean; deleted: number }> {
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
    throw new StoryWriterError("No active session", 404);
  }

  const deleted = await db
    .delete(message)
    .where(
      and(
        eq(message.id, messageId),
        eq(message.conversationId, session.conversationId),
        sql`${message.status} IN ('pending', 'failed')`,
      ),
    );
  return { success: true, deleted: deleted.changes };
}
