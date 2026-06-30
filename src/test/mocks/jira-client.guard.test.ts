import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import * as realJiraClient from "@/lib/jira-client";
import { createJiraClientMock } from "./jira-client";

// BRDG-450 guard tests. They protect the single-source-of-truth jira-client
// mock so that adding a jira-client export, or hand-rolling a new inline mock,
// fails HERE (one named test) instead of silently breaking unrelated route
// tests at module-mock time (the BRDG-414/439/413 failure class).

describe("BRDG-450: createJiraClientMock is a complete mock of @/lib/jira-client", () => {
  it("covers every runtime export of @/lib/jira-client", () => {
    // A `vi.mock("@/lib/jira-client", () => createJiraClientMock())` fully
    // replaces the module, so any real export the factory omits becomes
    // `undefined` and crashes code-under-test that calls it. Keep the factory a
    // superset of the real module. To fix a failure here: add the missing key
    // to src/test/mocks/jira-client.ts (NOT to individual test files).
    const factoryKeys = new Set(Object.keys(createJiraClientMock()));
    const missing = Object.keys(realJiraClient).filter(
      (key) => !factoryKeys.has(key),
    );
    expect(missing).toEqual([]);
  });
});

describe("BRDG-450: every jira-client mock goes through the factory", () => {
  // Built as a string so this guard file does not match its own scan.
  const NEEDLE = ["vi.mock(", '"@/lib/jira-client"'].join("");
  const FACTORY_REF = "createJiraClientMock";

  // Files that legitimately reference the module without the factory. None
  // today; list each with a reason if one is ever genuinely needed.
  const ALLOWED = new Set<string>([]);

  function walkTestFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...walkTestFiles(full));
      else if (/\.test\.tsx?$/.test(entry.name)) out.push(full);
    }
    return out;
  }

  it("uses createJiraClientMock (no hand-rolled inline mocks)", () => {
    const root = join(process.cwd(), "src");
    const offenders: string[] = [];
    for (const file of walkTestFiles(root)) {
      if (ALLOWED.has(file)) continue;
      const src = readFileSync(file, "utf8");
      if (src.includes(NEEDLE) && !src.includes(FACTORY_REF)) {
        offenders.push(file.replace(`${process.cwd()}/`, ""));
      }
    }
    expect(offenders).toEqual([]);
  });
});
