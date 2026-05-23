import { NextResponse } from "next/server";
import { validatePathParam } from "@/lib/api-validation";
import { applyRateLimit } from "@/lib/rate-limiter";
import { sanitizeText } from "@/lib/sanitize";
import { jiraClient } from "@/lib/jira-client";
import { adfToMarkdown } from "@/lib/adf-to-markdown";
import { db } from "@/db";
import { jiraComment } from "@/db/schema";
import { cache } from "@/lib/cache";
import { userInitials, userColor } from "@/lib/user-utils";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const limited = applyRateLimit("write");
  if (limited) return limited;

  const { key } = await params;
  const invalid = validatePathParam(key);
  if (invalid) return invalid;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.content !== "string" || !(body.content as string).trim()) {
    return NextResponse.json(
      { error: "content is required and must be a non-empty string" },
      { status: 400 },
    );
  }

  const content = sanitizeText((body.content as string).trim());
  if (content.length > 10000) {
    return NextResponse.json(
      { error: "content must not exceed 10000 characters" },
      { status: 400 },
    );
  }

  let created;
  try {
    created = await jiraClient.addComment(key, content);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("not configured")) {
      return NextResponse.json({ error: "Jira is not configured" }, { status: 503 });
    }
    return NextResponse.json({ error: "Failed to post comment to Jira" }, { status: 502 });
  }

  const authorName = created.author.displayName;
  const authorAvatar = created.author.avatarUrls?.["48x48"] ?? null;
  const contentMarkdown = typeof created.body === "string"
    ? created.body
    : adfToMarkdown(created.body);

  const id = `jc-${created.id}`;

  await db.insert(jiraComment).values({
    id,
    ticketKey: key,
    jiraCommentId: created.id,
    authorName,
    authorAvatar,
    content: contentMarkdown,
    createdAt: created.created,
  });

  cache.invalidate(`/api/tickets/${key}`);

  return NextResponse.json({
    id,
    authorName,
    authorAvatar,
    authorInitials: userInitials(authorName),
    authorColor: userColor(authorName),
    content: contentMarkdown,
    createdAt: created.created,
  }, { status: 201 });
}
