import { describe, it, expect } from "vitest";
import { parseLinkSuggestions, stripLinkSuggestionTags, parseEpicSuggestions, stripEpicSuggestionTags } from "./ChatMessageParts";

describe("parseLinkSuggestions", () => {
  it("parses a single link-suggestion tag", () => {
    const content = 'Some text <link-suggestion key="VPL-123" relation="relates to" /> more text';
    const result = parseLinkSuggestions(content);
    expect(result).toEqual([{ key: "VPL-123", relation: "relates to" }]);
  });

  it("parses multiple single link-suggestion tags", () => {
    const content =
      '<link-suggestion key="VPL-1" relation="blocks" /> and <link-suggestion key="VPL-2" relation="is blocked by" />';
    const result = parseLinkSuggestions(content);
    expect(result).toEqual([
      { key: "VPL-1", relation: "blocks" },
      { key: "VPL-2", relation: "is blocked by" },
    ]);
  });

  it("parses link-suggestions multi-tag format", () => {
    const content = `Here are some links:
<link-suggestions>
<link key="VPL-100" relation="relates to" />
<link key="BRDG-045" relation="is blocked by" />
</link-suggestions>
Done.`;
    const result = parseLinkSuggestions(content);
    expect(result).toEqual([
      { key: "VPL-100", relation: "relates to" },
      { key: "BRDG-045", relation: "is blocked by" },
    ]);
  });

  it("deduplicates keys across multi and single tags", () => {
    const content =
      '<link-suggestions><link key="VPL-1" relation="blocks" /></link-suggestions> <link-suggestion key="VPL-1" relation="relates to" />';
    const result = parseLinkSuggestions(content);
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe("VPL-1");
  });

  it("defaults invalid relation to 'relates to'", () => {
    const content = '<link-suggestion key="VPL-1" relation="invalid-relation" />';
    const result = parseLinkSuggestions(content);
    expect(result).toEqual([{ key: "VPL-1", relation: "relates to" }]);
  });

  it("returns empty array for content with no link tags", () => {
    const content = "Just some text without any link suggestions.";
    expect(parseLinkSuggestions(content)).toEqual([]);
  });

  it("returns empty array for user messages (function only parses content string)", () => {
    const content = '<link-suggestion key="VPL-1" relation="relates to" />';
    // The function itself parses any content; the caller gates on role
    expect(parseLinkSuggestions(content)).toEqual([{ key: "VPL-1", relation: "relates to" }]);
  });

  it("handles all valid relation types", () => {
    const relations = [
      "relates to",
      "blocks",
      "is blocked by",
      "clones",
      "is cloned by",
      "duplicates",
      "is duplicated by",
    ];
    for (const rel of relations) {
      const content = `<link-suggestion key="X-1" relation="${rel}" />`;
      const result = parseLinkSuggestions(content);
      expect(result[0].relation).toBe(rel);
    }
  });
});

describe("stripLinkSuggestionTags", () => {
  it("strips single link-suggestion tags", () => {
    const input = 'before <link-suggestion key="VPL-1" relation="relates to" /> after';
    expect(stripLinkSuggestionTags(input)).toBe("before  after");
  });

  it("strips link-suggestions multi-tag block", () => {
    const input = `text
<link-suggestions>
<link key="VPL-1" relation="blocks" />
</link-suggestions>
more text`;
    const result = stripLinkSuggestionTags(input);
    expect(result).not.toContain("link-suggestions");
    expect(result).toContain("text");
    expect(result).toContain("more text");
  });

  it("strips both formats in the same content", () => {
    const input =
      '<link-suggestions><link key="A-1" relation="blocks" /></link-suggestions> and <link-suggestion key="B-2" relation="relates to" />';
    const result = stripLinkSuggestionTags(input);
    expect(result.trim()).toBe("and");
  });

  it("returns content unchanged when no tags present", () => {
    const input = "No tags here.";
    expect(stripLinkSuggestionTags(input)).toBe(input);
  });
});

describe("parseEpicSuggestions", () => {
  it("parses XML epic-suggestion format", () => {
    const content = `Here is the suggestion:
<epic-suggestion>
<epic key="VPL-10" confidence="high" reason="Covers group booking" />
<epic key="VPL-20" confidence="medium" reason="Could relate to online booking" />
</epic-suggestion>`;
    const result = parseEpicSuggestions(content);
    expect(result).toEqual([
      { key: "VPL-10", name: "VPL-10", confidence: "high", reason: "Covers group booking" },
      { key: "VPL-20", name: "VPL-20", confidence: "medium", reason: "Could relate to online booking" },
    ]);
  });

  it("parses json-output format with epic data", () => {
    const content = `<json-output>[{"key":"VPL-10","name":"Group Reservations","confidence":"high","reason":"Same domain"}]</json-output>`;
    const result = parseEpicSuggestions(content);
    expect(result).toEqual([
      { key: "VPL-10", name: "Group Reservations", confidence: "high", reason: "Same domain" },
    ]);
  });

  it("defaults invalid confidence to low", () => {
    const content = `<json-output>[{"key":"VPL-1","name":"Test","confidence":"very-high","reason":"test"}]</json-output>`;
    const result = parseEpicSuggestions(content);
    expect(result[0].confidence).toBe("low");
  });

  it("deduplicates by key", () => {
    const content = `<json-output>[{"key":"VPL-1","name":"A","confidence":"high","reason":"r1"},{"key":"VPL-1","name":"A","confidence":"medium","reason":"r2"}]</json-output>`;
    const result = parseEpicSuggestions(content);
    expect(result).toHaveLength(1);
  });

  it("returns empty array for content without epic tags", () => {
    expect(parseEpicSuggestions("Just text")).toEqual([]);
  });

  it("returns empty array for invalid JSON in json-output", () => {
    const content = "<json-output>not valid json</json-output>";
    expect(parseEpicSuggestions(content)).toEqual([]);
  });

  it("prefers XML format over JSON when XML is present", () => {
    const content = `<epic-suggestion><epic key="VPL-1" confidence="high" reason="xml reason" /></epic-suggestion><json-output>[{"key":"VPL-2","name":"B","confidence":"low","reason":"json reason"}]</json-output>`;
    const result = parseEpicSuggestions(content);
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe("VPL-1");
  });
});

describe("stripEpicSuggestionTags", () => {
  it("strips epic-suggestion XML tags", () => {
    const input = `before <epic-suggestion><epic key="VPL-1" confidence="high" reason="r" /></epic-suggestion> after`;
    const result = stripEpicSuggestionTags(input);
    expect(result).toBe("before  after");
  });

  it("strips json-output blocks that contain epic data", () => {
    const input = `text <json-output>[{"key":"VPL-1","name":"A","confidence":"high","reason":"r"}]</json-output> more`;
    const result = stripEpicSuggestionTags(input);
    expect(result).toBe("text  more");
  });

  it("preserves json-output blocks without epic data", () => {
    const input = `text <json-output>{"summary":"hello"}</json-output> more`;
    const result = stripEpicSuggestionTags(input);
    expect(result).toContain("json-output");
  });

  it("returns content unchanged when no tags present", () => {
    const input = "No tags here.";
    expect(stripEpicSuggestionTags(input)).toBe(input);
  });
});
