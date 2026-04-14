const BASE = (process.env.NEXT_PUBLIC_JIRA_BASE_URL ?? "https://new-story.atlassian.net").replace(/\/$/, "");

export function getJiraUrl(key: string): string {
  return `${BASE}/browse/${key}`;
}
