import { describe, it, expect } from "vitest";
import { detectConfluenceUrls } from "./confluence-url-detector";

const BASE = "https://mycompany.atlassian.net";

describe("detectConfluenceUrls", () => {
  it("detects long-form page URLs", () => {
    const text = `Check ${BASE}/wiki/spaces/ENG/pages/12345/My+Page for details`;
    const results = detectConfluenceUrls(text, BASE);
    expect(results).toHaveLength(1);
    expect(results[0].pageId).toBe("12345");
  });

  it("detects short-form URLs", () => {
    const text = `See ${BASE}/wiki/x/abc123 for more`;
    const results = detectConfluenceUrls(text, BASE);
    expect(results).toHaveLength(1);
    expect(results[0].pageId).toBe("abc123");
  });

  it("detects multiple URLs in the same text", () => {
    const text = [
      `Page 1: ${BASE}/wiki/spaces/ENG/pages/111/First`,
      `Page 2: ${BASE}/wiki/spaces/ENG/pages/222/Second`,
      `Short: ${BASE}/wiki/x/shortId`,
    ].join("\n");
    const results = detectConfluenceUrls(text, BASE);
    expect(results).toHaveLength(3);
    expect(results.map((r) => r.pageId)).toEqual(["111", "222", "shortId"]);
  });

  it("deduplicates by pageId", () => {
    const text = [
      `${BASE}/wiki/spaces/ENG/pages/111/First`,
      `${BASE}/wiki/spaces/ENG/pages/111/Duplicate`,
    ].join("\n");
    const results = detectConfluenceUrls(text, BASE);
    expect(results).toHaveLength(1);
  });

  it("returns empty array for empty text", () => {
    expect(detectConfluenceUrls("", BASE)).toEqual([]);
  });

  it("returns empty array for empty baseUrl", () => {
    expect(detectConfluenceUrls("some text", "")).toEqual([]);
  });

  it("ignores URLs from a different base", () => {
    const text = `${BASE}/wiki/spaces/ENG/pages/111/Test`;
    const results = detectConfluenceUrls(text, "https://other.atlassian.net");
    expect(results).toHaveLength(0);
  });
});
