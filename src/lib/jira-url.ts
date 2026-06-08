const BASE = (process.env.NEXT_PUBLIC_JIRA_BASE_URL ?? "https://new-story.atlassian.net").replace(/\/$/, "");
const PROJECT_KEY = process.env.NEXT_PUBLIC_JIRA_PROJECT_KEY ?? "VPL";
const BOARD_ID = process.env.NEXT_PUBLIC_JIRA_BOARD_ID ?? "";

export function getJiraUrl(key: string): string {
  return `${BASE}/browse/${key}`;
}

/**
 * Deep link to a sprint on its Jira board backlog, filtered to that sprint.
 * Returns null when the board id is not configured (NEXT_PUBLIC_JIRA_BOARD_ID),
 * so callers can hide the link rather than render a broken URL.
 */
export function getJiraSprintUrl(sprintId: string): string | null {
  if (!BOARD_ID || !sprintId) return null;
  const jql = encodeURIComponent(`Sprint = ${sprintId}`);
  return `${BASE}/jira/software/projects/${PROJECT_KEY}/boards/${BOARD_ID}/backlog?jql=${jql}`;
}
