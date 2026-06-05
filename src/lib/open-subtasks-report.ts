import { getJiraUrl } from "./jira-url";

export interface ReportSubtask {
  key: string;
  title: string;
  status: string;
}

export interface ReportStory {
  key: string;
  title: string;
  status: string;
  assignee: string | null;
  openSubtasks: ReportSubtask[];
}

// The team chases work by status keyword, so "TO DO" is collapsed to the
// shorthand "TODO" they use in chat; every other status stays as-is.
export function formatStatusLabel(status: string): string {
  const upper = status.trim().toUpperCase();
  return upper === "TO DO" ? "TODO" : upper;
}

// Produces a plain-text, paste-ready list: one parent line per story followed by
// an indented line per still-open subtask. Stories with no open subtasks are dropped.
export function buildOpenSubtasksReport(stories: ReportStory[]): string {
  return stories
    .filter((story) => story.openSubtasks.length > 0)
    .map((story) => {
      const assigneeSuffix = story.assignee ? ` (${story.assignee})` : "";
      const parentLine = `${story.title} (${formatStatusLabel(story.status)}) - ${getJiraUrl(story.key)}${assigneeSuffix}`;
      const subLines = story.openSubtasks.map(
        (sub) => ` - ${sub.title} (${formatStatusLabel(sub.status)}) - ${getJiraUrl(sub.key)}`,
      );
      return [parentLine, ...subLines].join("\n");
    })
    .join("\n");
}
