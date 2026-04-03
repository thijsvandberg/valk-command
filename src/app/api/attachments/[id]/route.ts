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

  if (!email || !token) {
    return new NextResponse(null, { status: 503 });
  }

  const auth = Buffer.from(`${email}:${token}`).toString("base64");

  let upstream: Response;
  try {
    upstream = await fetch(att.jiraUrl, {
      headers: { Authorization: `Basic ${auth}` },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }

  if (!upstream.ok) {
    return new NextResponse(null, { status: upstream.status });
  }

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": att.mimeType,
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": `inline; filename="${att.filename}"`,
    },
  });
}
