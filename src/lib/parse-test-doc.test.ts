import { describe, expect, it } from "vitest";
import { parseTestDoc } from "./parse-test-doc";

const wrap = (body: string) => `Some preamble text\n<test-doc>\n${body}\n</test-doc>\ntrailing`;

describe("parseTestDoc", () => {
  it("parses a valid ok block", () => {
    const result = parseTestDoc(
      wrap(
        JSON.stringify({
          classification: "ok",
          markdown: "**Title**\n\n- Confirm the thing",
        }),
      ),
    );
    expect(result).toEqual({
      classification: "ok",
      markdown: "**Title**\n\n- Confirm the thing",
    });
  });

  it("parses needs_input and not_stakeholder_relevant classifications", () => {
    for (const classification of ["needs_input", "not_stakeholder_relevant"]) {
      const result = parseTestDoc(
        wrap(JSON.stringify({ classification, markdown: "**T**\n\n- line" })),
      );
      expect(result?.classification).toBe(classification);
    }
  });

  it("degrades an unknown classification to ok instead of dropping the doc", () => {
    const result = parseTestDoc(
      wrap(JSON.stringify({ classification: "banana", markdown: "**T**\n\n- line" })),
    );
    expect(result).toEqual({ classification: "ok", markdown: "**T**\n\n- line" });
  });

  it("returns null when the block is absent", () => {
    expect(parseTestDoc("no block here")).toBeNull();
  });

  it("returns null on malformed JSON", () => {
    expect(parseTestDoc(wrap("{ not json"))).toBeNull();
  });

  it("returns null on empty or missing markdown", () => {
    expect(parseTestDoc(wrap(JSON.stringify({ classification: "ok", markdown: "  " })))).toBeNull();
    expect(parseTestDoc(wrap(JSON.stringify({ classification: "ok" })))).toBeNull();
  });

  it("returns null on array or scalar bodies", () => {
    expect(parseTestDoc(wrap("[1,2]"))).toBeNull();
    expect(parseTestDoc(wrap('"string"'))).toBeNull();
  });
});
