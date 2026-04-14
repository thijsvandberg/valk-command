import { describe, it, expect } from "vitest";
import { parseBriefingOutput } from "./AiInsightsPanel";

describe("parseBriefingOutput", () => {
  it("returns plain text as narrative when no json-output tag", () => {
    const { narrative, risks } = parseBriefingOutput("The sprint is on track.");
    expect(narrative).toBe("The sprint is on track.");
    expect(risks).toEqual([]);
  });

  it("extracts narrative and risks from json-output tag", () => {
    const output = `The sprint is going well.\n<json-output>{"risks":["Low velocity","Unassigned ticket"]}</json-output>`;
    const { narrative, risks } = parseBriefingOutput(output);
    expect(narrative).toBe("The sprint is going well.");
    expect(risks).toEqual(["Low velocity", "Unassigned ticket"]);
  });

  it("returns empty risks array when json-output has no risks field", () => {
    const output = `Narrative text.<json-output>{"other":"value"}</json-output>`;
    const { narrative, risks } = parseBriefingOutput(output);
    expect(narrative).toBe("Narrative text.");
    expect(risks).toEqual([]);
  });

  it("returns empty risks array when json-output is malformed JSON", () => {
    const output = `Narrative.<json-output>not-json</json-output>`;
    const { narrative, risks } = parseBriefingOutput(output);
    expect(narrative).toBe("Narrative.");
    expect(risks).toEqual([]);
  });

  it("trims whitespace from narrative", () => {
    const { narrative } = parseBriefingOutput("  Trimmed narrative.  ");
    expect(narrative).toBe("Trimmed narrative.");
  });

  it("handles multiline output before json-output tag", () => {
    const output = `Line one.\nLine two.\n<json-output>{"risks":["Risk 1"]}</json-output>`;
    const { narrative } = parseBriefingOutput(output);
    expect(narrative).toBe("Line one.\nLine two.");
  });
});
