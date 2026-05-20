import { NextResponse } from "next/server";
import { jiraClient } from "@/lib/jira-client";
import { applyRateLimit } from "@/lib/rate-limiter";

/**
 * GET /api/jira/assignable-users
 *
 * Returns users assignable to the configured Jira project.
 */
export async function GET() {
  const limited = applyRateLimit("sync");
  if (limited) return limited;

  const projectKey = process.env.JIRA_PROJECT_KEY;
  if (!projectKey) {
    return NextResponse.json({ users: [] });
  }

  try {
    const users = await jiraClient.getAssignableUsers(projectKey);
    return NextResponse.json({ users });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ users: [], error: message }, { status: 500 });
  }
}
