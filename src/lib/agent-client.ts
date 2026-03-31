/**
 * Client for communicating with the valk-agent workspace.
 * Currently returns mock data; will be replaced with real REST/SSE calls
 * once the agent is available.
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

/**
 * Asks the agent to review a story by its Jira key.
 * Returns a structured review with quality scores per dimension.
 *
 * Currently returns mock data after a simulated delay.
 */
export async function reviewStory(ticketKey: string): Promise<ReviewResult> {
  // Simulate network latency
  await new Promise((resolve) => setTimeout(resolve, 2000));

  return {
    overallScore: 68,
    dimensions: [
      {
        key: "clarity",
        label: "Clarity",
        score: 75,
        feedback: `The description for ${ticketKey} is mostly clear, but the expected behavior section could be more specific about edge cases.`,
      },
      {
        key: "testability",
        label: "Testability",
        score: 60,
        feedback: "Acceptance criteria are present but lack concrete test scenarios. Consider adding specific input/output examples.",
      },
      {
        key: "completeness",
        label: "Completeness",
        score: 55,
        feedback: "Missing error handling scenarios and rollback behavior. Consider adding non-functional requirements.",
      },
      {
        key: "feasibility",
        label: "Technical Feasibility",
        score: 82,
        feedback: "Implementation approach is sound. The proposed solution aligns with the existing architecture.",
      },
    ],
    summary:
      "The story provides a reasonable foundation but needs refinement in testability and completeness before it is sprint-ready.",
    suggestions: [
      "Add explicit error scenarios to acceptance criteria",
      "Include a sequence diagram for the concurrency handling",
      "Define performance thresholds for the load test requirement",
      "Specify the retry strategy for deadlock scenarios",
    ],
  };
}
