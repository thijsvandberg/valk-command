import { NextResponse } from "next/server";
import { db } from "@/db";

/**
 * GET /api/attachments/[id]
 *
 * Proxies a Jira attachment through the Next.js server so the browser never
 * needs direct Jira credentials. The attachment record must have a jiraUrl
 * stored from the sync step.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const att = await db.query.ticketAttachment.findFirst({
    where: (a, { eq }) => eq(a.id, id),
  });

  if (!att?.jiraUrl) {
    return new NextResponse(null, { status: 404 });
  }

  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  const jiraBaseUrl = process.env.NEXT_PUBLIC_JIRA_BASE_URL ?? "";

  if (!email || !token) {
    return new NextResponse(null, { status: 503 });
  }

  // Validate the URL points to the configured Jira instance to prevent SSRF
  try {
    const parsed = new URL(att.jiraUrl);
    const base = new URL(jiraBaseUrl || "https://new-story.atlassian.net");
    if (parsed.hostname !== base.hostname) {
      console.error("[attachments] SSRF blocked: URL hostname mismatch", parsed.hostname);
      return new NextResponse(null, { status: 403 });
    }
    if (parsed.protocol !== "https:") {
      return new NextResponse(null, { status: 403 });
    }
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const auth = Buffer.from(`${email}:${token}`).toString("base64");

  let upstream: Response;
  try {
    upstream = await fetch(att.jiraUrl, {
      headers: { Authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }

  if (!upstream.ok) {
    return new NextResponse(null, { status: upstream.status });
  }

  const sanitizedFilename = att.filename
    .replace(/["\\\0]/g, "_")
    .slice(0, 255);

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": att.mimeType,
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": `inline; filename="${sanitizedFilename}"`,
    },
  });
}
