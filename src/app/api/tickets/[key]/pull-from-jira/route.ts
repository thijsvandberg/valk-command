import { NextResponse } from "next/server";
import { jiraClient } from "@/lib/jira-client";
import { adfToMarkdown } from "@/lib/adf-to-markdown";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;

  try {
    const issue = await jiraClient.getIssue(key);
    const fields = issue.fields;
    const description =
      typeof fields.description === "string"
        ? fields.description
        : adfToMarkdown(fields.description);

    return NextResponse.json({ description: description ?? "" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch from Jira";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
