/**
 * Client for communicating with the valk-agent workspace.
 */

/** Shape of a single server-sent event from the agent streaming endpoint. */
export interface SSEEvent {
  type: "tool_call" | "progress" | "output" | "error" | "done";
  tool?: string;
  id?: string;
  args?: string;
  text?: string;
}

/** Parsed skill invocation from a chat message (e.g. "/review VPL-123"). */
export interface SkillInvocation {
  skill: string;
  args: string;
}

/**
 * Detects whether a chat message is a skill invocation (starts with "/").
 * Returns the skill name and remaining args, or null if not an invocation.
 */
export function parseSkillInvocation(content: string): SkillInvocation | null {
  const trimmed = content.trim();
  if (!trimmed.startsWith("/")) return null;
  const [rawSkill, ...rest] = trimmed.slice(1).split(" ");
  if (!rawSkill) return null;
  return { skill: rawSkill, args: rest.join(" ") };
}

export interface ReviewDimensionResult {
  key: string;
  label: string;
  score: number;
  feedback: string;
}

export interface ReviewResult {
  overallScore: number;
  dimensions: ReviewDimensionResult[];
  summary: string;
  suggestions: string[];
}

/** Structured JSON returned by the agent's review-story skill. */
export interface ReviewStoryData {
  skill: string;
  issue: {
    key: string;
    summary: string;
    type: string;
    status: string;
    priority: string;
    assignee: string | null;
    sprint: string | null;
    url: string;
  };
  profile: string;
  score: number;
  maxScore: number;
  verdict: string;
  criteria: Array<{
    name: string;
    score: number;
    maxScore: number;
    status: string;
    subItems?: Array<{
      name: string;
      score: number;
      maxScore: number;
      status: string;
      issue?: string;
    }>;
  }>;
  issues: Array<{
    criterion: string;
    location: string;
    problem: string;
    suggestion: string;
  }>;
  summary: string;
}

/**
 * Maps the agent's ReviewStoryData to the format used for review persistence.
 * Normalises the score to 0-100 and converts criteria to dimensions.
 */
export function mapAgentReviewToResult(data: ReviewStoryData): ReviewResult {
  const overallScore = data.maxScore > 0
    ? Math.round((data.score / data.maxScore) * 100)
    : 0;

  const dimensions: ReviewDimensionResult[] = data.criteria.map((c) => {
    const pct = c.maxScore > 0 ? Math.round((c.score / c.maxScore) * 100) : 0;
    const failedSubs = c.subItems?.filter((s) => s.status === "fail") ?? [];
    const feedbackText = failedSubs.length > 0
      ? failedSubs.map((s) => s.issue ?? s.name).join("; ")
      : c.status === "pass" ? "Looks good" : "Needs attention";

    return {
      key: c.name.toLowerCase().replace(/\s+/g, "-"),
      label: c.name,
      score: pct,
      // Encode raw score in feedback so the UI can display "15/20" alongside the percentage
      feedback: `${c.score}/${c.maxScore}|${feedbackText}`,
    };
  });

  const suggestions = data.issues.map((i) => {
    const crit = data.criteria.find((c) => c.name === i.criterion);
    const scoreStr = crit ? `${crit.score}/${crit.maxScore}` : "";
    const location = i.location || "";
    return `[${i.criterion}|${location}|${scoreStr}] ${i.problem} \u2192 ${i.suggestion}`;
  });

  return {
    overallScore,
    dimensions,
    summary: data.summary,
    suggestions,
  };
}

/**
 * Tries to extract a ReviewStoryData from workspace task output.
 * The agent wraps output in <json-output>...</json-output> tags.
 */
export function parseReviewOutput(output: string): ReviewStoryData | null {
  // Try <json-output> wrapper first
  const jsonMatch = output.match(/<json-output>([\s\S]*?)<\/json-output>/);
  const raw = jsonMatch ? jsonMatch[1] : output;

  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "skill" in parsed &&
      (parsed.skill === "review-story" || parsed.skill === "review-story-json") &&
      "score" in parsed &&
      "criteria" in parsed
    ) {
      return parsed as ReviewStoryData;
    }
  } catch {
    // Not valid JSON
  }
  return null;
}

