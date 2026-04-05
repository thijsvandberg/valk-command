import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const WORKFLOW_PATH = resolve(__dirname, "changelog.yml");

describe("changelog workflow", () => {
  const content = readFileSync(WORKFLOW_PATH, "utf-8");

  it("triggers on pushes to both main and dev branches", () => {
    expect(content).toMatch(/branches:\s*\[.*main.*\]/);
    expect(content).toMatch(/branches:\s*\[.*dev.*\]/);
  });

  it("uses [skip ci] in the commit message to prevent infinite loops", () => {
    expect(content).toContain("[skip ci]");
  });

  it("fetches full git history for accurate changelog generation", () => {
    expect(content).toContain("fetch-depth: 0");
  });
});
