import { describe, it, expect } from "vitest";
import { extractEpicQuestions, extractEpicBreakdown } from "./epic-breakdown-parser";

describe("extractEpicQuestions", () => {
  it("extracts the inner markdown of an <epic-questions> block", () => {
    const output =
      "Here are some questions:\n<epic-questions>\n- Who is the user?\n- What is the goal?\n</epic-questions>\nLet me know.";
    expect(extractEpicQuestions(output)).toBe("- Who is the user?\n- What is the goal?");
  });

  it("returns null when the block is absent", () => {
    expect(extractEpicQuestions("no questions here")).toBeNull();
  });

  it("returns null for an empty block", () => {
    expect(extractEpicQuestions("<epic-questions>   </epic-questions>")).toBeNull();
  });
});

describe("extractEpicBreakdown", () => {
  it("parses a JSON array of cards with all fields", () => {
    const output =
      `Proposed breakdown:\n<epic-breakdown>[` +
      `{"title":"Cart summary","bullets":["Show line items","Show total"],"suggestedSprintId":42,` +
      `"suggestedLinks":[{"targetIndex":1,"relation":"blocks"}]},` +
      `{"title":"Coupon flow","bullets":["Apply coupon"],"body":"Full body text"}` +
      `]</epic-breakdown>\nDone.`;

    const cards = extractEpicBreakdown(output);
    expect(cards).not.toBeNull();
    expect(cards).toHaveLength(2);

    expect(cards![0].title).toBe("Cart summary");
    expect(cards![0].bullets).toEqual(["Show line items", "Show total"]);
    expect(cards![0].body).toBeNull();
    // Numeric sprint id normalized to string.
    expect(cards![0].suggestedSprintId).toBe("42");
    // Suggested links always start unconfirmed.
    expect(cards![0].suggestedLinks).toEqual([
      { targetIndex: 1, relation: "blocks", confirmed: false },
    ]);

    expect(cards![1].title).toBe("Coupon flow");
    expect(cards![1].body).toBe("Full body text");
  });

  it("returns null when the block is absent (leave existing cards untouched)", () => {
    expect(extractEpicBreakdown("just chatting")).toBeNull();
  });

  it("returns null on malformed JSON rather than throwing", () => {
    expect(extractEpicBreakdown("<epic-breakdown>[{ not json ]</epic-breakdown>")).toBeNull();
  });

  it("drops cards without a usable title", () => {
    const output = `<epic-breakdown>[{"bullets":["x"]},{"title":"  "},{"title":"Keep me"}]</epic-breakdown>`;
    const cards = extractEpicBreakdown(output);
    expect(cards).toHaveLength(1);
    expect(cards![0].title).toBe("Keep me");
  });

  it("filters invalid bullets and links defensively", () => {
    const output =
      `<epic-breakdown>[{"title":"T","bullets":["ok","",3],` +
      `"suggestedLinks":[{"targetIndex":-1,"relation":"blocks"},{"targetIndex":2,"relation":"bogus"},{"targetIndex":0,"relation":"relates to"}]}]</epic-breakdown>`;
    const cards = extractEpicBreakdown(output)!;
    expect(cards[0].bullets).toEqual(["ok"]);
    expect(cards[0].suggestedLinks).toEqual([
      { targetIndex: 0, relation: "relates to", confirmed: false },
    ]);
  });

  it("returns an empty array when the block has no valid cards", () => {
    expect(extractEpicBreakdown("<epic-breakdown>[]</epic-breakdown>")).toEqual([]);
  });
});
