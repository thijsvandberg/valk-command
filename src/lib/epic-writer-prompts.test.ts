import { describe, it, expect } from "vitest";
import { deepenCardPrompt, GENERATE_BREAKDOWN_PROMPT } from "./epic-writer-prompts";

describe("epic-writer-prompts", () => {
  it("builds a 1-based deepen prompt with the card title", () => {
    expect(deepenCardPrompt(0, "Cart summary")).toBe(
      'Deepen story 1 ("Cart summary") into a full description and acceptance criteria.',
    );
  });

  it("omits the title label when the title is blank", () => {
    expect(deepenCardPrompt(2, "   ")).toBe(
      "Deepen story 3 into a full description and acceptance criteria.",
    );
  });

  it("exposes a stable generate-breakdown prompt", () => {
    expect(GENERATE_BREAKDOWN_PROMPT).toMatch(/break this epic down into child stories/i);
  });
});
