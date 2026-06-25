// @vitest-environment node
import { describe, it, expect } from "vitest";
import { parseRelatedRequest, stripRelatedRequestTags } from "./parse-related-request";

describe("parseRelatedRequest", () => {
  it("parses query and sprint", () => {
    const out = 'Sure.\n<related-request query="domain resolving" sprint="139" />';
    expect(parseRelatedRequest(out)).toEqual({ query: "domain resolving", sprint: "139" });
  });

  it("parses a query without a sprint", () => {
    expect(parseRelatedRequest('<related-request query="booking link" />')).toEqual({
      query: "booking link",
      sprint: null,
    });
  });

  it("is tolerant of attribute order", () => {
    expect(parseRelatedRequest('<related-request sprint="BT 139" query="rate plan" />')).toEqual({
      query: "rate plan",
      sprint: "BT 139",
    });
  });

  it("treats an empty sprint attribute as null", () => {
    expect(parseRelatedRequest('<related-request query="x" sprint="" />')).toEqual({
      query: "x",
      sprint: null,
    });
  });

  it("trims whitespace in values", () => {
    expect(parseRelatedRequest('<related-request query="  spaced  " sprint="  12  " />')).toEqual({
      query: "spaced",
      sprint: "12",
    });
  });

  it("returns null when the tag is absent", () => {
    expect(parseRelatedRequest("no tag here")).toBeNull();
  });

  it("returns null when query is empty", () => {
    expect(parseRelatedRequest('<related-request query="" sprint="139" />')).toBeNull();
  });

  it("does not match the find-related output tag", () => {
    expect(parseRelatedRequest('<related-stories>[]</related-stories>')).toBeNull();
  });
});

describe("stripRelatedRequestTags", () => {
  it("removes the signal tag from displayed content", () => {
    const out = 'Looking now. <related-request query="x" sprint="139" /> done';
    expect(stripRelatedRequestTags(out)).toBe("Looking now.  done");
  });

  it("removes a paired form too", () => {
    expect(stripRelatedRequestTags('<related-request query="x"></related-request>')).toBe("");
  });
});
