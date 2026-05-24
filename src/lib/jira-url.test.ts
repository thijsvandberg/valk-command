// @vitest-environment node
import { describe, it, expect } from "vitest";
import { getJiraUrl } from "./jira-url";

describe("getJiraUrl", () => {
  it("builds a Jira browse URL from a ticket key", () => {
    const url = getJiraUrl("BRDG-42");
    expect(url).toContain("/browse/BRDG-42");
  });

  it("uses the base URL from env", () => {
    const url = getJiraUrl("TEST-1");
    expect(url).toMatch(/^https?:\/\/.+\/browse\/TEST-1$/);
  });
});
