import { describe, it, expect } from "vitest";
import { parseRelatedStories } from "./parse-related-stories";

describe("parseRelatedStories", () => {
  it("extracts valid items from a well-formed block", () => {
    const output = `Some text before
<related-stories>
[
  {"key":"VPL-100","score":0.9,"title":"Auth flow","status":"TO DO","reason":"Both handle login"},
  {"key":"VPL-200","score":0.7,"title":"Session bug","status":"IN PROGRESS","type":"bug"}
]
</related-stories>
Some text after`;

    const items = parseRelatedStories(output);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      key: "VPL-100",
      score: 0.9,
      title: "Auth flow",
      status: "TO DO",
      reason: "Both handle login",
    });
    expect(items[1].type).toBe("bug");
  });

  it("returns empty array when no block is present", () => {
    expect(parseRelatedStories("Just some text")).toEqual([]);
  });

  it("returns empty array for malformed JSON", () => {
    const output = "<related-stories>not json</related-stories>";
    expect(parseRelatedStories(output)).toEqual([]);
  });

  it("returns empty array for non-array JSON", () => {
    const output = '<related-stories>{"key":"VPL-1"}</related-stories>';
    expect(parseRelatedStories(output)).toEqual([]);
  });

  it("filters out items missing required fields", () => {
    const output = `<related-stories>[
      {"key":"VPL-1","score":0.8,"title":"Good","status":"TO DO"},
      {"key":"VPL-2","score":0.5,"title":"Missing status"},
      {"score":0.3,"title":"Missing key","status":"DONE"},
      {"key":"VPL-4","title":"Missing score","status":"DONE"},
      {"key":"VPL-5","score":"not-a-number","title":"Bad score","status":"DONE"}
    ]</related-stories>`;

    const items = parseRelatedStories(output);
    expect(items).toHaveLength(1);
    expect(items[0].key).toBe("VPL-1");
  });

  it("handles optional fields gracefully", () => {
    const output = `<related-stories>[
      {"key":"VPL-1","score":0.5,"title":"Minimal","status":"TO DO"}
    ]</related-stories>`;

    const items = parseRelatedStories(output);
    expect(items).toHaveLength(1);
    expect(items[0].type).toBeUndefined();
    expect(items[0].reason).toBeUndefined();
    expect(items[0].url).toBeUndefined();
  });

  it("handles empty array", () => {
    const output = "<related-stories>[]</related-stories>";
    expect(parseRelatedStories(output)).toEqual([]);
  });
});
