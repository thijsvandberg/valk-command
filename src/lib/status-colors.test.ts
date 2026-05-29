import { describe, it, expect } from "vitest";
import {
  getScoreColor,
  verdictLabel,
  chatVerdictColor,
  chatStatusColor,
  pipelineStatusColor,
  JIRA_STATUS_STYLES,
  READINESS_STYLES,
  PR_STATUS_STYLES,
  CONFIDENCE_STYLES,
  SPRINT_STATE_COLORS,
} from "./status-colors";

describe("getScoreColor", () => {
  it("returns error for score < 60", () => {
    expect(getScoreColor(0)).toBe("var(--color-status-error)");
    expect(getScoreColor(59)).toBe("var(--color-status-error)");
  });

  it("returns warning for score 60-74", () => {
    expect(getScoreColor(60)).toBe("var(--color-status-warning)");
    expect(getScoreColor(74)).toBe("var(--color-status-warning)");
  });

  it("returns caution for score 75-89", () => {
    expect(getScoreColor(75)).toBe("var(--color-status-caution)");
    expect(getScoreColor(89)).toBe("var(--color-status-caution)");
  });

  it("returns success for score >= 90", () => {
    expect(getScoreColor(90)).toBe("var(--color-status-success)");
    expect(getScoreColor(100)).toBe("var(--color-status-success)");
  });
});

describe("verdictLabel", () => {
  it("returns 'Ready for sprint' for score >= 90", () => {
    const result = verdictLabel(95);
    expect(result.text).toBe("Ready for sprint");
    expect(result.color).toBe("var(--color-status-success)");
  });

  it("returns 'Minor issues' for score 75-89", () => {
    const result = verdictLabel(80);
    expect(result.text).toBe("Minor issues");
    expect(result.color).toBe("var(--color-status-caution)");
  });

  it("returns 'Needs work' for score 60-74", () => {
    const result = verdictLabel(65);
    expect(result.text).toBe("Needs work");
    expect(result.color).toBe("var(--color-status-warning)");
  });

  it("returns 'Not ready' for score < 60", () => {
    const result = verdictLabel(30);
    expect(result.text).toBe("Not ready");
    expect(result.color).toBe("var(--color-status-error)");
  });
});

describe("chatVerdictColor", () => {
  it("maps each verdict string to correct color", () => {
    expect(chatVerdictColor("Ready for sprint")).toBe("var(--color-status-done)");
    expect(chatVerdictColor("Minor issues")).toBe("var(--color-status-caution)");
    expect(chatVerdictColor("Needs work")).toBe("var(--color-status-warning)");
    expect(chatVerdictColor("unknown")).toBe("var(--color-status-error)");
  });
});

describe("chatStatusColor", () => {
  it("maps each status string to correct color", () => {
    expect(chatStatusColor("pass")).toBe("var(--color-status-done)");
    expect(chatStatusColor("na")).toBe("var(--color-status-done)");
    expect(chatStatusColor("partial")).toBe("var(--color-status-caution)");
    expect(chatStatusColor("fail")).toBe("var(--color-status-error)");
  });
});

describe("JIRA_STATUS_STYLES", () => {
  it("has entries for all JiraStatus values", () => {
    const expected = ["TO DO", "IN PROGRESS", "TEST", "DONE", "DEPRECATED"];
    expect(Object.keys(JIRA_STATUS_STYLES)).toEqual(expect.arrayContaining(expected));
    expect(Object.keys(JIRA_STATUS_STYLES)).toHaveLength(expected.length);
  });

  it("each entry has bg and text properties", () => {
    for (const style of Object.values(JIRA_STATUS_STYLES)) {
      expect(style).toHaveProperty("bg");
      expect(style).toHaveProperty("text");
    }
  });
});

describe("READINESS_STYLES", () => {
  it("has entries for all TicketReadiness values", () => {
    const expected = ["drafting", "waiting_for_feedback", "ready_to_refine", "on_hold"];
    expect(Object.keys(READINESS_STYLES)).toEqual(expect.arrayContaining(expected));
    expect(Object.keys(READINESS_STYLES)).toHaveLength(expected.length);
  });

  it("each entry has color and bg properties", () => {
    for (const style of Object.values(READINESS_STYLES)) {
      expect(style).toHaveProperty("color");
      expect(style).toHaveProperty("bg");
    }
  });
});

describe("pipelineStatusColor", () => {
  it("returns success for SUCCESSFUL", () => {
    expect(pipelineStatusColor("SUCCESSFUL")).toBe("var(--color-status-success)");
  });

  it("returns error for FAILED", () => {
    expect(pipelineStatusColor("FAILED")).toBe("var(--color-status-error)");
  });

  it("returns warning for other states", () => {
    expect(pipelineStatusColor("IN_PROGRESS")).toBe("var(--color-status-warning)");
    expect(pipelineStatusColor("PENDING")).toBe("var(--color-status-warning)");
  });
});

describe("PR_STATUS_STYLES", () => {
  it("has entries for OPEN, MERGED, DECLINED", () => {
    expect(PR_STATUS_STYLES).toHaveProperty("OPEN");
    expect(PR_STATUS_STYLES).toHaveProperty("MERGED");
    expect(PR_STATUS_STYLES).toHaveProperty("DECLINED");
  });
});

describe("CONFIDENCE_STYLES", () => {
  it("has entries for high, medium, low", () => {
    expect(CONFIDENCE_STYLES.high.label).toBe("High");
    expect(CONFIDENCE_STYLES.medium.label).toBe("Med");
    expect(CONFIDENCE_STYLES.low.label).toBe("Low");
  });
});

describe("SPRINT_STATE_COLORS", () => {
  it("maps active and future states", () => {
    expect(SPRINT_STATE_COLORS.active).toBe("var(--color-status-success)");
    expect(SPRINT_STATE_COLORS.future).toBe("var(--color-status-info)");
  });
});
