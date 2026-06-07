import { describe, it, expect } from "vitest";
import { extractEpicQuestions, extractEpicBreakdown, extractStoryDetails, extractSprintPlan } from "./epic-breakdown-parser";

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

describe("extractStoryDetails", () => {
  it("extracts a single detail block keyed by its index", () => {
    const output =
      `Here is the worked-out story:\n` +
      `<story-detail index="2">\n## Description\nFull body.\n\n## Acceptance criteria\n- Given X\n</story-detail>\nLet me know.`;
    const details = extractStoryDetails(output);
    expect(details).not.toBeNull();
    expect(details).toHaveLength(1);
    expect(details![0].index).toBe(2);
    expect(details![0].body).toBe("## Description\nFull body.\n\n## Acceptance criteria\n- Given X");
  });

  it("extracts multiple detail blocks deepened in parallel", () => {
    const output =
      `<story-detail index="0">Body zero</story-detail>` +
      `<story-detail index="3">Body three</story-detail>`;
    const details = extractStoryDetails(output)!;
    expect(details).toHaveLength(2);
    const byIndex = Object.fromEntries(details.map((d) => [d.index, d.body]));
    expect(byIndex[0]).toBe("Body zero");
    expect(byIndex[3]).toBe("Body three");
  });

  it("returns null when no detail block is present (leave bodies untouched)", () => {
    expect(extractStoryDetails("just chatting, no detail")).toBeNull();
  });

  it("drops blocks without a usable index", () => {
    const output =
      `<story-detail>missing index</story-detail>` +
      `<story-detail index="-1">negative</story-detail>` +
      `<story-detail index="1">keep me</story-detail>`;
    const details = extractStoryDetails(output)!;
    expect(details).toHaveLength(1);
    expect(details[0]).toEqual({ index: 1, body: "keep me" });
  });

  it("drops blocks with empty inner content", () => {
    const output = `<story-detail index="0">   </story-detail>`;
    // The block is present but unusable, so an empty array (not null) is returned.
    expect(extractStoryDetails(output)).toEqual([]);
  });

  it("keeps the last block when an index is repeated", () => {
    const output =
      `<story-detail index="0">first</story-detail>` +
      `<story-detail index="0">second wins</story-detail>`;
    const details = extractStoryDetails(output)!;
    expect(details).toHaveLength(1);
    expect(details[0].body).toBe("second wins");
  });
});

describe("extractSprintPlan", () => {
  it("extracts per-card sprint suggestions, normalizing numeric ids to strings", () => {
    const output =
      `Proposed plan:\n<sprint-plan>[{"index":0,"sprintId":42},{"index":1,"sprintId":"43"}]</sprint-plan>`;
    const plan = extractSprintPlan(output)!;
    expect(plan).toEqual([
      { index: 0, sprintId: "42" },
      { index: 1, sprintId: "43" },
    ]);
  });

  it("passes the backlog marker through verbatim", () => {
    const output = `<sprint-plan>[{"index":0,"sprintId":"__backlog__"}]</sprint-plan>`;
    expect(extractSprintPlan(output)).toEqual([{ index: 0, sprintId: "__backlog__" }]);
  });

  it("returns null when the block is absent (leave suggestions untouched)", () => {
    expect(extractSprintPlan("no plan here")).toBeNull();
  });

  it("returns null when the JSON is unparseable", () => {
    expect(extractSprintPlan("<sprint-plan>not json</sprint-plan>")).toBeNull();
  });

  it("drops entries without a usable index or sprint id", () => {
    const output =
      `<sprint-plan>[` +
      `{"index":-1,"sprintId":"1"},` +
      `{"sprintId":"2"},` +
      `{"index":3},` +
      `{"index":4,"sprintId":""},` +
      `{"index":5,"sprintId":"77"}` +
      `]</sprint-plan>`;
    expect(extractSprintPlan(output)).toEqual([{ index: 5, sprintId: "77" }]);
  });

  it("keeps the last entry when an index is repeated", () => {
    const output =
      `<sprint-plan>[{"index":0,"sprintId":"1"},{"index":0,"sprintId":"2"}]</sprint-plan>`;
    expect(extractSprintPlan(output)).toEqual([{ index: 0, sprintId: "2" }]);
  });

  it("returns an empty array when the block is present but has no usable entries", () => {
    expect(extractSprintPlan(`<sprint-plan>[{"foo":"bar"}]</sprint-plan>`)).toEqual([]);
  });
});
