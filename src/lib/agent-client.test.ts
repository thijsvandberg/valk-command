import { describe, it, expect } from "vitest";
import {
  parseSkillInvocation,
  mapAgentReviewToResult,
  parseReviewOutput,
} from "./agent-client";
import type { ReviewStoryData } from "./agent-client";

describe("agent-client", () => {
  describe("parseSkillInvocation", () => {
    it("returns null for non-skill messages", () => {
      expect(parseSkillInvocation("hello")).toBeNull();
      expect(parseSkillInvocation("")).toBeNull();
      expect(parseSkillInvocation("  no slash  ")).toBeNull();
    });

    it("parses a skill with args", () => {
      expect(parseSkillInvocation("/review VPL-123")).toEqual({
        skill: "review",
        args: "VPL-123",
      });
    });

    it("parses a skill without args", () => {
      expect(parseSkillInvocation("/help")).toEqual({
        skill: "help",
        args: "",
      });
    });

    it("handles leading/trailing whitespace", () => {
      expect(parseSkillInvocation("  /sync all  ")).toEqual({
        skill: "sync",
        args: "all",
      });
    });
  });

  describe("mapAgentReviewToResult", () => {
    const sampleData: ReviewStoryData = {
      skill: "review-story",
      issue: {
        key: "VPL-10",
        summary: "Test",
        type: "Story",
        status: "To Do",
        priority: "Medium",
        assignee: null,
        sprint: null,
        url: "https://jira.example.com/VPL-10",
      },
      profile: "default",
      score: 15,
      maxScore: 20,
      verdict: "Good",
      criteria: [
        {
          name: "Clarity",
          score: 8,
          maxScore: 10,
          status: "pass",
          subItems: [],
        },
        {
          name: "Testability",
          score: 7,
          maxScore: 10,
          status: "fail",
          subItems: [
            { name: "Has examples", score: 3, maxScore: 5, status: "fail", issue: "Missing examples" },
          ],
        },
      ],
      issues: [
        {
          criterion: "Testability",
          location: "AC",
          problem: "No test scenarios",
          suggestion: "Add scenarios",
        },
      ],
      summary: "Mostly good",
    };

    it("normalises the score to 0-100", () => {
      const result = mapAgentReviewToResult(sampleData);
      expect(result.overallScore).toBe(75);
    });

    it("maps criteria to dimensions", () => {
      const result = mapAgentReviewToResult(sampleData);
      expect(result.dimensions).toHaveLength(2);
      expect(result.dimensions[0].key).toBe("clarity");
      expect(result.dimensions[0].score).toBe(80);
    });

    it("includes failed sub-items in feedback", () => {
      const result = mapAgentReviewToResult(sampleData);
      const testability = result.dimensions.find((d) => d.key === "testability");
      expect(testability?.feedback).toContain("Missing examples");
    });

    it("formats suggestions with criterion context", () => {
      const result = mapAgentReviewToResult(sampleData);
      expect(result.suggestions[0]).toContain("[Testability|AC|");
      expect(result.suggestions[0]).toContain("No test scenarios");
    });

    it("handles zero maxScore gracefully", () => {
      const zeroData = { ...sampleData, maxScore: 0 };
      const result = mapAgentReviewToResult(zeroData);
      expect(result.overallScore).toBe(0);
    });
  });

  describe("parseReviewOutput", () => {
    it("parses output wrapped in json-output tags", () => {
      const data: ReviewStoryData = {
        skill: "review-story",
        issue: { key: "X-1", summary: "", type: "", status: "", priority: "", assignee: null, sprint: null, url: "" },
        profile: "default",
        score: 10,
        maxScore: 10,
        verdict: "Pass",
        criteria: [],
        issues: [],
        summary: "Good",
      };
      const output = `Some text\n<json-output>${JSON.stringify(data)}</json-output>\nMore text`;
      const result = parseReviewOutput(output);
      expect(result).not.toBeNull();
      expect(result?.score).toBe(10);
    });

    it("returns null for non-review JSON", () => {
      expect(parseReviewOutput('{"foo": "bar"}')).toBeNull();
    });

    it("returns null for invalid JSON", () => {
      expect(parseReviewOutput("not json at all")).toBeNull();
    });
  });
});
